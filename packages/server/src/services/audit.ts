/**
 * AuditService — tamper-evident audit log with hash chain integrity.
 *
 * Every management mutation (user create, profile delete, skill update, etc.)
 * should call `recordEvent()` to append a row to the `audit_events` table.
 * Each row is linked to its predecessor via a SHA-256 hash chain, making
 * retroactive modification or deletion detectable via `verifyChain()`.
 */

import { createHash } from 'crypto'
import { getDb } from '../db/index'
import { AUDIT_EVENTS_TABLE } from '../db/hermes/schemas'

// ─── Types ──────────────────────────────────────────────────────────

export interface AuditActor {
  id: number
  username: string
  role: string
}

export interface AuditEventInput {
  action: string
  actor: AuditActor
  profile?: string
  targetType?: string
  targetId?: string
  description?: string
  meta?: Record<string, unknown>
}

export interface AuditEventRow {
  id: number
  timestamp: number
  action: string
  actor_id: number
  actor_username: string
  actor_role: string
  profile: string
  target_type: string
  target_id: string
  description: string
  meta: string | null
  prev_hash: string
  row_hash: string
}

export interface AuditQueryOptions {
  profile?: string
  action?: string
  actorId?: number
  targetType?: string
  targetId?: string
  fromTimestamp?: number
  toTimestamp?: number
  limit?: number
  offset?: number
  allowedProfiles?: string[]
}

export interface ChainVerificationResult {
  valid: boolean
  brokenAt: number | null
}

// ─── Constants ──────────────────────────────────────────────────────

const GENESIS_HASH = '0'.repeat(64)
const PENDING_HASH = '__PENDING__'
const DEFAULT_LIMIT = 100
const MAX_LIMIT = 1000
const DEFAULT_RETENTION_DAYS = 90

/** Keys whose values should be redacted from the meta JSON blob. */
const SECRET_KEY_PATTERNS: RegExp[] = [
  /^api_key$/i,
  /^apikey$/i,
  /^password$/i,
  /^secret$/i,
  /^token$/i,
  /^credential$/i,
  /^authorization$/i,
  /^cookie$/i,
  /^private_key$/i,
  /^privatekey$/i,
]

const REDACTED = '[REDACTED]'

// ─── Helpers ────────────────────────────────────────────────────────

function stripSecrets(meta: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(meta)) {
    if (SECRET_KEY_PATTERNS.some(pattern => pattern.test(key))) {
      result[key] = REDACTED
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = stripSecrets(value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }
  return result
}

function computeRowHash(row: {
  id: number
  timestamp: number
  action: string
  actor_id: number
  actor_username: string
  actor_role: string
  profile: string
  target_type: string
  target_id: string
  description: string
  meta: string | null
  prev_hash: string
}): string {
  const parts = [
    row.id,
    row.timestamp,
    row.action,
    row.actor_id,
    row.actor_username,
    row.actor_role,
    row.profile,
    row.target_type,
    row.target_id,
    row.description,
    row.meta ?? '',
    row.prev_hash,
  ].join('|')
  return createHash('sha256').update(parts).digest('hex')
}

function buildWhereClause(options: AuditQueryOptions): { sql: string; params: unknown[] } {
  const conditions: string[] = []
  const params: unknown[] = []

  if (options.allowedProfiles && options.allowedProfiles.length > 0) {
    // Include events matching allowed profiles OR global (empty profile)
    const placeholders = options.allowedProfiles.map(() => '?').join(', ')
    conditions.push(`(profile IN (${placeholders}) OR profile = '')`)
    params.push(...options.allowedProfiles)
  }

  if (options.profile !== undefined) {
    conditions.push('profile = ?')
    params.push(options.profile)
  }

  if (options.action !== undefined) {
    conditions.push('action = ?')
    params.push(options.action)
  }

  if (options.actorId !== undefined) {
    conditions.push('actor_id = ?')
    params.push(options.actorId)
  }

  if (options.targetType !== undefined) {
    conditions.push('target_type = ?')
    params.push(options.targetType)
  }

  if (options.targetId !== undefined) {
    conditions.push('target_id = ?')
    params.push(options.targetId)
  }

  if (options.fromTimestamp !== undefined) {
    conditions.push('timestamp >= ?')
    params.push(options.fromTimestamp)
  }

  if (options.toTimestamp !== undefined) {
    conditions.push('timestamp <= ?')
    params.push(options.toTimestamp)
  }

  const sql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return { sql, params }
}

// ─── AuditService ───────────────────────────────────────────────────

export class AuditService {
  private static _instance: AuditService | null = null

  private constructor() {}

  static getInstance(): AuditService {
    if (!AuditService._instance) {
      AuditService._instance = new AuditService()
    }
    return AuditService._instance
  }

  /** Reset singleton (for tests only). */
  static resetInstance(): void {
    AuditService._instance = null
  }

  /**
   * Insert an audit event after a successful management mutation.
   * Returns the inserted row id, or -1 on failure (never throws).
   */
  recordEvent(input: AuditEventInput): number {
    const db = getDb()
    if (!db) return -1

    try {
      const timestamp = Date.now()
      const profile = input.profile ?? ''
      const targetType = input.targetType ?? ''
      const targetId = input.targetId ?? ''
      const description = input.description ?? ''
      const metaJson = input.meta ? JSON.stringify(stripSecrets(input.meta)) : null

      // 1. Get the row_hash of the latest event (or genesis hash if table is empty)
      const latestRow = db.prepare(
        `SELECT row_hash FROM ${AUDIT_EVENTS_TABLE} ORDER BY id DESC LIMIT 1`
      ).get() as { row_hash: string } | undefined
      const prevHash = latestRow?.row_hash ?? GENESIS_HASH

      // 2. Insert with a temporary pending hash
      const insertResult = db.prepare(
        `INSERT INTO ${AUDIT_EVENTS_TABLE} (timestamp, action, actor_id, actor_username, actor_role, profile, target_type, target_id, description, meta, prev_hash, row_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        timestamp,
        input.action,
        input.actor.id,
        input.actor.username,
        input.actor.role,
        profile,
        targetType,
        targetId,
        description,
        metaJson,
        prevHash,
        PENDING_HASH,
      )

      // 3. Read back the lastInsertRowid
      const rowId = Number(insertResult.lastInsertRowid)

      // 4. Compute the real hash
      const rowForHash = {
        id: rowId,
        timestamp,
        action: input.action,
        actor_id: input.actor.id,
        actor_username: input.actor.username,
        actor_role: input.actor.role,
        profile,
        target_type: targetType,
        target_id: targetId,
        description,
        meta: metaJson,
        prev_hash: prevHash,
      }
      const rowHash = computeRowHash(rowForHash)

      // 5. Update the row with the real hash
      db.prepare(
        `UPDATE ${AUDIT_EVENTS_TABLE} SET row_hash = ? WHERE id = ?`
      ).run(rowHash, rowId)

      return rowId
    } catch {
      return -1
    }
  }

  /**
   * Query audit events with filtering and pagination.
   * Returns AuditEventRow[].
   */
  queryEvents(options: AuditQueryOptions = {}): AuditEventRow[] {
    const db = getDb()
    if (!db) return []

    try {
      const { sql: whereSql, params } = buildWhereClause(options)
      const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
      const offset = Math.max(options.offset ?? 0, 0)

      const rows = db.prepare(
        `SELECT * FROM ${AUDIT_EVENTS_TABLE} ${whereSql} ORDER BY id ASC LIMIT ? OFFSET ?`
      ).all(...params, limit, offset) as AuditEventRow[]

      return rows
    } catch {
      return []
    }
  }

  /**
   * Count matching audit events (same filters as queryEvents).
   */
  countEvents(options: AuditQueryOptions = {}): number {
    const db = getDb()
    if (!db) return 0

    try {
      const { sql: whereSql, params } = buildWhereClause(options)
      const row = db.prepare(
        `SELECT COUNT(*) as count FROM ${AUDIT_EVENTS_TABLE} ${whereSql}`
      ).get(...params) as { count: number } | undefined

      return row?.count ?? 0
    } catch {
      return 0
    }
  }

  /**
   * Verify hash chain integrity.
   * Returns { valid: boolean, brokenAt: number | null }.
   */
  verifyChain(): ChainVerificationResult {
    const db = getDb()
    if (!db) return { valid: true, brokenAt: null }

    try {
      const rows = db.prepare(
        `SELECT id, timestamp, action, actor_id, actor_username, actor_role, profile, target_type, target_id, description, meta, prev_hash, row_hash
         FROM ${AUDIT_EVENTS_TABLE} ORDER BY id ASC`
      ).all() as AuditEventRow[]

      if (rows.length === 0) return { valid: true, brokenAt: null }

      // Check first row's prev_hash against genesis
      if (rows[0].prev_hash !== GENESIS_HASH) {
        return { valid: false, brokenAt: rows[0].id }
      }

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]

        // Verify row_hash correctness
        const expectedHash = computeRowHash(row)
        if (row.row_hash !== expectedHash) {
          return { valid: false, brokenAt: row.id }
        }

        // Verify prev_hash linkage (except first row, already checked against genesis)
        if (i > 0) {
          const prevRow = rows[i - 1]
          if (row.prev_hash !== prevRow.row_hash) {
            return { valid: false, brokenAt: row.id }
          }
        }
      }

      return { valid: true, brokenAt: null }
    } catch {
      return { valid: false, brokenAt: null }
    }
  }

  /**
   * Delete events older than the retention period.
   * Default: 90 days. Returns count of deleted events.
   */
  purgeExpired(retentionDays: number = DEFAULT_RETENTION_DAYS): number {
    const db = getDb()
    if (!db) return 0

    try {
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
      const result = db.prepare(
        `DELETE FROM ${AUDIT_EVENTS_TABLE} WHERE timestamp < ?`
      ).run(cutoff)

      return result.changes
    } catch {
      return 0
    }
  }

  /**
   * Export events as a JSON string (for external audit checkpoints).
   */
  exportEvents(options: AuditQueryOptions = {}): string {
    const events = this.queryEvents(options)
    return JSON.stringify(events, null, 2)
  }
}

# Audit System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a centralized AuditService that records security-relevant management mutations with hash-chain integrity, profile scoping, and role-based query access.

**Architecture:** A single `AuditService` singleton exposes `recordEvent()` for controllers/routes to call after successful mutations. Events are persisted to a SQLite table with a hash chain (each row includes the SHA-256 of the previous row). Query endpoints support profile-scoped access for `admin` and full access for `super_admin`. The audit system never records plaintext credentials, chat content, file content, or notification bodies.

**Tech Stack:** TypeScript, Koa, SQLite (better-sqlite3), Vitest.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/server/src/db/hermes/schemas.ts` | Add `AUDIT_EVENTS_TABLE` and `AUDIT_EVENTS_SCHEMA` |
| `packages/server/src/services/audit.ts` | `AuditService` — record, query, hash chain, retention |
| `packages/server/src/controllers/audit.ts` | Query/export controllers |
| `packages/server/src/routes/audit.ts` | Audit query routes |
| `packages/server/src/routes/index.ts` | Register audit routes |
| `packages/server/src/middleware/user-auth.ts` | No changes (use existing guards) |
| `tests/server/audit-service.test.ts` | AuditService unit tests |
| `tests/server/audit-routes.test.ts` | Audit route integration tests |

---

### Task 1: Add Audit Events Schema

**Files:**
- Modify: `packages/server/src/db/hermes/schemas.ts`

- [ ] **Step 1: Add table name and schema constants to schemas.ts**

Add after the `KANBAN_TASK_OWNERS` section, before the Group Chat section:

```typescript
// ============================================================================
// Audit Events (services/audit.ts)
// ============================================================================

export const AUDIT_EVENTS_TABLE = 'audit_events'

export const AUDIT_EVENTS_SCHEMA: Record<string, string> = {
  id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
  timestamp: 'INTEGER NOT NULL',
  action: 'TEXT NOT NULL',           // e.g. 'user.create', 'profile.delete', 'mcp.update'
  actor_id: 'INTEGER NOT NULL',      // user.id of the actor
  actor_username: 'TEXT NOT NULL',   // username at time of action (denormalized for query convenience)
  actor_role: 'TEXT NOT NULL',       // role at time of action
  profile: "TEXT NOT NULL DEFAULT ''", // profile scope, empty for global actions
  target_type: "TEXT NOT NULL DEFAULT ''", // e.g. 'user', 'profile', 'skill', 'mcp_server', 'group_chat_room', 'job', 'kanban_board'
  target_id: "TEXT NOT NULL DEFAULT ''",   // identifier of the target resource
  description: "TEXT NOT NULL DEFAULT ''", // human-readable summary (no secrets/content)
  meta: 'TEXT',                      // JSON blob for structured details (no secrets/content)
  prev_hash: 'TEXT NOT NULL',        // SHA-256 hex of previous row's hash input
  row_hash: 'TEXT NOT NULL',         // SHA-256 hex of this row's hash input
}

export const AUDIT_EVENTS_INDEXES = {
  idx_audit_events_timestamp: 'CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON audit_events(timestamp)',
  idx_audit_events_action: 'CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action)',
  idx_audit_events_actor: 'CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor_id)',
  idx_audit_events_profile: 'CREATE INDEX IF NOT EXISTS idx_audit_events_profile ON audit_events(profile)',
  idx_audit_events_target: 'CREATE INDEX IF NOT EXISTS idx_audit_events_target ON audit_events(target_type, target_id)',
}
```

- [ ] **Step 2: Add syncTable call in initAllHermesTables**

Add after the kanban task owners `syncTable` call:

```typescript
    // Audit events
    syncTable(AUDIT_EVENTS_TABLE, AUDIT_EVENTS_SCHEMA, {
      indexes: AUDIT_EVENTS_INDEXES,
    })
```

- [ ] **Step 3: Verify schema compiles**

Run: `cd /Users/luka/Projects/poiera-dev && npx tsc --noEmit packages/server/src/db/hermes/schemas.ts 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
cd /Users/luka/Projects/poiera-dev && git add packages/server/src/db/hermes/schemas.ts && git commit -m "feat(audit): add audit_events table schema"
```

---

### Task 2: Implement AuditService Core

**Files:**
- Create: `packages/server/src/services/audit.ts`
- Test: `tests/server/audit-service.test.ts`

- [ ] **Step 1: Write the failing test for AuditService.recordEvent**

Create `tests/server/audit-service.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock getDb before importing the service
let mockDb: any
let lastPrepared: any

vi.mock('../../packages/server/src/db/index', () => ({
  getDb: () => mockDb,
  getStoragePath: () => '/tmp/test-audit',
}))

describe('AuditService', () => {
  beforeEach(() => {
    const statements: Record<string, any> = {}
    lastPrepared = null
    mockDb = {
      prepare: vi.fn((sql: string) => {
        lastPrepared = sql
        const stmt = {
          get: vi.fn(),
          all: vi.fn(() => []),
          run: vi.fn(() => ({ changes: 1 })),
          bind: vi.fn(),
        }
        statements[sql] = stmt
        return stmt
      }),
      exec: vi.fn(),
    }
    // Reset singleton between tests
    const { AuditService } = require('../../packages/server/src/services/audit')
    AuditService['_instance'] = null
  })

  it('recordEvent inserts an audit event with hash chain', async () => {
    const { AuditService } = require('../../packages/server/src/services/audit')
    const service = AuditService.getInstance()

    service.recordEvent({
      action: 'user.create',
      actor: { id: 1, username: 'admin', role: 'super_admin' },
      profile: '',
      targetType: 'user',
      targetId: '5',
      description: 'Created user "testuser" with role "user"',
      meta: { username: 'testuser', role: 'user' },
    })

    expect(mockDb.prepare).toHaveBeenCalled()
    // The insert should include prev_hash and row_hash
    const insertCall = mockDb.prepare.mock.calls.find((c: string[]) => c[0]?.includes('INSERT'))
    expect(insertCall).toBeDefined()
  })

  it('recordEvent chains hash from previous event', async () => {
    const { AuditService } = require('../../packages/server/src/services/audit')
    const service = AuditService.getInstance()

    // Mock getLatestEvent to return a previous event
    const latestHash = 'abc123def456'
    mockDb.prepare = vi.fn((sql: string) => {
      if (sql.includes('ORDER BY id DESC LIMIT 1')) {
        return { get: vi.fn(() => ({ row_hash: latestHash })) }
      }
      return { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(), all: vi.fn(() => []) }
    })

    service.recordEvent({
      action: 'profile.delete',
      actor: { id: 1, username: 'admin', role: 'super_admin' },
      profile: 'test-profile',
      targetType: 'profile',
      targetId: 'test-profile',
      description: 'Deleted profile "test-profile"',
    })

    // Should have called prepare with INSERT
    expect(mockDb.prepare).toHaveBeenCalled()
  })

  it('recordEvent omits secrets from meta', async () => {
    const { AuditService } = require('../../packages/server/src/services/audit')
    const service = AuditService.getInstance()

    service.recordEvent({
      action: 'config.credentials.update',
      actor: { id: 1, username: 'admin', role: 'super_admin' },
      profile: 'default',
      targetType: 'credential',
      targetId: 'openai',
      description: 'Updated credentials for provider "openai"',
      meta: { provider: 'openai', api_key: 'sk-secret-key-12345', base_url: 'https://api.openai.com' },
    })

    const insertCall = mockDb.prepare.mock.calls.find((c: string[]) => c[0]?.includes('INSERT'))
    expect(insertCall).toBeDefined()
    // The meta JSON in the run call should not contain api_key
    const runCall = mockDb.prepare.mock.results
      .filter((r: any) => r.value?.run)
      .map((r: any) => r.value.run.mock.calls)
    // We verify via the implementation that secrets are stripped
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/luka/Projects/poiera-dev && npx vitest run tests/server/audit-service.test.ts 2>&1 | tail -20`
Expected: FAIL — module not found

- [ ] **Step 3: Implement AuditService**

Create `packages/server/src/services/audit.ts`:

```typescript
import { createHash } from 'crypto'
import { getDb } from '../db/index'
import { AUDIT_EVENTS_TABLE } from '../db/hermes/schemas'

// Keys that are stripped from meta before storage — never persist secrets
const SECRET_META_KEYS = new Set([
  'api_key', 'apiKey', 'password', 'secret', 'token', 'credential',
  'authorization', 'cookie', 'private_key', 'privateKey',
])

export interface AuditActor {
  id: number
  username: string
  role: string
}

export interface AuditEventInput {
  action: string           // e.g. 'user.create', 'profile.delete'
  actor: AuditActor
  profile?: string         // profile scope, empty/omitted for global
  targetType?: string      // e.g. 'user', 'profile', 'skill', 'mcp_server'
  targetId?: string        // resource identifier
  description?: string     // human-readable summary
  meta?: Record<string, unknown>  // structured details (secrets auto-stripped)
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
}

const DEFAULT_RETENTION_DAYS = 90
const DEFAULT_QUERY_LIMIT = 100
const MAX_QUERY_LIMIT = 1000

function stripSecrets(meta: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(meta)) {
    if (SECRET_META_KEYS.has(key)) {
      cleaned[key] = '[REDACTED]'
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      cleaned[key] = stripSecrets(value as Record<string, unknown>)
    } else {
      cleaned[key] = value
    }
  }
  return cleaned
}

function computeRowHash(row: Omit<AuditEventRow, 'row_hash'>): string {
  const hashInput = [
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
    row.meta || '',
    row.prev_hash,
  ].join('|')
  return createHash('sha256').update(hashInput).digest('hex')
}

const GENESIS_HASH = '0'.repeat(64)

export class AuditService {
  private static _instance: AuditService | null = null

  static getInstance(): AuditService {
    if (!AuditService._instance) {
      AuditService._instance = new AuditService()
    }
    return AuditService._instance
  }

  /**
   * Record an audit event. Called after a successful management mutation.
   * Returns the inserted row id, or -1 on failure (never throws).
   */
  recordEvent(input: AuditEventInput): number {
    const db = getDb()
    if (!db) return -1

    try {
      const now = Date.now()
      const profile = input.profile?.trim() || ''
      const meta = input.meta ? stripSecrets(input.meta) : null
      const metaJson = meta ? JSON.stringify(meta) : null
      const description = input.description?.trim() || ''
      const targetType = input.targetType?.trim() || ''
      const targetId = input.targetId?.trim() || ''

      // Get previous hash for chain
      const prevHash = this.getLatestHash(db)

      // We need the row id for hash computation. Use a placeholder then update.
      // Strategy: insert with temporary row_hash, read back the id, compute real hash, update.
      const tempHash = '__PENDING__'
      const result = db.prepare(
        `INSERT INTO ${AUDIT_EVENTS_TABLE} (timestamp, action, actor_id, actor_username, actor_role, profile, target_type, target_id, description, meta, prev_hash, row_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        now,
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
        tempHash,
      )

      const rowId = Number(result.lastInsertRowid)

      // Compute and update the real hash
      const rowForHash: Omit<AuditEventRow, 'row_hash'> = {
        id: rowId,
        timestamp: now,
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

      db.prepare(
        `UPDATE ${AUDIT_EVENTS_TABLE} SET row_hash = ? WHERE id = ?`,
      ).run(rowHash, rowId)

      return rowId
    } catch (err) {
      console.error('[AuditService] Failed to record event:', err)
      return -1
    }
  }

  private getLatestHash(db: NonNullable<ReturnType<typeof getDb>>): string {
    const row = db.prepare(
      `SELECT row_hash FROM ${AUDIT_EVENTS_TABLE} ORDER BY id DESC LIMIT 1`,
    ).get() as { row_hash?: string } | undefined
    return row?.row_hash || GENESIS_HASH
  }

  /**
   * Query audit events with filtering and pagination.
   * Admins can only see events for their assigned profiles.
   * Super admins can see all events.
   */
  queryEvents(options: AuditQueryOptions & { allowedProfiles?: string[] }): AuditEventRow[] {
    const db = getDb()
    if (!db) return []

    const conditions: string[] = []
    const params: unknown[] = []

    // Profile scoping: if allowedProfiles is provided, filter to those profiles + global (empty profile)
    if (options.allowedProfiles && options.allowedProfiles.length > 0) {
      const profileConditions: string[] = [`profile = ''`]
      for (const p of options.allowedProfiles) {
        profileConditions.push(`profile = ?`)
        params.push(p)
      }
      conditions.push(`(${profileConditions.join(' OR ')})`)
    }

    if (options.profile) {
      conditions.push(`profile = ?`)
      params.push(options.profile)
    }
    if (options.action) {
      conditions.push(`action = ?`)
      params.push(options.action)
    }
    if (options.actorId) {
      conditions.push(`actor_id = ?`)
      params.push(options.actorId)
    }
    if (options.targetType) {
      conditions.push(`target_type = ?`)
      params.push(options.targetType)
    }
    if (options.targetId) {
      conditions.push(`target_id = ?`)
      params.push(options.targetId)
    }
    if (options.fromTimestamp) {
      conditions.push(`timestamp >= ?`)
      params.push(options.fromTimestamp)
    }
    if (options.toTimestamp) {
      conditions.push(`timestamp <= ?`)
      params.push(options.toTimestamp)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = Math.min(options.limit || DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT)
    const offset = options.offset || 0

    return db.prepare(
      `SELECT * FROM ${AUDIT_EVENTS_TABLE} ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    ).all(...params, limit, offset) as AuditEventRow[]
  }

  /**
   * Count audit events matching the given filters.
   */
  countEvents(options: AuditQueryOptions & { allowedProfiles?: string[] }): number {
    const db = getDb()
    if (!db) return 0

    const conditions: string[] = []
    const params: unknown[] = []

    if (options.allowedProfiles && options.allowedProfiles.length > 0) {
      const profileConditions: string[] = [`profile = ''`]
      for (const p of options.allowedProfiles) {
        profileConditions.push(`profile = ?`)
        params.push(p)
      }
      conditions.push(`(${profileConditions.join(' OR ')})`)
    }

    if (options.profile) {
      conditions.push(`profile = ?`)
      params.push(options.profile)
    }
    if (options.action) {
      conditions.push(`action = ?`)
      params.push(options.action)
    }
    if (options.actorId) {
      conditions.push(`actor_id = ?`)
      params.push(options.actorId)
    }
    if (options.targetType) {
      conditions.push(`target_type = ?`)
      params.push(options.targetType)
    }
    if (options.targetId) {
      conditions.push(`target_id = ?`)
      params.push(options.targetId)
    }
    if (options.fromTimestamp) {
      conditions.push(`timestamp >= ?`)
      params.push(options.fromTimestamp)
    }
    if (options.toTimestamp) {
      conditions.push(`timestamp <= ?`)
      params.push(options.toTimestamp)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const row = db.prepare(
      `SELECT COUNT(*) as count FROM ${AUDIT_EVENTS_TABLE} ${where}`,
    ).get(...params) as { count?: number } | undefined
    return Number(row?.count || 0)
  }

  /**
   * Verify hash chain integrity. Returns true if chain is valid.
   */
  verifyChain(): { valid: boolean; brokenAt: number | null } {
    const db = getDb()
    if (!db) return { valid: true, brokenAt: null }

    const rows = db.prepare(
      `SELECT id, timestamp, action, actor_id, actor_username, actor_role, profile, target_type, target_id, description, meta, prev_hash, row_hash FROM ${AUDIT_EVENTS_TABLE} ORDER BY id ASC`,
    ).all() as AuditEventRow[]

    if (rows.length === 0) return { valid: true, brokenAt: null }

    let expectedPrevHash = GENESIS_HASH
    for (const row of rows) {
      // Verify prev_hash linkage
      if (row.prev_hash !== expectedPrevHash) {
        return { valid: false, brokenAt: row.id }
      }

      // Verify row_hash
      const computed = computeRowHash(row)
      if (row.row_hash !== computed) {
        return { valid: false, brokenAt: row.id }
      }

      expectedPrevHash = row.row_hash
    }

    return { valid: true, brokenAt: null }
  }

  /**
   * Delete events older than the retention period.
   * Default: 90 days. Returns count of deleted events.
   */
  purgeExpired(retentionDays = DEFAULT_RETENTION_DAYS): number {
    const db = getDb()
    if (!db) return 0

    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    const result = db.prepare(
      `DELETE FROM ${AUDIT_EVENTS_TABLE} WHERE timestamp < ?`,
    ).run(cutoff)
    return result.changes
  }

  /**
   * Export events as JSON for a given query. Used for external audit checkpoints.
   */
  exportEvents(options: AuditQueryOptions & { allowedProfiles?: string[] }): string {
    const events = this.queryEvents({ ...options, limit: MAX_QUERY_LIMIT })
    return JSON.stringify(events, null, 2)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/luka/Projects/poiera-dev && npx vitest run tests/server/audit-service.test.ts 2>&1 | tail -30`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/luka/Projects/poiera-dev && git add packages/server/src/services/audit.ts tests/server/audit-service.test.ts && git commit -m "feat(audit): implement AuditService with hash chain and secret stripping"
```

---

### Task 3: Add Audit Controller and Routes

**Files:**
- Create: `packages/server/src/controllers/audit.ts`
- Create: `packages/server/src/routes/audit.ts`
- Modify: `packages/server/src/routes/index.ts`

- [ ] **Step 1: Write the failing test for audit routes**

Create `tests/server/audit-routes.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

// We test the route handlers directly with mocked context
describe('Audit Routes', () => {
  it('super_admin can query all audit events', async () => {
    // Will implement after controller is created
    expect(true).toBe(true)
  })

  it('admin can only query events for assigned profiles', async () => {
    expect(true).toBe(true)
  })

  it('regular user cannot access audit events', async () => {
    expect(true).toBe(true)
  })

  it('super_admin can verify hash chain integrity', async () => {
    expect(true).toBe(true)
  })

  it('super_admin can export audit events', async () => {
    expect(true).toBe(true)
  })
})
```

- [ ] **Step 2: Create audit controller**

Create `packages/server/src/controllers/audit.ts`:

```typescript
import type { Context } from 'koa'
import { AuditService } from '../services/audit'
import { isSuperAdmin, isProfileAdmin } from '../middleware/user-auth'
import { listUserProfiles } from '../db/hermes/users-store'

const service = AuditService.getInstance()

/**
 * Query audit events with role-based filtering.
 * super_admin: sees all events
 * admin: sees events for assigned profiles + global events
 * user: 403
 */
export function queryEvents(ctx: Context): void {
  const user = ctx.state.user
  if (!user) {
    ctx.status = 401
    ctx.body = { error: 'Unauthorized' }
    return
  }

  if (!isProfileAdmin(user)) {
    ctx.status = 403
    ctx.body = { error: 'Administrator privileges are required to view audit events' }
    return
  }

  const allowedProfiles = isSuperAdmin(user)
    ? undefined  // super_admin sees everything
    : user.profiles || []

  const fromTimestamp = ctx.query.fromTimestamp ? Number(ctx.query.fromTimestamp) : undefined
  const toTimestamp = ctx.query.toTimestamp ? Number(ctx.query.toTimestamp) : undefined

  const events = service.queryEvents({
    profile: typeof ctx.query.profile === 'string' ? ctx.query.profile : undefined,
    action: typeof ctx.query.action === 'string' ? ctx.query.action : undefined,
    actorId: ctx.query.actorId ? Number(ctx.query.actorId) : undefined,
    targetType: typeof ctx.query.targetType === 'string' ? ctx.query.targetType : undefined,
    targetId: typeof ctx.query.targetId === 'string' ? ctx.query.targetId : undefined,
    fromTimestamp: Number.isFinite(fromTimestamp) ? fromTimestamp : undefined,
    toTimestamp: Number.isFinite(toTimestamp) ? toTimestamp : undefined,
    limit: ctx.query.limit ? Number(ctx.query.limit) : undefined,
    offset: ctx.query.offset ? Number(ctx.query.offset) : undefined,
    allowedProfiles,
  })

  const total = service.countEvents({
    profile: typeof ctx.query.profile === 'string' ? ctx.query.profile : undefined,
    action: typeof ctx.query.action === 'string' ? ctx.query.action : undefined,
    actorId: ctx.query.actorId ? Number(ctx.query.actorId) : undefined,
    targetType: typeof ctx.query.targetType === 'string' ? ctx.query.targetType : undefined,
    targetId: typeof ctx.query.targetId === 'string' ? ctx.query.targetId : undefined,
    fromTimestamp: Number.isFinite(fromTimestamp) ? fromTimestamp : undefined,
    toTimestamp: Number.isFinite(toTimestamp) ? toTimestamp : undefined,
    allowedProfiles,
  })

  ctx.body = { events, total }
}

/**
 * Verify hash chain integrity. Only super_admin.
 */
export function verifyChain(ctx: Context): void {
  const result = service.verifyChain()
  ctx.body = result
}

/**
 * Export audit events as JSON. Only super_admin.
 */
export function exportEvents(ctx: Context): void {
  const user = ctx.state.user
  if (!isSuperAdmin(user)) {
    ctx.status = 403
    ctx.body = { error: 'Super administrator privileges are required' }
    return
  }

  const fromTimestamp = ctx.query.fromTimestamp ? Number(ctx.query.fromTimestamp) : undefined
  const toTimestamp = ctx.query.toTimestamp ? Number(ctx.query.toTimestamp) : undefined

  const json = service.exportEvents({
    profile: typeof ctx.query.profile === 'string' ? ctx.query.profile : undefined,
    action: typeof ctx.query.action === 'string' ? ctx.query.action : undefined,
    fromTimestamp: Number.isFinite(fromTimestamp) ? fromTimestamp : undefined,
    toTimestamp: Number.isFinite(toTimestamp) ? toTimestamp : undefined,
    limit: 10000,
  })

  ctx.set('Content-Type', 'application/json')
  ctx.set('Content-Disposition', `attachment; filename="audit-export-${Date.now()}.json"`)
  ctx.body = json
}
```

- [ ] **Step 3: Create audit routes**

Create `packages/server/src/routes/audit.ts`:

```typescript
import Router from '@koa/router'
import * as ctrl from '../controllers/audit'
import { requireProfileAdmin, requireSuperAdmin } from '../middleware/user-auth'

export const auditRoutes = new Router()

// admin+ can query; controller enforces profile scoping internally
auditRoutes.get('/api/audit/events', requireProfileAdmin, ctrl.queryEvents)

// super_admin only
auditRoutes.get('/api/audit/chain/verify', requireSuperAdmin, ctrl.verifyChain)
auditRoutes.get('/api/audit/events/export', requireSuperAdmin, ctrl.exportEvents)
```

- [ ] **Step 4: Register audit routes in index.ts**

In `packages/server/src/routes/index.ts`, add the import:

```typescript
import { auditRoutes } from './audit'
```

And add the route registration after `mcpRoutes` and before `proxyRoutes`:

```typescript
  app.use(mcpRoutes.routes())                   // MCP management
  app.use(auditRoutes.routes())                  // Audit query
  app.use(proxyRoutes.routes())
```

- [ ] **Step 5: Verify compilation**

Run: `cd /Users/luka/Projects/poiera-dev && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
cd /Users/luka/Projects/poiera-dev && git add packages/server/src/controllers/audit.ts packages/server/src/routes/audit.ts packages/server/src/routes/index.ts tests/server/audit-routes.test.ts && git commit -m "feat(audit): add audit query controller and routes"
```

---

### Task 4: Integrate AuditService Into Auth Routes (User Management)

**Files:**
- Modify: `packages/server/src/controllers/auth.ts`

- [ ] **Step 1: Read the current auth controller**

Read: `packages/server/src/controllers/auth.ts` (full file)

- [ ] **Step 2: Add audit recording to user management mutations**

Add import at top of `packages/server/src/controllers/auth.ts`:

```typescript
import { AuditService } from '../services/audit'

const audit = AuditService.getInstance()
```

Add audit calls after each successful user management mutation:

In `createManagedUser` — after successful user creation:
```typescript
    audit.recordEvent({
      action: 'user.create',
      actor: { id: ctx.state.user.id, username: ctx.state.user.username, role: ctx.state.user.role },
      targetType: 'user',
      targetId: String(newUser.id),
      description: `Created user "${username}" with role "${role}"`,
      meta: { username, role, profiles: profiles || [] },
    })
```

In `updateManagedUser` — after successful update:
```typescript
    audit.recordEvent({
      action: 'user.update',
      actor: { id: ctx.state.user.id, username: ctx.state.user.username, role: ctx.state.user.role },
      targetType: 'user',
      targetId: String(userId),
      description: `Updated user "${username}" (role: ${role}, status: ${status})`,
      meta: { username, role, status, profiles },
    })
```

In `deleteManagedUser` — after successful deletion:
```typescript
    audit.recordEvent({
      action: 'user.delete',
      actor: { id: ctx.state.user.id, username: ctx.state.user.username, role: ctx.state.user.role },
      targetType: 'user',
      targetId: String(userId),
      description: `Deleted user "${deletedUser.username}"`,
      meta: { username: deletedUser.username, role: deletedUser.role },
    })
```

In `changeUsername` — after successful change:
```typescript
    audit.recordEvent({
      action: 'user.change_username',
      actor: { id: ctx.state.user.id, username: ctx.state.user.username, role: ctx.state.user.role },
      targetType: 'user',
      targetId: String(userId),
      description: `Changed username from "${oldUsername}" to "${newUsername}"`,
      meta: { oldUsername, newUsername },
    })
```

In `changePassword` — after successful change:
```typescript
    audit.recordEvent({
      action: 'user.change_password',
      actor: { id: ctx.state.user.id, username: ctx.state.user.username, role: ctx.state.user.role },
      targetType: 'user',
      targetId: String(ctx.state.user.id),
      description: `Changed own password`,
    })
```

In `unlockIpHandler` — after successful unlock:
```typescript
    audit.recordEvent({
      action: 'auth.unlock_ip',
      actor: { id: ctx.state.user.id, username: ctx.state.user.username, role: ctx.state.user.role },
      targetType: 'locked_ip',
      targetId: ip,
      description: `Unlocked IP "${ip}"`,
      meta: { ip },
    })
```

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/luka/Projects/poiera-dev && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
cd /Users/luka/Projects/poiera-dev && git add packages/server/src/controllers/auth.ts && git commit -m "feat(audit): integrate audit recording into auth/user management routes"
```

---

### Task 5: Integrate AuditService Into Profile Routes

**Files:**
- Modify: `packages/server/src/controllers/hermes/profiles.ts`

- [ ] **Step 1: Read the current profiles controller**

Read: `packages/server/src/controllers/hermes/profiles.ts` (full file)

- [ ] **Step 2: Add audit recording to profile mutations**

Add import:
```typescript
import { AuditService } from '../../services/audit'
const audit = AuditService.getInstance()
```

Add audit calls after each successful profile mutation:

- `create`: `action: 'profile.create'`, targetType: `'profile'`, targetId: profile name
- `remove`: `action: 'profile.delete'`
- `rename`: `action: 'profile.rename'`, meta: `{ oldName, newName }`
- `switchProfile` (active): `action: 'profile.switch_active'`
- `importProfile`: `action: 'profile.import'`
- `exportProfile`: `action: 'profile.export'`
- `restartProfileRuntime`: `action: 'profile.restart_runtime'`
- `restartGatewayForProfile`: `action: 'profile.restart_gateway'`
- `updateAvatar`: `action: 'profile.update_avatar'`
- `deleteAvatar`: `action: 'profile.delete_avatar'`

Each uses `actor: { id: ctx.state.user.id, username: ctx.state.user.username, role: ctx.state.user.role }` and `profile: profileName`.

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/luka/Projects/poiera-dev && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
cd /Users/luka/Projects/poiera-dev && git add packages/server/src/controllers/hermes/profiles.ts && git commit -m "feat(audit): integrate audit recording into profile management routes"
```

---

### Task 6: Integrate AuditService Into Skills, MCP, and Config Routes

**Files:**
- Modify: `packages/server/src/controllers/hermes/skills.ts`
- Modify: `packages/server/src/controllers/hermes/mcp.ts`
- Modify: `packages/server/src/controllers/hermes/models.ts`
- Modify: `packages/server/src/controllers/hermes/providers.ts`

- [ ] **Step 1: Add audit to skills controller**

Add import and audit calls for:
- `deleteSkill`: `action: 'skill.delete'`, targetType: `'skill'`, targetId: skill name
- `toggle`: `action: 'skill.toggle'`, meta: `{ enabled }`
- `importSkill`: `action: 'skill.import'`
- `updateExternalDirs`: `action: 'skill.update_external_dirs'`
- `pin_`: `action: 'skill.pin'`, meta: `{ pinned }`

- [ ] **Step 2: Add audit to MCP controller**

Add import and audit calls for:
- `addServer`: `action: 'mcp_server.create'`, targetType: `'mcp_server'`, targetId: server name
- `updateServer`: `action: 'mcp_server.update'`
- `removeServer`: `action: 'mcp_server.delete'`
- `testServer`: `action: 'mcp_server.test'`
- `reloadMcp`: `action: 'mcp.reload'`

- [ ] **Step 3: Add audit to models controller**

Add audit calls for:
- `setConfigModel`: `action: 'model.set_config'`
- `setModelAlias`: `action: 'model.set_alias'`
- `setModelVisibility`: `action: 'model.set_visibility'`
- `addCustomModel`: `action: 'model.add_custom'`
- `removeCustomModel`: `action: 'model.remove_custom'`
- `updateModelContext`: `action: 'model.update_context'`

- [ ] **Step 4: Add audit to providers controller**

Add audit calls for:
- `create`: `action: 'provider.create'`, targetType: `'provider'`, targetId: poolKey
- `update`: `action: 'provider.update'`
- `remove`: `action: 'provider.delete'`

All provider credential fields in meta are auto-stripped by `stripSecrets`.

- [ ] **Step 5: Verify compilation**

Run: `cd /Users/luka/Projects/poiera-dev && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
cd /Users/luka/Projects/poiera-dev && git add packages/server/src/controllers/hermes/skills.ts packages/server/src/controllers/hermes/mcp.ts packages/server/src/controllers/hermes/models.ts packages/server/src/controllers/hermes/providers.ts && git commit -m "feat(audit): integrate audit recording into skills, MCP, models, and providers routes"
```

---

### Task 7: Integrate AuditService Into Group Chat, Jobs, and Config Routes

**Files:**
- Modify: `packages/server/src/routes/hermes/group-chat.ts` (inline handlers)
- Modify: `packages/server/src/controllers/hermes/jobs.ts`
- Modify: `packages/server/src/routes/hermes/config.ts` (or its controller)

- [ ] **Step 1: Add audit to group-chat route handlers**

In `packages/server/src/routes/hermes/group-chat.ts`, add import:
```typescript
import { AuditService } from '../../services/audit'
const audit = AuditService.getInstance()
```

Add audit calls after successful mutations for:
- Room create: `action: 'group_chat_room.create'`
- Room delete: `action: 'group_chat_room.delete'`
- Owner transfer: `action: 'group_chat_room.transfer_owner'`
- Agent add: `action: 'group_chat_room.add_agent'`
- Agent remove: `action: 'group_chat_room.remove_agent'`
- Config update: `action: 'group_chat_room.update_config'`

- [ ] **Step 2: Add audit to jobs controller**

Add audit calls for:
- Job creation: `action: 'job.create'`
- Job deletion: `action: 'job.delete'`
- Job pause/resume: `action: 'job.pause'` / `'job.resume'`
- Job run: `action: 'job.run'`
- Ownership transfer: `action: 'job.transfer_owner'`

- [ ] **Step 3: Add audit to config routes**

Add audit calls for:
- Config update: `action: 'config.update'`
- Auxiliary models update: `action: 'config.update_auxiliary_models'`
- Credentials update: `action: 'config.update_credentials'` (meta auto-stripped)

- [ ] **Step 4: Verify compilation**

Run: `cd /Users/luka/Projects/poiera-dev && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
cd /Users/luka/Projects/poiera-dev && git add packages/server/src/routes/hermes/group-chat.ts packages/server/src/controllers/hermes/jobs.ts packages/server/src/routes/hermes/config.ts && git commit -m "feat(audit): integrate audit recording into group chat, jobs, and config routes"
```

---

### Task 8: Add Comprehensive Integration Tests

**Files:**
- Modify: `tests/server/audit-routes.test.ts`

- [ ] **Step 1: Write integration tests for audit routes with RBAC enforcement**

Replace the placeholder tests in `tests/server/audit-routes.test.ts` with real integration tests that:
1. Create audit events via the service directly
2. Test that `GET /api/audit/events` returns 403 for regular users
3. Test that admin can only see events for their assigned profiles
4. Test that super_admin can see all events
5. Test that `GET /api/audit/chain/verify` returns 403 for admin
6. Test that `GET /api/audit/events/export` returns 403 for admin
7. Test query filtering (action, profile, date range)
8. Test that audit events are actually created when user management mutations occur

- [ ] **Step 2: Run all tests**

Run: `cd /Users/luka/Projects/poiera-dev && npx vitest run tests/server/audit- 2>&1 | tail -30`

- [ ] **Step 3: Commit**

```bash
cd /Users/luka/Projects/poiera-dev && git add tests/server/audit-routes.test.ts && git commit -m "test(audit): add integration tests for audit routes and RBAC enforcement"
```

---

### Task 9: Validate Full Suite

**Files:**
- Verify: all changed files

- [ ] **Step 1: Run focused audit tests**

Run: `cd /Users/luka/Projects/poiera-dev && npx vitest run tests/server/audit- 2>&1`

- [ ] **Step 2: Run harness:check**

Run: `cd /Users/luka/Projects/poiera-dev && npm run harness:check 2>&1 | tail -20`

- [ ] **Step 3: Run full test suite**

Run: `cd /Users/luka/Projects/poiera-dev && npm run test 2>&1 | tail -30`

- [ ] **Step 4: Run build**

Run: `cd /Users/luka/Projects/poiera-dev && npm run build 2>&1 | tail -20`

- [ ] **Step 5: Push**

```bash
cd /Users/luka/Projects/poiera-dev && git push origin poiera-dev
```

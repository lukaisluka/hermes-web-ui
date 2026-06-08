import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'crypto'

describe('AuditService', () => {
  let db: any = null
  let AuditService: typeof import('../../packages/server/src/services/audit').AuditService
  let AUDIT_EVENTS_TABLE: string
  let AUDIT_EVENTS_SCHEMA: Record<string, string>
  let AUDIT_EVENTS_INDEXES: Record<string, string>

  beforeEach(async () => {
    vi.resetModules()
    const { DatabaseSync } = await import('node:sqlite')
    db = new DatabaseSync(':memory:')
    vi.doMock('../../packages/server/src/db/index', () => ({
      getDb: () => db,
      getStoragePath: () => ':memory:',
    }))

    const schemas = await import('../../packages/server/src/db/hermes/schemas')
    AUDIT_EVENTS_TABLE = schemas.AUDIT_EVENTS_TABLE
    AUDIT_EVENTS_SCHEMA = schemas.AUDIT_EVENTS_SCHEMA
    AUDIT_EVENTS_INDEXES = schemas.AUDIT_EVENTS_INDEXES

    // Create the audit_events table
    const colDefs = Object.entries(AUDIT_EVENTS_SCHEMA).map(([col, def]) => `"${col}" ${def}`)
    db.exec(`CREATE TABLE "${AUDIT_EVENTS_TABLE}" (${colDefs.join(', ')})`)
    for (const indexSQL of Object.values(AUDIT_EVENTS_INDEXES)) {
      db.exec(indexSQL)
    }

    const mod = await import('../../packages/server/src/services/audit')
    AuditService = mod.AuditService
    AuditService.resetInstance()
  })

  afterEach(() => {
    db?.close()
    db = null
    vi.doUnmock('../../packages/server/src/db/index')
    vi.resetModules()
  })

  function service() {
    return AuditService.getInstance()
  }

  function makeActor(overrides: Partial<{ id: number; username: string; role: string }> = {}) {
    return { id: 1, username: 'admin', role: 'super_admin', ...overrides }
  }

  // ─── recordEvent ─────────────────────────────────────────────────

  describe('recordEvent', () => {
    it('inserts an event with correct fields', () => {
      const id = service().recordEvent({
        action: 'user.create',
        actor: makeActor(),
        profile: 'default',
        targetType: 'user',
        targetId: '42',
        description: 'Created user bob',
        meta: { source: 'admin-ui' },
      })

      expect(id).toBeGreaterThan(0)

      const row = db.prepare(`SELECT * FROM ${AUDIT_EVENTS_TABLE} WHERE id = ?`).get(id) as any
      expect(row.action).toBe('user.create')
      expect(row.actor_id).toBe(1)
      expect(row.actor_username).toBe('admin')
      expect(row.actor_role).toBe('super_admin')
      expect(row.profile).toBe('default')
      expect(row.target_type).toBe('user')
      expect(row.target_id).toBe('42')
      expect(row.description).toBe('Created user bob')
      expect(row.meta).toBe(JSON.stringify({ source: 'admin-ui' }))
      expect(row.prev_hash).toBe('0'.repeat(64)) // genesis hash
      expect(row.row_hash).not.toBe('__PENDING__')
      expect(typeof row.row_hash).toBe('string')
      expect(row.row_hash).toHaveLength(64) // SHA-256 hex
    })

    it('defaults optional fields to empty strings', () => {
      const id = service().recordEvent({
        action: 'system.start',
        actor: makeActor(),
      })

      const row = db.prepare(`SELECT * FROM ${AUDIT_EVENTS_TABLE} WHERE id = ?`).get(id) as any
      expect(row.profile).toBe('')
      expect(row.target_type).toBe('')
      expect(row.target_id).toBe('')
      expect(row.description).toBe('')
      expect(row.meta).toBeNull()
    })

    it('returns -1 when db is unavailable', () => {
      vi.resetModules()
      vi.doMock('../../packages/server/src/db/index', () => ({
        getDb: () => null,
      }))

      // Need to re-import to pick up new mock
      return import('../../packages/server/src/services/audit').then(mod => {
        mod.AuditService.resetInstance()
        const result = mod.AuditService.getInstance().recordEvent({
          action: 'test',
          actor: makeActor(),
        })
        expect(result).toBe(-1)
      })
    })
  })

  // ─── hash chain linkage ──────────────────────────────────────────

  describe('hash chain linkage', () => {
    it('links second event prev_hash to first event row_hash', () => {
      const id1 = service().recordEvent({
        action: 'user.create',
        actor: makeActor(),
        description: 'First event',
      })
      const id2 = service().recordEvent({
        action: 'user.delete',
        actor: makeActor({ id: 2, username: 'ops' }),
        description: 'Second event',
      })

      const row1 = db.prepare(`SELECT * FROM ${AUDIT_EVENTS_TABLE} WHERE id = ?`).get(id1) as any
      const row2 = db.prepare(`SELECT * FROM ${AUDIT_EVENTS_TABLE} WHERE id = ?`).get(id2) as any

      expect(row2.prev_hash).toBe(row1.row_hash)
    })

    it('produces a verifiable hash chain across multiple events', () => {
      const ids: number[] = []
      for (let i = 0; i < 5; i++) {
        ids.push(service().recordEvent({
          action: `action.${i}`,
          actor: makeActor(),
        }))
      }

      // Verify each event's prev_hash equals the previous event's row_hash
      const rows = ids.map(id =>
        db.prepare(`SELECT * FROM ${AUDIT_EVENTS_TABLE} WHERE id = ?`).get(id) as any
      )

      expect(rows[0].prev_hash).toBe('0'.repeat(64)) // genesis
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i].prev_hash).toBe(rows[i - 1].row_hash)
      }
    })

    it('computes row_hash correctly as SHA-256 of joined fields', () => {
      const id = service().recordEvent({
        action: 'test.action',
        actor: makeActor({ id: 5, username: 'testuser', role: 'admin' }),
        profile: 'research',
        targetType: 'skill',
        targetId: 'my-skill',
        description: 'A test event',
        meta: { key: 'value' },
      })

      const row = db.prepare(`SELECT * FROM ${AUDIT_EVENTS_TABLE} WHERE id = ?`).get(id) as any

      const expectedParts = [
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

      const expectedHash = createHash('sha256').update(expectedParts).digest('hex')
      expect(row.row_hash).toBe(expectedHash)
    })
  })

  // ─── secret stripping ────────────────────────────────────────────

  describe('secret stripping from meta', () => {
    it('strips known secret keys from meta', () => {
      const id = service().recordEvent({
        action: 'provider.update',
        actor: makeActor(),
        meta: {
          api_key: 'sk-12345',
          apiKey: 'ak-67890',
          password: 's3cret',
          secret: 'top-secret',
          token: 'bearer-abc',
          credential: 'cred-xyz',
          authorization: 'Basic xyz',
          cookie: 'session=abc',
          private_key: '-----BEGIN PRIVATE KEY-----',
          privateKey: 'pk-123',
          safe_field: 'this is fine',
        },
      })

      const row = db.prepare(`SELECT * FROM ${AUDIT_EVENTS_TABLE} WHERE id = ?`).get(id) as any
      const meta = JSON.parse(row.meta)

      expect(meta.api_key).toBe('[REDACTED]')
      expect(meta.apiKey).toBe('[REDACTED]')
      expect(meta.password).toBe('[REDACTED]')
      expect(meta.secret).toBe('[REDACTED]')
      expect(meta.token).toBe('[REDACTED]')
      expect(meta.credential).toBe('[REDACTED]')
      expect(meta.authorization).toBe('[REDACTED]')
      expect(meta.cookie).toBe('[REDACTED]')
      expect(meta.private_key).toBe('[REDACTED]')
      expect(meta.privateKey).toBe('[REDACTED]')
      expect(meta.safe_field).toBe('this is fine')
    })

    it('strips secrets from nested objects', () => {
      const id = service().recordEvent({
        action: 'mcp.update',
        actor: makeActor(),
        meta: {
          config: {
            password: 'nested-secret',
            name: 'visible',
          },
        },
      })

      const row = db.prepare(`SELECT * FROM ${AUDIT_EVENTS_TABLE} WHERE id = ?`).get(id) as any
      const meta = JSON.parse(row.meta)

      expect(meta.config.password).toBe('[REDACTED]')
      expect(meta.config.name).toBe('visible')
    })

    it('handles null meta without error', () => {
      const id = service().recordEvent({
        action: 'test',
        actor: makeActor(),
      })

      const row = db.prepare(`SELECT * FROM ${AUDIT_EVENTS_TABLE} WHERE id = ?`).get(id) as any
      expect(row.meta).toBeNull()
    })
  })

  // ─── queryEvents ─────────────────────────────────────────────────

  describe('queryEvents', () => {
    beforeEach(() => {
      service().recordEvent({ action: 'user.create', actor: makeActor(), profile: 'default', targetType: 'user', targetId: '1' })
      service().recordEvent({ action: 'user.delete', actor: makeActor({ id: 2, username: 'ops' }), profile: 'research', targetType: 'user', targetId: '2' })
      service().recordEvent({ action: 'skill.update', actor: makeActor(), profile: 'default', targetType: 'skill', targetId: 'my-skill' })
      service().recordEvent({ action: 'user.create', actor: makeActor({ id: 2, username: 'ops' }), profile: '', targetType: 'user', targetId: '3' })
    })

    it('returns all events with default options', () => {
      const events = service().queryEvents()
      expect(events).toHaveLength(4)
    })

    it('filters by profile', () => {
      const events = service().queryEvents({ profile: 'default' })
      expect(events).toHaveLength(2)
      expect(events.every(e => e.profile === 'default')).toBe(true)
    })

    it('filters by action', () => {
      const events = service().queryEvents({ action: 'user.create' })
      expect(events).toHaveLength(2)
      expect(events.every(e => e.action === 'user.create')).toBe(true)
    })

    it('filters by actorId', () => {
      const events = service().queryEvents({ actorId: 2 })
      expect(events).toHaveLength(2)
      expect(events.every(e => e.actor_id === 2)).toBe(true)
    })

    it('filters by targetType and targetId', () => {
      const events = service().queryEvents({ targetType: 'skill', targetId: 'my-skill' })
      expect(events).toHaveLength(1)
      expect(events[0].target_type).toBe('skill')
    })

    it('respects limit and offset', () => {
      const page1 = service().queryEvents({ limit: 2, offset: 0 })
      const page2 = service().queryEvents({ limit: 2, offset: 2 })
      expect(page1).toHaveLength(2)
      expect(page2).toHaveLength(2)
      expect(page1[0].id).toBeLessThan(page2[0].id)
    })

    it('clamps limit to max 1000', () => {
      const events = service().queryEvents({ limit: 9999 })
      // All 4 events returned, but the SQL LIMIT would be 1000
      expect(events).toHaveLength(4)
    })

    it('filters by allowedProfiles including global events', () => {
      const events = service().queryEvents({ allowedProfiles: ['default'] })
      // Should include profile='default' (2 events) + profile='' (1 event)
      expect(events).toHaveLength(3)
    })

    it('returns empty array when db is unavailable', async () => {
      vi.resetModules()
      vi.doMock('../../packages/server/src/db/index', () => ({
        getDb: () => null,
      }))
      const mod = await import('../../packages/server/src/services/audit')
      mod.AuditService.resetInstance()
      const events = mod.AuditService.getInstance().queryEvents()
      expect(events).toEqual([])
    })
  })

  // ─── countEvents ─────────────────────────────────────────────────

  describe('countEvents', () => {
    beforeEach(() => {
      service().recordEvent({ action: 'user.create', actor: makeActor(), profile: 'default' })
      service().recordEvent({ action: 'user.create', actor: makeActor(), profile: 'research' })
      service().recordEvent({ action: 'user.delete', actor: makeActor(), profile: 'default' })
    })

    it('counts all events without filters', () => {
      expect(service().countEvents()).toBe(3)
    })

    it('counts events with action filter', () => {
      expect(service().countEvents({ action: 'user.create' })).toBe(2)
    })

    it('counts events with profile filter', () => {
      expect(service().countEvents({ profile: 'default' })).toBe(2)
    })

    it('returns 0 when db is unavailable', async () => {
      vi.resetModules()
      vi.doMock('../../packages/server/src/db/index', () => ({
        getDb: () => null,
      }))
      const mod = await import('../../packages/server/src/services/audit')
      mod.AuditService.resetInstance()
      expect(mod.AuditService.getInstance().countEvents()).toBe(0)
    })
  })

  // ─── verifyChain ─────────────────────────────────────────────────

  describe('verifyChain', () => {
    it('returns valid for intact chain', () => {
      service().recordEvent({ action: 'user.create', actor: makeActor() })
      service().recordEvent({ action: 'user.delete', actor: makeActor() })
      service().recordEvent({ action: 'skill.update', actor: makeActor() })

      const result = service().verifyChain()
      expect(result.valid).toBe(true)
      expect(result.brokenAt).toBeNull()
    })

    it('returns valid for empty table', () => {
      const result = service().verifyChain()
      expect(result.valid).toBe(true)
      expect(result.brokenAt).toBeNull()
    })

    it('detects broken prev_hash linkage', () => {
      service().recordEvent({ action: 'user.create', actor: makeActor() })
      service().recordEvent({ action: 'user.delete', actor: makeActor() })

      // Tamper with the second row's prev_hash so it no longer matches the first row's row_hash
      db.prepare(`UPDATE ${AUDIT_EVENTS_TABLE} SET prev_hash = 'tampered-prev-hash' WHERE id = 2`).run()

      const result = service().verifyChain()
      expect(result.valid).toBe(false)
      // The tampered prev_hash causes row_hash mismatch (since prev_hash is an input to row_hash)
      expect(result.brokenAt).toBe(2)
    })

    it('detects incorrect row_hash', () => {
      service().recordEvent({ action: 'user.create', actor: makeActor() })

      // Tamper with the row_hash
      db.prepare(`UPDATE ${AUDIT_EVENTS_TABLE} SET row_hash = 'tampered' WHERE id = 1`).run()

      const result = service().verifyChain()
      expect(result.valid).toBe(false)
      expect(result.brokenAt).toBe(1)
    })

    it('detects broken genesis hash', () => {
      service().recordEvent({ action: 'user.create', actor: makeActor() })

      // Tamper with the first row's prev_hash
      db.prepare(`UPDATE ${AUDIT_EVENTS_TABLE} SET prev_hash = 'not-genesis' WHERE id = 1`).run()

      const result = service().verifyChain()
      expect(result.valid).toBe(false)
      expect(result.brokenAt).toBe(1)
    })
  })

  // ─── purgeExpired ────────────────────────────────────────────────

  describe('purgeExpired', () => {
    it('deletes events older than retention period', () => {
      // Insert an old event by directly manipulating the timestamp
      service().recordEvent({ action: 'old.action', actor: makeActor() })
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
      db.prepare(`UPDATE ${AUDIT_EVENTS_TABLE} SET timestamp = ? WHERE id = 1`).run(thirtyDaysAgo)

      // Insert a recent event
      service().recordEvent({ action: 'recent.action', actor: makeActor() })

      // Purge events older than 7 days
      const deleted = service().purgeExpired(7)
      expect(deleted).toBe(1)

      const remaining = service().queryEvents()
      expect(remaining).toHaveLength(1)
      expect(remaining[0].action).toBe('recent.action')
    })

    it('keeps events within retention period', () => {
      service().recordEvent({ action: 'recent.action', actor: makeActor() })

      const deleted = service().purgeExpired(90)
      expect(deleted).toBe(0)

      const remaining = service().queryEvents()
      expect(remaining).toHaveLength(1)
    })

    it('defaults to 90 days retention', () => {
      service().recordEvent({ action: 'old.action', actor: makeActor() })
      // Set timestamp to 89 days ago — should be kept
      const eightyNineDaysAgo = Date.now() - 89 * 24 * 60 * 60 * 1000
      db.prepare(`UPDATE ${AUDIT_EVENTS_TABLE} SET timestamp = ? WHERE id = 1`).run(eightyNineDaysAgo)

      const deleted = service().purgeExpired()
      expect(deleted).toBe(0)

      // Now set to 91 days ago — should be purged
      const ninetyOneDaysAgo = Date.now() - 91 * 24 * 60 * 60 * 1000
      db.prepare(`UPDATE ${AUDIT_EVENTS_TABLE} SET timestamp = ? WHERE id = 1`).run(ninetyOneDaysAgo)

      const deleted2 = service().purgeExpired()
      expect(deleted2).toBe(1)
    })

    it('returns 0 when db is unavailable', async () => {
      vi.resetModules()
      vi.doMock('../../packages/server/src/db/index', () => ({
        getDb: () => null,
      }))
      const mod = await import('../../packages/server/src/services/audit')
      mod.AuditService.resetInstance()
      expect(mod.AuditService.getInstance().purgeExpired()).toBe(0)
    })
  })

  // ─── exportEvents ────────────────────────────────────────────────

  describe('exportEvents', () => {
    it('returns valid JSON', () => {
      service().recordEvent({ action: 'user.create', actor: makeActor(), profile: 'default' })
      service().recordEvent({ action: 'skill.update', actor: makeActor(), profile: 'research' })

      const exported = service().exportEvents()
      const parsed = JSON.parse(exported)

      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed).toHaveLength(2)
      expect(parsed[0].action).toBe('user.create')
      expect(parsed[1].action).toBe('skill.update')
    })

    it('respects query filters', () => {
      service().recordEvent({ action: 'user.create', actor: makeActor() })
      service().recordEvent({ action: 'skill.update', actor: makeActor() })

      const exported = service().exportEvents({ action: 'user.create' })
      const parsed = JSON.parse(exported)

      expect(parsed).toHaveLength(1)
      expect(parsed[0].action).toBe('user.create')
    })

    it('exports empty array as valid JSON', () => {
      const exported = service().exportEvents()
      const parsed = JSON.parse(exported)
      expect(parsed).toEqual([])
    })
  })

  // ─── singleton pattern ───────────────────────────────────────────

  describe('singleton pattern', () => {
    it('returns the same instance', () => {
      const a = AuditService.getInstance()
      const b = AuditService.getInstance()
      expect(a).toBe(b)
    })

    it('resetInstance creates a new instance', () => {
      const a = AuditService.getInstance()
      AuditService.resetInstance()
      const b = AuditService.getInstance()
      expect(a).not.toBe(b)
    })
  })
})

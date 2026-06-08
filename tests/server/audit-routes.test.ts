import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('audit route integration tests', () => {
  let db: any = null
  let AUDIT_EVENTS_TABLE: string

  beforeEach(async () => {
    vi.resetModules()
    vi.stubEnv('AUTH_JWT_SECRET', 'test-secret')
    const { DatabaseSync } = await import('node:sqlite')
    db = new DatabaseSync(':memory:')
    vi.doMock('../../packages/server/src/db/index', () => ({
      getDb: () => db,
      getStoragePath: () => ':memory:',
    }))

    const schemas = await import('../../packages/server/src/db/hermes/schemas')
    schemas.initAllHermesTables()
    AUDIT_EVENTS_TABLE = schemas.AUDIT_EVENTS_TABLE
  })

  afterEach(() => {
    db?.close()
    db = null
    vi.doUnmock('../../packages/server/src/db/index')
    vi.doUnmock('../../packages/server/src/services/hermes/hermes-profile')
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  /** Build a mock Koa context with the given authenticated user. */
  function makeCtx(user: any, query: Record<string, string> = {}) {
    return {
      state: { user },
      query,
      request: { body: {} },
      params: {},
      status: 200,
      body: null as any,
      set: vi.fn(),
      get: vi.fn(),
    } as any
  }

  // ─── 1. Regular user gets 403 on audit query ────────────────────────

  it('returns 403 when a regular user queries audit events', async () => {
    const ctrl = await import('../../packages/server/src/controllers/audit')
    const ctx = makeCtx({ id: 3, username: 'han', role: 'user' })

    ctrl.queryEvents(ctx)

    expect(ctx.status).toBe(403)
    expect(ctx.body.error).toMatch(/administrator/i)
  })

  // ─── 2. Admin can query but only for assigned profiles ───────────────

  it('admin sees events for assigned profiles and global, not other profiles', async () => {
    const { AuditService } = await import('../../packages/server/src/services/audit')
    AuditService.resetInstance()
    const service = AuditService.getInstance()

    // Seed events across different profiles
    service.recordEvent({ action: 'user.create', actor: { id: 1, username: 'root', role: 'super_admin' }, profile: 'default', description: 'default event' })
    service.recordEvent({ action: 'user.create', actor: { id: 1, username: 'root', role: 'super_admin' }, profile: 'research', description: 'research event' })
    service.recordEvent({ action: 'user.create', actor: { id: 1, username: 'root', role: 'super_admin' }, profile: '', description: 'global event' })
    service.recordEvent({ action: 'user.create', actor: { id: 1, username: 'root', role: 'super_admin' }, profile: 'private', description: 'private event' })

    const ctrl = await import('../../packages/server/src/controllers/audit')
    // Admin with access to 'default' and 'research' profiles only
    const ctx = makeCtx({ id: 2, username: 'ops', role: 'admin', profiles: ['default', 'research'] })

    ctrl.queryEvents(ctx)

    expect(ctx.status).toBe(200)
    const events = ctx.body.events
    const profiles = events.map((e: any) => e.profile)
    // Should see default, research, and global events — NOT private
    expect(profiles).toContain('default')
    expect(profiles).toContain('research')
    expect(profiles).toContain('')
    expect(profiles).not.toContain('private')
  })

  // ─── 3. Super admin can see all events ──────────────────────────────

  it('super admin sees all events with no profile restriction', async () => {
    const { AuditService } = await import('../../packages/server/src/services/audit')
    AuditService.resetInstance()
    const service = AuditService.getInstance()

    service.recordEvent({ action: 'user.create', actor: { id: 1, username: 'root', role: 'super_admin' }, profile: 'default' })
    service.recordEvent({ action: 'user.create', actor: { id: 1, username: 'root', role: 'super_admin' }, profile: 'private' })
    service.recordEvent({ action: 'user.create', actor: { id: 1, username: 'root', role: 'super_admin' }, profile: '' })

    const ctrl = await import('../../packages/server/src/controllers/audit')
    const ctx = makeCtx({ id: 1, username: 'root', role: 'super_admin' })

    ctrl.queryEvents(ctx)

    expect(ctx.status).toBe(200)
    expect(ctx.body.events).toHaveLength(3)
  })

  // ─── 4. Admin gets 403 on verify chain (middleware enforcement) ───────

  it('returns 403 when admin tries to verify chain (requireSuperAdmin middleware)', async () => {
    const auth = await import('../../packages/server/src/middleware/user-auth')
    const ctx = makeCtx({ id: 2, username: 'ops', role: 'admin' })
    const next = vi.fn(async () => {})

    await auth.requireSuperAdmin(ctx, next)

    expect(ctx.status).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  // ─── 5. Admin gets 403 on export ────────────────────────────────────

  it('returns 403 when admin tries to export events', async () => {
    const ctrl = await import('../../packages/server/src/controllers/audit')
    const ctx = makeCtx({ id: 2, username: 'ops', role: 'admin' })

    ctrl.exportEvents(ctx)

    expect(ctx.status).toBe(403)
    expect(ctx.body.error).toMatch(/super administrator/i)
  })

  // ─── 6. Super admin can verify chain ────────────────────────────────

  it('super admin can verify chain and gets valid result', async () => {
    const { AuditService } = await import('../../packages/server/src/services/audit')
    AuditService.resetInstance()
    const service = AuditService.getInstance()

    service.recordEvent({ action: 'user.create', actor: { id: 1, username: 'root', role: 'super_admin' } })
    service.recordEvent({ action: 'user.delete', actor: { id: 1, username: 'root', role: 'super_admin' } })

    const ctrl = await import('../../packages/server/src/controllers/audit')
    const ctx = makeCtx({ id: 1, username: 'root', role: 'super_admin' })

    ctrl.verifyChain(ctx)

    expect(ctx.body.valid).toBe(true)
    expect(ctx.body.brokenAt).toBeNull()
  })

  // ─── 7. Super admin can export ──────────────────────────────────────

  it('super admin can export events with Content-Disposition header', async () => {
    const { AuditService } = await import('../../packages/server/src/services/audit')
    AuditService.resetInstance()
    const service = AuditService.getInstance()

    service.recordEvent({ action: 'user.create', actor: { id: 1, username: 'root', role: 'super_admin' }, profile: 'default' })

    const ctrl = await import('../../packages/server/src/controllers/audit')
    const ctx = makeCtx({ id: 1, username: 'root', role: 'super_admin' })

    ctrl.exportEvents(ctx)

    // Body should be valid JSON
    const parsed = JSON.parse(ctx.body)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].action).toBe('user.create')

    // Content-Disposition header should be set
    expect(ctx.set).toHaveBeenCalledWith('Content-Disposition', expect.stringMatching(/attachment; filename="audit-export-/))
    expect(ctx.set).toHaveBeenCalledWith('Content-Type', 'application/json')
  })

  // ─── 8. Query filtering works ───────────────────────────────────────

  describe('query filtering', () => {
    let service: any
    let ctrl: any

    beforeEach(async () => {
      const { AuditService } = await import('../../packages/server/src/services/audit')
      AuditService.resetInstance()
      service = AuditService.getInstance()

      // Seed a variety of events
      service.recordEvent({ action: 'user.create', actor: { id: 1, username: 'root', role: 'super_admin' }, profile: 'default', targetType: 'user', targetId: '10' })
      service.recordEvent({ action: 'user.delete', actor: { id: 1, username: 'root', role: 'super_admin' }, profile: 'research', targetType: 'user', targetId: '11' })
      service.recordEvent({ action: 'skill.update', actor: { id: 1, username: 'root', role: 'super_admin' }, profile: 'default', targetType: 'skill', targetId: 'my-skill' })
      service.recordEvent({ action: 'user.create', actor: { id: 2, username: 'ops', role: 'admin' }, profile: '', targetType: 'user', targetId: '12' })

      ctrl = await import('../../packages/server/src/controllers/audit')
    })

    it('filters by action', () => {
      const ctx = makeCtx({ id: 1, username: 'root', role: 'super_admin' }, { action: 'user.create' })
      ctrl.queryEvents(ctx)
      expect(ctx.body.events).toHaveLength(2)
      expect(ctx.body.events.every((e: any) => e.action === 'user.create')).toBe(true)
    })

    it('filters by profile', () => {
      const ctx = makeCtx({ id: 1, username: 'root', role: 'super_admin' }, { profile: 'default' })
      ctrl.queryEvents(ctx)
      expect(ctx.body.events).toHaveLength(2)
      expect(ctx.body.events.every((e: any) => e.profile === 'default')).toBe(true)
    })

    it('filters by timestamp range', () => {
      // Get the timestamp of the second event to use as a boundary
      const allCtx = makeCtx({ id: 1, username: 'root', role: 'super_admin' })
      ctrl.queryEvents(allCtx)
      const events = allCtx.body.events as any[]
      const afterSecond = events[1].timestamp + 1

      const ctx = makeCtx({ id: 1, username: 'root', role: 'super_admin' }, { fromTimestamp: String(afterSecond) })
      ctrl.queryEvents(ctx)
      // Should return only events after the second one
      expect(ctx.body.events.length).toBeLessThan(4)
      expect(ctx.body.events.every((e: any) => e.timestamp >= afterSecond)).toBe(true)
    })
  })

  // ─── 9. Audit events created on user management ─────────────────────

  it('creates an audit event when a user is created via POST /api/auth/users', async () => {
    vi.doMock('../../packages/server/src/services/hermes/hermes-profile', () => ({
      listProfileNamesFromDisk: () => ['default', 'research'],
    }))

    const { AuditService } = await import('../../packages/server/src/services/audit')
    AuditService.resetInstance()

    const ctrl = await import('../../packages/server/src/controllers/auth')
    const ctx = makeCtx({ id: 1, username: 'root', role: 'super_admin' })
    ctx.request.body = {
      username: 'newuser',
      password: 'secret123',
      role: 'user',
      profiles: ['research'],
    }

    await ctrl.createManagedUser(ctx)

    expect(ctx.status).toBe(201)

    // Now check that an audit event was recorded
    const service = AuditService.getInstance()
    const events = service.queryEvents({ action: 'user.create' })

    expect(events).toHaveLength(1)
    expect(events[0].action).toBe('user.create')
    expect(events[0].actor_id).toBe(1)
    expect(events[0].actor_username).toBe('root')
    expect(events[0].actor_role).toBe('super_admin')
    expect(events[0].target_type).toBe('user')
    expect(events[0].description).toContain('newuser')

    // Verify meta contains role and profiles
    const meta = JSON.parse(events[0].meta)
    expect(meta.username).toBe('newuser')
    expect(meta.role).toBe('user')
  })

  // ─── 10. Pagination works ───────────────────────────────────────────

  it('returns correct slice with limit and offset', async () => {
    const { AuditService } = await import('../../packages/server/src/services/audit')
    AuditService.resetInstance()
    const service = AuditService.getInstance()

    // Seed 5 events
    for (let i = 0; i < 5; i++) {
      service.recordEvent({ action: `action.${i}`, actor: { id: 1, username: 'root', role: 'super_admin' } })
    }

    const ctrl = await import('../../packages/server/src/controllers/audit')

    // Page 1
    const page1Ctx = makeCtx({ id: 1, username: 'root', role: 'super_admin' }, { limit: '2', offset: '0' })
    ctrl.queryEvents(page1Ctx)
    expect(page1Ctx.body.events).toHaveLength(2)
    expect(page1Ctx.body.total).toBe(5)

    // Page 2
    const page2Ctx = makeCtx({ id: 1, username: 'root', role: 'super_admin' }, { limit: '2', offset: '2' })
    ctrl.queryEvents(page2Ctx)
    expect(page2Ctx.body.events).toHaveLength(2)
    expect(page2Ctx.body.events[0].id).toBeGreaterThan(page1Ctx.body.events[1].id)

    // Page 3 (partial)
    const page3Ctx = makeCtx({ id: 1, username: 'root', role: 'super_admin' }, { limit: '2', offset: '4' })
    ctrl.queryEvents(page3Ctx)
    expect(page3Ctx.body.events).toHaveLength(1)
    expect(page3Ctx.body.total).toBe(5)
  })

  // ─── Unauthenticated user gets 401 on query ─────────────────────────

  it('returns 401 when no user is set on the context', async () => {
    const ctrl = await import('../../packages/server/src/controllers/audit')
    const ctx = makeCtx(null)

    ctrl.queryEvents(ctx)

    expect(ctx.status).toBe(401)
    expect(ctx.body.error).toMatch(/unauthorized/i)
  })

  // ─── Verify chain returns valid for empty table ─────────────────────

  it('returns valid chain for empty audit table', async () => {
    const ctrl = await import('../../packages/server/src/controllers/audit')
    const ctx = makeCtx({ id: 1, username: 'root', role: 'super_admin' })

    ctrl.verifyChain(ctx)

    expect(ctx.body.valid).toBe(true)
  })

  // ─── Export respects query filters ──────────────────────────────────

  it('super admin export respects query filters', async () => {
    const { AuditService } = await import('../../packages/server/src/services/audit')
    AuditService.resetInstance()
    const service = AuditService.getInstance()

    service.recordEvent({ action: 'user.create', actor: { id: 1, username: 'root', role: 'super_admin' } })
    service.recordEvent({ action: 'skill.update', actor: { id: 1, username: 'root', role: 'super_admin' } })

    const ctrl = await import('../../packages/server/src/controllers/audit')
    const ctx = makeCtx({ id: 1, username: 'root', role: 'super_admin' }, { action: 'user.create' })

    ctrl.exportEvents(ctx)

    const parsed = JSON.parse(ctx.body)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].action).toBe('user.create')
  })
})

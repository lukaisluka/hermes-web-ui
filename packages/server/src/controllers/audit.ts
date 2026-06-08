import type { Context } from 'koa'
import { AuditService } from '../services/audit'
import { isSuperAdmin, isProfileAdmin } from '../middleware/user-auth'

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
    ? undefined
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

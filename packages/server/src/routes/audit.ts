import Router from '@koa/router'
import * as ctrl from '../controllers/audit'
import { requireProfileAdmin, requireSuperAdmin } from '../middleware/user-auth'

export const auditRoutes = new Router()

// admin+ can query; controller enforces profile scoping internally
auditRoutes.get('/api/audit/events', requireProfileAdmin, ctrl.queryEvents)

// super_admin only
auditRoutes.get('/api/audit/chain/verify', requireSuperAdmin, ctrl.verifyChain)
auditRoutes.get('/api/audit/events/export', requireSuperAdmin, ctrl.exportEvents)

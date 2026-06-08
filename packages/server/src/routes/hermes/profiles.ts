import Router from '@koa/router'
import * as ctrl from '../../controllers/hermes/profiles'
import { requireProfileAdmin, requireSuperAdmin, requireTargetProfileAdmin } from '../../middleware/user-auth'

export const profileRoutes = new Router()

profileRoutes.get('/api/hermes/profiles', ctrl.list)
profileRoutes.post('/api/hermes/profiles', requireSuperAdmin, ctrl.create)
profileRoutes.get('/api/hermes/profiles/runtime-statuses', requireProfileAdmin, ctrl.runtimeStatuses)
profileRoutes.get('/api/hermes/profiles/:name/runtime-status', requireTargetProfileAdmin, ctrl.runtimeStatus)
profileRoutes.post('/api/hermes/profiles/:name/restart', requireTargetProfileAdmin, ctrl.restartProfileRuntime)
profileRoutes.post('/api/hermes/profiles/:name/gateway/restart', requireTargetProfileAdmin, ctrl.restartGatewayForProfile)
profileRoutes.put('/api/hermes/profiles/:name/avatar', requireTargetProfileAdmin, ctrl.updateAvatar)
profileRoutes.delete('/api/hermes/profiles/:name/avatar', requireTargetProfileAdmin, ctrl.deleteAvatar)
profileRoutes.get('/api/hermes/profiles/:name', requireTargetProfileAdmin, ctrl.get)
profileRoutes.delete('/api/hermes/profiles/:name', requireSuperAdmin, ctrl.remove)
profileRoutes.post('/api/hermes/profiles/:name/rename', requireSuperAdmin, ctrl.rename)
profileRoutes.put('/api/hermes/profiles/active', requireSuperAdmin, ctrl.switchProfile)
profileRoutes.post('/api/hermes/profiles/:name/export', requireTargetProfileAdmin, ctrl.exportProfile)
profileRoutes.post('/api/hermes/profiles/import', requireSuperAdmin, ctrl.importProfile)

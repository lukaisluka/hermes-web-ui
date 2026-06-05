import Router from '@koa/router'
import * as ctrl from '../../controllers/hermes/profiles'
import { requireProfileAdmin, requireSuperAdmin } from '../../middleware/user-auth'

export const profileRoutes = new Router()

profileRoutes.get('/api/hermes/profiles', ctrl.list)
profileRoutes.post('/api/hermes/profiles', requireProfileAdmin, ctrl.create)
profileRoutes.get('/api/hermes/profiles/runtime-statuses', requireProfileAdmin, ctrl.runtimeStatuses)
profileRoutes.get('/api/hermes/profiles/:name/runtime-status', requireProfileAdmin, ctrl.runtimeStatus)
profileRoutes.post('/api/hermes/profiles/:name/restart', requireProfileAdmin, ctrl.restartProfileRuntime)
profileRoutes.post('/api/hermes/profiles/:name/gateway/restart', requireProfileAdmin, ctrl.restartGatewayForProfile)
profileRoutes.put('/api/hermes/profiles/:name/avatar', requireProfileAdmin, ctrl.updateAvatar)
profileRoutes.delete('/api/hermes/profiles/:name/avatar', requireProfileAdmin, ctrl.deleteAvatar)
profileRoutes.get('/api/hermes/profiles/:name', requireProfileAdmin, ctrl.get)
profileRoutes.delete('/api/hermes/profiles/:name', requireProfileAdmin, ctrl.remove)
profileRoutes.post('/api/hermes/profiles/:name/rename', requireProfileAdmin, ctrl.rename)
profileRoutes.put('/api/hermes/profiles/active', requireSuperAdmin, ctrl.switchProfile)
profileRoutes.post('/api/hermes/profiles/:name/export', requireProfileAdmin, ctrl.exportProfile)
profileRoutes.post('/api/hermes/profiles/import', requireProfileAdmin, ctrl.importProfile)

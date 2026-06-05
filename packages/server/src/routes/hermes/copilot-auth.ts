import Router from '@koa/router'
import * as ctrl from '../../controllers/hermes/copilot-auth'
import { requireProfileAdmin } from '../../middleware/user-auth'

export const copilotAuthRoutes = new Router()

copilotAuthRoutes.post('/api/hermes/auth/copilot/start', requireProfileAdmin, ctrl.start)
copilotAuthRoutes.get('/api/hermes/auth/copilot/poll/:sessionId', requireProfileAdmin, ctrl.poll)
copilotAuthRoutes.get('/api/hermes/auth/copilot/check-token', requireProfileAdmin, ctrl.checkToken)
copilotAuthRoutes.post('/api/hermes/auth/copilot/enable', requireProfileAdmin, ctrl.enable)
copilotAuthRoutes.post('/api/hermes/auth/copilot/disable', requireProfileAdmin, ctrl.disable)

import Router from '@koa/router'
import * as ctrl from '../../controllers/hermes/nous-auth'
import { requireProfileAdmin } from '../../middleware/user-auth'

export const nousAuthRoutes = new Router()

nousAuthRoutes.post('/api/hermes/auth/nous/start', requireProfileAdmin, ctrl.start)
nousAuthRoutes.get('/api/hermes/auth/nous/poll/:sessionId', requireProfileAdmin, ctrl.poll)
nousAuthRoutes.get('/api/hermes/auth/nous/status', requireProfileAdmin, ctrl.status)

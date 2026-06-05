import Router from '@koa/router'
import * as ctrl from '../../controllers/hermes/xai-auth'
import { requireProfileAdmin } from '../../middleware/user-auth'

export const xaiAuthRoutes = new Router()

xaiAuthRoutes.post('/api/hermes/auth/xai/start', requireProfileAdmin, ctrl.start)
xaiAuthRoutes.get('/api/hermes/auth/xai/poll/:sessionId', requireProfileAdmin, ctrl.poll)
xaiAuthRoutes.get('/api/hermes/auth/xai/status', requireProfileAdmin, ctrl.status)

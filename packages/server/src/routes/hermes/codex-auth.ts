import Router from '@koa/router'
import * as ctrl from '../../controllers/hermes/codex-auth'
import { requireProfileAdmin } from '../../middleware/user-auth'

export const codexAuthRoutes = new Router()

codexAuthRoutes.post('/api/hermes/auth/codex/start', requireProfileAdmin, ctrl.start)
codexAuthRoutes.get('/api/hermes/auth/codex/poll/:sessionId', requireProfileAdmin, ctrl.poll)
codexAuthRoutes.get('/api/hermes/auth/codex/status', requireProfileAdmin, ctrl.status)

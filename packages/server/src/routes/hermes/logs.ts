import Router from '@koa/router'
import * as ctrl from '../../controllers/hermes/logs'
import { requireProfileAdmin } from '../../middleware/user-auth'

export const logRoutes = new Router()

logRoutes.get('/api/hermes/logs', requireProfileAdmin, ctrl.list)
logRoutes.get('/api/hermes/logs/:name', requireProfileAdmin, ctrl.read)

import Router from '@koa/router'
import * as ctrl from '../../controllers/hermes/plugins'
import { requireProfileAdmin } from '../../middleware/user-auth'

export const pluginRoutes = new Router()

pluginRoutes.get('/api/hermes/plugins', requireProfileAdmin, ctrl.list)

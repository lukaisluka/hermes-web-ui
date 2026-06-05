import Router from '@koa/router'
import * as ctrl from '../../controllers/hermes/providers'
import { requireProfileAdmin } from '../../middleware/user-auth'

export const providerRoutes = new Router()

providerRoutes.post('/api/hermes/config/providers', requireProfileAdmin, ctrl.create)
providerRoutes.put('/api/hermes/config/providers/:poolKey', requireProfileAdmin, ctrl.update)
providerRoutes.delete('/api/hermes/config/providers/:poolKey', requireProfileAdmin, ctrl.remove)

import Router from '@koa/router'
import * as ctrl from '../../controllers/hermes/config'
import { requireProfileAdmin } from '../../middleware/user-auth'

export const configRoutes = new Router()

configRoutes.get('/api/hermes/config', requireProfileAdmin, ctrl.getConfig)
configRoutes.put('/api/hermes/config', requireProfileAdmin, ctrl.updateConfig)
configRoutes.get('/api/hermes/config/auxiliary-models', requireProfileAdmin, ctrl.getAuxiliaryModels)
configRoutes.put('/api/hermes/config/auxiliary-models', requireProfileAdmin, ctrl.updateAuxiliaryModels)
configRoutes.put('/api/hermes/config/credentials', requireProfileAdmin, ctrl.updateCredentials)

import Router from '@koa/router'
import * as ctrl from '../../controllers/hermes/models'
import { requireProfileAdmin } from '../../middleware/user-auth'

export const modelRoutes = new Router()

modelRoutes.get('/api/hermes/available-models', ctrl.getAvailable)
modelRoutes.post('/api/hermes/provider-models', requireProfileAdmin, ctrl.fetchProviderModelList)
modelRoutes.post('/api/hermes/provider-models/cache/refresh', requireProfileAdmin, ctrl.refreshProviderModelCatalogCache)
modelRoutes.get('/api/hermes/config/models', requireProfileAdmin, ctrl.getConfigModels)
modelRoutes.put('/api/hermes/config/model', requireProfileAdmin, ctrl.setConfigModel)
modelRoutes.put('/api/hermes/model-alias', requireProfileAdmin, ctrl.setModelAlias)
modelRoutes.put('/api/hermes/model-visibility', requireProfileAdmin, ctrl.setModelVisibility)
modelRoutes.put('/api/hermes/custom-model', requireProfileAdmin, ctrl.addCustomModel)
modelRoutes.delete('/api/hermes/custom-model', requireProfileAdmin, ctrl.removeCustomModel)

// Model context routes
modelRoutes.get('/api/hermes/model-context', requireProfileAdmin, ctrl.getModelContext)
modelRoutes.get('/api/hermes/model-context/:provider/:model', requireProfileAdmin, ctrl.getModelContext)
modelRoutes.put('/api/hermes/model-context/:provider/:model', requireProfileAdmin, ctrl.updateModelContext)
modelRoutes.put('/api/hermes/model-context', requireProfileAdmin, ctrl.updateModelContext)

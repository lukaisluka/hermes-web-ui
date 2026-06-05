import Router from '@koa/router'
import * as ctrl from '../../controllers/hermes/memory'
import { requireProfileAdmin } from '../../middleware/user-auth'

export const memoryRoutes = new Router()

memoryRoutes.get('/api/hermes/memory', requireProfileAdmin, ctrl.get)
memoryRoutes.post('/api/hermes/memory', requireProfileAdmin, ctrl.save)

import Router from '@koa/router'
import * as ctrl from '../controllers/coding-agents'
import { requireProfileAdmin } from '../middleware/user-auth'

export const codingAgentRoutes = new Router()

codingAgentRoutes.get('/api/coding-agents', requireProfileAdmin, ctrl.status)
codingAgentRoutes.post('/api/coding-agents/:id/install', requireProfileAdmin, ctrl.install)
codingAgentRoutes.post('/api/coding-agents/:id/launch/prepare', requireProfileAdmin, ctrl.prepareLaunch)
codingAgentRoutes.post('/api/coding-agents/:id/launch/native', requireProfileAdmin, ctrl.nativeLaunch)
codingAgentRoutes.delete('/api/coding-agents/:id', requireProfileAdmin, ctrl.remove)
codingAgentRoutes.get('/api/coding-agents/:id/config-files/:key', requireProfileAdmin, ctrl.readConfigFile)
codingAgentRoutes.put('/api/coding-agents/:id/config-files/:key', requireProfileAdmin, ctrl.writeConfigFile)

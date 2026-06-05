import Router from '@koa/router'
import * as ctrl from '../../controllers/hermes/mcp'
import { requireProfileAdmin } from '../../middleware/user-auth'

export const mcpRoutes = new Router()

mcpRoutes.get('/api/hermes/mcp/servers', requireProfileAdmin, ctrl.listServers)
mcpRoutes.post('/api/hermes/mcp/servers', requireProfileAdmin, ctrl.addServer)
mcpRoutes.patch('/api/hermes/mcp/servers/:name', requireProfileAdmin, ctrl.updateServer)
mcpRoutes.delete('/api/hermes/mcp/servers/:name', requireProfileAdmin, ctrl.removeServer)
mcpRoutes.post('/api/hermes/mcp/servers/:name/test', requireProfileAdmin, ctrl.testServer)
mcpRoutes.get('/api/hermes/mcp/tools', requireProfileAdmin, ctrl.listTools)
mcpRoutes.post('/api/hermes/mcp/reload', requireProfileAdmin, ctrl.reloadMcp)

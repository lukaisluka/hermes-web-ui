import Router from '@koa/router'
import * as ctrl from '../../controllers/hermes/skills'
import { requireProfileAdmin } from '../../middleware/user-auth'

export const skillRoutes = new Router()

skillRoutes.get('/api/hermes/skills', ctrl.list)
skillRoutes.get('/api/hermes/skills/usage/stats', ctrl.usageStats)
skillRoutes.get('/api/hermes/skills/external-dirs', requireProfileAdmin, ctrl.listExternalDirs)
skillRoutes.put('/api/hermes/skills/external-dirs', requireProfileAdmin, ctrl.updateExternalDirs)
skillRoutes.put('/api/hermes/skills/toggle', requireProfileAdmin, ctrl.toggle)
skillRoutes.put('/api/hermes/skills/pin', requireProfileAdmin, ctrl.pin_)
skillRoutes.post('/api/hermes/skills/import', requireProfileAdmin, ctrl.importSkill)
skillRoutes.delete('/api/hermes/skills/:category/:skill', requireProfileAdmin, ctrl.deleteSkill)
skillRoutes.get('/api/hermes/skills/:category/:skill/files', requireProfileAdmin, ctrl.listFiles)
skillRoutes.get('/api/hermes/skills/{*path}', requireProfileAdmin, ctrl.readFile_)

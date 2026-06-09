import Router from '@koa/router'
import * as ctrl from '../../controllers/hermes/download'

export const downloadRoutes = new Router()

downloadRoutes.get('/api/hermes/download', ctrl.downloadFile)

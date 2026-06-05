import Router from '@koa/router'
import * as ctrl from '../../controllers/hermes/weixin'
import { requireProfileAdmin } from '../../middleware/user-auth'

export const weixinRoutes = new Router()

weixinRoutes.get('/api/hermes/weixin/qrcode', requireProfileAdmin, ctrl.getQrcode)
weixinRoutes.get('/api/hermes/weixin/qrcode/status', requireProfileAdmin, ctrl.pollStatus)
weixinRoutes.post('/api/hermes/weixin/save', requireProfileAdmin, ctrl.save)

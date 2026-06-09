import Router from '@koa/router'
import * as ctrl from '../../controllers/hermes/files'

export const fileRoutes = new Router()

// GET /api/hermes/files/list?path=
fileRoutes.get('/api/hermes/files/list', ctrl.listDir)

// GET /api/hermes/files/stat?path=
fileRoutes.get('/api/hermes/files/stat', ctrl.statFile)

// GET /api/hermes/files/read?path=
fileRoutes.get('/api/hermes/files/read', ctrl.readFile)

// PUT /api/hermes/files/write  body: { path, content }
fileRoutes.put('/api/hermes/files/write', ctrl.writeFile)

// DELETE /api/hermes/files/delete  body: { path, recursive? }
fileRoutes.delete('/api/hermes/files/delete', ctrl.deleteFile)

// POST /api/hermes/files/rename  body: { oldPath, newPath }
fileRoutes.post('/api/hermes/files/rename', ctrl.renameFile)

// POST /api/hermes/files/mkdir  body: { path }
fileRoutes.post('/api/hermes/files/mkdir', ctrl.mkdir)

// POST /api/hermes/files/copy  body: { srcPath, destPath }
fileRoutes.post('/api/hermes/files/copy', ctrl.copyFile)

// POST /api/hermes/files/upload?path=  (multipart/form-data)
fileRoutes.post('/api/hermes/files/upload', ctrl.uploadFiles)

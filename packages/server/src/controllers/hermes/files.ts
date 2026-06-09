import type { Context } from 'koa'
import {
  createFileProvider,
  resolveHermesPath,
  isSensitivePath,
  MAX_EDIT_SIZE,
} from '../../services/hermes/file-provider'
import { isRegularUser } from '../../middleware/user-auth'

function requestedProfile(ctx: Context): string | undefined {
  return (ctx.state as any)?.profile?.name
}

function resolveRequestPath(ctx: Context, relativePath: string): string {
  return resolveHermesPath(relativePath, requestedProfile(ctx))
}

async function createRequestFileProvider(ctx: Context) {
  return createFileProvider(requestedProfile(ctx))
}

function isConfigPath(relativePath: string): boolean {
  const fileName = relativePath.replace(/\\/g, '/').split('/').pop()?.toLowerCase() || ''
  return fileName === 'config.yaml' || fileName.startsWith('config.yaml.')
}

function isForbiddenPath(ctx: Context, relativePath: string): boolean {
  return isSensitivePath(relativePath) || (isRegularUser((ctx.state as any)?.user) && isConfigPath(relativePath))
}

function withAbsolutePath<T extends { path: string }>(ctx: Context, entry: T): T & { absolutePath: string } {
  return { ...entry, absolutePath: resolveRequestPath(ctx, entry.path) }
}

function handleError(ctx: Context, err: any) {
  const code = err.code || 'unknown'
  const statusMap: Record<string, number> = {
    missing_path: 400,
    invalid_path: 400,
    not_found: 404,
    ENOENT: 404,
    already_exists: 409,
    permission_denied: 403,
    file_too_large: 413,
    not_a_directory: 400,
    not_a_file: 400,
    unsupported_backend: 501,
    backend_error: 502,
    backend_timeout: 504,
  }
  ctx.status = statusMap[code] || 500
  ctx.body = { error: err.message, code }
}

function splitMultipart(raw: Buffer, boundary: Buffer): Buffer[] {
  const parts: Buffer[] = []
  let start = 0
  while (true) {
    const idx = raw.indexOf(boundary, start)
    if (idx === -1) break
    if (start > 0) {
      const partStart = start + 2
      parts.push(raw.subarray(partStart, idx))
    }
    start = idx + boundary.length
  }
  return parts
}

export async function listDir(ctx: Context) {
  const relativePath = ((ctx.query as any).path as string) || ''
  if (relativePath && isForbiddenPath(ctx, relativePath)) {
    ctx.status = 403
    ctx.body = { error: 'Cannot list sensitive path', code: 'permission_denied' }
    return
  }
  try {
    const absPath = resolveRequestPath(ctx, relativePath)
    const provider = await createRequestFileProvider(ctx)
    const entries = (await provider.listDir(absPath)).filter(entry => !isForbiddenPath(ctx, entry.path))
    entries.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    ctx.body = { entries: entries.map(entry => withAbsolutePath(ctx, entry)), path: relativePath, absolutePath: absPath }
  } catch (err: any) {
    handleError(ctx, err)
  }
}

export async function statFile(ctx: Context) {
  const relativePath = (ctx.query as any).path as string
  if (!relativePath) {
    ctx.status = 400
    ctx.body = { error: 'Missing path parameter', code: 'missing_path' }
    return
  }
  if (isForbiddenPath(ctx, relativePath)) {
    ctx.status = 403
    ctx.body = { error: 'Cannot inspect sensitive file', code: 'permission_denied' }
    return
  }
  try {
    const absPath = resolveRequestPath(ctx, relativePath)
    const provider = await createRequestFileProvider(ctx)
    const info = await provider.stat(absPath)
    ctx.body = withAbsolutePath(ctx, info)
  } catch (err: any) {
    handleError(ctx, err)
  }
}

export async function readFile(ctx: Context) {
  const relativePath = (ctx.query as any).path as string
  if (!relativePath) {
    ctx.status = 400
    ctx.body = { error: 'Missing path parameter', code: 'missing_path' }
    return
  }
  if (isForbiddenPath(ctx, relativePath)) {
    ctx.status = 403
    ctx.body = { error: 'Cannot read sensitive file', code: 'permission_denied' }
    return
  }
  try {
    const absPath = resolveRequestPath(ctx, relativePath)
    const provider = await createRequestFileProvider(ctx)
    const data = await provider.readFile(absPath)
    if (data.length > MAX_EDIT_SIZE) {
      ctx.status = 413
      ctx.body = { error: 'File too large to edit', code: 'file_too_large' }
      return
    }
    ctx.body = { content: data.toString('utf-8'), path: relativePath, size: data.length }
  } catch (err: any) {
    handleError(ctx, err)
  }
}

export async function writeFile(ctx: Context) {
  const { path: relativePath, content } = ctx.request.body as { path?: string; content?: string }
  if (!relativePath) {
    ctx.status = 400
    ctx.body = { error: 'Missing path parameter', code: 'missing_path' }
    return
  }
  if (isForbiddenPath(ctx, relativePath)) {
    ctx.status = 403
    ctx.body = { error: 'Cannot modify sensitive file', code: 'permission_denied' }
    return
  }
  try {
    const buf = Buffer.from(content || '', 'utf-8')
    if (buf.length > MAX_EDIT_SIZE) {
      ctx.status = 413
      ctx.body = { error: 'Content too large', code: 'file_too_large' }
      return
    }
    const absPath = resolveRequestPath(ctx, relativePath)
    const provider = await createRequestFileProvider(ctx)
    await provider.writeFile(absPath, buf)
    ctx.body = { ok: true, path: relativePath }
  } catch (err: any) {
    handleError(ctx, err)
  }
}

export async function deleteFile(ctx: Context) {
  const { path: relativePath, recursive } = ctx.request.body as { path?: string; recursive?: boolean }
  if (!relativePath) {
    ctx.status = 400
    ctx.body = { error: 'Missing path parameter', code: 'missing_path' }
    return
  }
  if (isForbiddenPath(ctx, relativePath)) {
    ctx.status = 403
    ctx.body = { error: 'Cannot delete sensitive file', code: 'permission_denied' }
    return
  }
  try {
    const absPath = resolveRequestPath(ctx, relativePath)
    const provider = await createRequestFileProvider(ctx)
    if (recursive) {
      await provider.deleteDir(absPath)
    } else {
      await provider.deleteFile(absPath)
    }
    ctx.body = { ok: true }
  } catch (err: any) {
    handleError(ctx, err)
  }
}

export async function renameFile(ctx: Context) {
  const { oldPath, newPath } = ctx.request.body as { oldPath?: string; newPath?: string }
  if (!oldPath || !newPath) {
    ctx.status = 400
    ctx.body = { error: 'Missing oldPath or newPath', code: 'missing_path' }
    return
  }
  if (isForbiddenPath(ctx, oldPath) || isForbiddenPath(ctx, newPath)) {
    ctx.status = 403
    ctx.body = { error: 'Cannot rename sensitive file', code: 'permission_denied' }
    return
  }
  try {
    const absOld = resolveRequestPath(ctx, oldPath)
    const absNew = resolveRequestPath(ctx, newPath)
    const provider = await createRequestFileProvider(ctx)
    await provider.renameFile(absOld, absNew)
    ctx.body = { ok: true }
  } catch (err: any) {
    handleError(ctx, err)
  }
}

export async function mkdir(ctx: Context) {
  const { path: relativePath } = ctx.request.body as { path?: string }
  if (!relativePath) {
    ctx.status = 400
    ctx.body = { error: 'Missing path parameter', code: 'missing_path' }
    return
  }
  if (isForbiddenPath(ctx, relativePath)) {
    ctx.status = 403
    ctx.body = { error: 'Cannot create sensitive path', code: 'permission_denied' }
    return
  }
  try {
    const absPath = resolveRequestPath(ctx, relativePath)
    const provider = await createRequestFileProvider(ctx)
    await provider.mkDir(absPath)
    ctx.body = { ok: true }
  } catch (err: any) {
    handleError(ctx, err)
  }
}

export async function copyFile(ctx: Context) {
  const { srcPath, destPath } = ctx.request.body as { srcPath?: string; destPath?: string }
  if (!srcPath || !destPath) {
    ctx.status = 400
    ctx.body = { error: 'Missing srcPath or destPath', code: 'missing_path' }
    return
  }
  if (isForbiddenPath(ctx, srcPath) || isForbiddenPath(ctx, destPath)) {
    ctx.status = 403
    ctx.body = { error: 'Cannot copy sensitive file', code: 'permission_denied' }
    return
  }
  try {
    const absSrc = resolveRequestPath(ctx, srcPath)
    const absDest = resolveRequestPath(ctx, destPath)
    const provider = await createRequestFileProvider(ctx)
    await provider.copyFile(absSrc, absDest)
    ctx.body = { ok: true }
  } catch (err: any) {
    handleError(ctx, err)
  }
}

export async function uploadFiles(ctx: Context) {
  const targetDir = ((ctx.query as any).path as string) || ''
  const contentType = ctx.get('content-type') || ''
  if (!contentType.startsWith('multipart/form-data')) {
    ctx.status = 400
    ctx.body = { error: 'Expected multipart/form-data', code: 'invalid_request' }
    return
  }

  const boundary = '--' + contentType.split('boundary=')[1]
  if (!boundary || boundary === '--undefined') {
    ctx.status = 400
    ctx.body = { error: 'Missing boundary', code: 'invalid_request' }
    return
  }

  const chunks: Buffer[] = []
  for await (const chunk of ctx.req) chunks.push(chunk)
  const raw = Buffer.concat(chunks)

  const boundaryBuf = Buffer.from(boundary)
  const parts = splitMultipart(raw, boundaryBuf)
  const provider = await createRequestFileProvider(ctx)
  const results: { name: string; path: string }[] = []

  for (const part of parts) {
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'))
    if (headerEnd === -1) continue
    const headerBuf = part.subarray(0, headerEnd)
    const header = headerBuf.toString('utf-8')
    const data = part.subarray(headerEnd + 4, part.length - 2)

    let filename = ''
    const filenameStarMatch = header.match(/filename\*=UTF-8''(.+)/i)
    if (filenameStarMatch) {
      filename = decodeURIComponent(filenameStarMatch[1])
    } else {
      const filenameMatch = header.match(/filename="([^"]+)"/)
      if (!filenameMatch) continue
      filename = filenameMatch[1]
    }

    if (data.length > MAX_EDIT_SIZE) {
      ctx.status = 413
      ctx.body = { error: `File ${filename} too large`, code: 'file_too_large' }
      return
    }

    const filePath = targetDir ? `${targetDir}/${filename}` : filename
    if (isForbiddenPath(ctx, filePath)) {
      ctx.status = 403
      ctx.body = { error: `Cannot overwrite sensitive file: ${filename}`, code: 'permission_denied' }
      return
    }

    const absPath = resolveRequestPath(ctx, filePath)
    await provider.writeFile(absPath, data)
    results.push({ name: filename, path: filePath })
  }

  ctx.body = { files: results }
}

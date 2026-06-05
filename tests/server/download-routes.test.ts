import { beforeEach, describe, expect, it, vi } from 'vitest'

const provider = {
  readFile: vi.fn(),
}
const createFileProviderMock = vi.fn(async () => provider)
const isSensitivePathMock = vi.fn(() => false)

vi.mock('../../packages/server/src/services/hermes/file-provider', () => ({
  createFileProvider: createFileProviderMock,
  localProvider: { readFile: vi.fn() },
  isInUploadDir: vi.fn(() => false),
  isSensitivePath: isSensitivePathMock,
  validatePath: vi.fn((path: string) => path),
  resolveHermesPath: vi.fn((path: string, profile: string) => `/profiles/${profile}/${path}`),
}))

vi.mock('../../packages/server/src/services/hermes/hermes-profile', () => ({
  getActiveProfileName: vi.fn(() => 'global'),
  getProfileDir: vi.fn((profile: string) => `/profiles/${profile}`),
}))

vi.mock('../../packages/server/src/services/hermes/hermes-path', () => ({
  isPathWithin: vi.fn((path: string, base: string) => path === base || path.startsWith(`${base}/`)),
}))

vi.mock('../../packages/server/src/services/hermes/upload-paths', () => ({
  isInProfileUploadDir: vi.fn((path: string, profile: string) => path.startsWith(`/uploads/${profile}/`)),
}))

vi.mock('../../packages/server/src/middleware/user-auth', () => ({
  isRegularUser: vi.fn((user: any) => user?.role === 'user'),
}))

function routeContext(path: string) {
  return {
    query: { path },
    state: { user: { role: 'user' }, profile: { name: 'research' } },
    status: 200,
    body: null,
    set: vi.fn(),
  } as any
}

describe('download routes', () => {
  beforeEach(() => {
    provider.readFile.mockReset()
    createFileProviderMock.mockClear()
    isSensitivePathMock.mockReset()
    isSensitivePathMock.mockReturnValue(false)
  })

  it('rejects sensitive files', async () => {
    isSensitivePathMock.mockReturnValue(true)
    const { downloadRoutes } = await import('../../packages/server/src/routes/hermes/download')
    const handler = downloadRoutes.stack.find((entry: any) => entry.path === '/api/hermes/download')!.stack[0]
    const ctx = routeContext('.env')

    await handler(ctx)

    expect(ctx.status).toBe(403)
    expect(provider.readFile).not.toHaveBeenCalled()
  })

  it('rejects regular-user downloads outside the authorized profile', async () => {
    const { downloadRoutes } = await import('../../packages/server/src/routes/hermes/download')
    const handler = downloadRoutes.stack.find((entry: any) => entry.path === '/api/hermes/download')!.stack[0]
    const ctx = routeContext('/profiles/private/notes.md')

    await handler(ctx)

    expect(ctx.status).toBe(403)
    expect(provider.readFile).not.toHaveBeenCalled()
  })

  it('rejects regular-user config downloads inside an authorized profile', async () => {
    const { downloadRoutes } = await import('../../packages/server/src/routes/hermes/download')
    const handler = downloadRoutes.stack.find((entry: any) => entry.path === '/api/hermes/download')!.stack[0]
    const ctx = routeContext('/profiles/research/config.yaml')

    await handler(ctx)

    expect(ctx.status).toBe(403)
    expect(provider.readFile).not.toHaveBeenCalled()
  })

  it('allows regular-user downloads inside the authorized profile', async () => {
    provider.readFile.mockResolvedValue(Buffer.from('hello'))
    const { downloadRoutes } = await import('../../packages/server/src/routes/hermes/download')
    const handler = downloadRoutes.stack.find((entry: any) => entry.path === '/api/hermes/download')!.stack[0]
    const ctx = routeContext('/profiles/research/notes.md')

    await handler(ctx)

    expect(createFileProviderMock).toHaveBeenCalledWith('research')
    expect(provider.readFile).toHaveBeenCalledWith('/profiles/research/notes.md')
    expect(ctx.body).toEqual(Buffer.from('hello'))
  })
})

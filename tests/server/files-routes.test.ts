import { beforeEach, describe, expect, it, vi } from 'vitest'

const provider = {
  listDir: vi.fn(),
  stat: vi.fn(),
}
const createFileProviderMock = vi.fn(async () => provider)
const resolveHermesPathMock = vi.fn((relativePath: string) => {
  const normalized = relativePath.replace(/^\/+/, '')
  return normalized ? `/home/agent/.hermes/${normalized}` : '/home/agent/.hermes'
})
const isSensitivePathMock = vi.fn(() => false)

vi.mock('../../packages/server/src/services/hermes/file-provider', () => ({
  createFileProvider: createFileProviderMock,
  resolveHermesPath: resolveHermesPathMock,
  isSensitivePath: isSensitivePathMock,
  MAX_EDIT_SIZE: 10 * 1024 * 1024,
}))

vi.mock('../../packages/server/src/middleware/user-auth', () => ({
  isRegularUser: vi.fn((user: any) => user?.role === 'user'),
}))

describe('file routes path metadata', () => {
  beforeEach(() => {
    vi.resetModules()
    createFileProviderMock.mockClear()
    resolveHermesPathMock.mockClear()
    isSensitivePathMock.mockReset()
    isSensitivePathMock.mockReturnValue(false)
    provider.listDir.mockReset()
    provider.stat.mockReset()
  })

  it('returns absolute paths for listed entries while preserving relative operation paths', async () => {
    provider.listDir.mockResolvedValue([
      { name: 'app.log', path: 'logs/app.log', isDir: false, size: 12, modTime: '2026-05-20T00:00:00.000Z' },
    ])

    const { fileRoutes } = await import('../../packages/server/src/routes/hermes/files')
    const layer = fileRoutes.stack.find((entry: any) => entry.path === '/api/hermes/files/list')
    const ctx: any = { query: { path: 'logs' }, state: { profile: { name: 'research' } }, body: null }

    await layer.stack[0](ctx)

    expect(createFileProviderMock).toHaveBeenCalledWith('research')
    expect(resolveHermesPathMock).toHaveBeenCalledWith('logs', 'research')
    expect(provider.listDir).toHaveBeenCalledWith('/home/agent/.hermes/logs')
    expect(ctx.body).toEqual({
      path: 'logs',
      absolutePath: '/home/agent/.hermes/logs',
      entries: [
        {
          name: 'app.log',
          path: 'logs/app.log',
          absolutePath: '/home/agent/.hermes/logs/app.log',
          isDir: false,
          size: 12,
          modTime: '2026-05-20T00:00:00.000Z',
        },
      ],
    })
  })

  it('returns an absolute path in stat responses', async () => {
    provider.stat.mockResolvedValue({
      name: 'app.log',
      path: 'logs/app.log',
      isDir: false,
      size: 12,
      modTime: '2026-05-20T00:00:00.000Z',
    })

    const { fileRoutes } = await import('../../packages/server/src/routes/hermes/files')
    const layer = fileRoutes.stack.find((entry: any) => entry.path === '/api/hermes/files/stat')
    const ctx: any = { query: { path: 'logs/app.log' }, state: { profile: { name: 'research' } }, body: null }

    await layer.stack[0](ctx)

    expect(createFileProviderMock).toHaveBeenCalledWith('research')
    expect(resolveHermesPathMock).toHaveBeenCalledWith('logs/app.log', 'research')
    expect(ctx.body).toEqual({
      name: 'app.log',
      path: 'logs/app.log',
      absolutePath: '/home/agent/.hermes/logs/app.log',
      isDir: false,
      size: 12,
      modTime: '2026-05-20T00:00:00.000Z',
    })
  })

  it('filters sensitive entries from directory listings', async () => {
    isSensitivePathMock.mockImplementation((path: string) => path.endsWith('.env') || path.endsWith('auth.json'))
    provider.listDir.mockResolvedValue([
      { name: '.env', path: '.env', isDir: false, size: 12, modTime: '2026-05-20T00:00:00.000Z' },
      { name: 'notes.md', path: 'notes.md', isDir: false, size: 8, modTime: '2026-05-20T00:00:00.000Z' },
      { name: 'auth.json', path: 'auth.json', isDir: false, size: 20, modTime: '2026-05-20T00:00:00.000Z' },
    ])

    const { fileRoutes } = await import('../../packages/server/src/routes/hermes/files')
    const layer = fileRoutes.stack.find((entry: any) => entry.path === '/api/hermes/files/list')
    const ctx: any = { query: {}, state: { profile: { name: 'research' } }, body: null }

    await layer.stack[0](ctx)

    expect(ctx.body.entries.map((entry: any) => entry.name)).toEqual(['notes.md'])
  })

  it('filters config files from regular-user directory listings', async () => {
    provider.listDir.mockResolvedValue([
      { name: 'config.yaml', path: 'config.yaml', isDir: false, size: 12, modTime: '2026-05-20T00:00:00.000Z' },
      { name: 'config.yaml.bak', path: 'config.yaml.bak', isDir: false, size: 12, modTime: '2026-05-20T00:00:00.000Z' },
      { name: 'notes.md', path: 'notes.md', isDir: false, size: 8, modTime: '2026-05-20T00:00:00.000Z' },
    ])

    const { fileRoutes } = await import('../../packages/server/src/routes/hermes/files')
    const layer = fileRoutes.stack.find((entry: any) => entry.path === '/api/hermes/files/list')
    const ctx: any = { query: {}, state: { user: { role: 'user' }, profile: { name: 'research' } }, body: null }

    await layer.stack[0](ctx)

    expect(ctx.body.entries.map((entry: any) => entry.name)).toEqual(['notes.md'])
  })

  it('keeps config files visible to administrators', async () => {
    provider.listDir.mockResolvedValue([
      { name: 'config.yaml', path: 'config.yaml', isDir: false, size: 12, modTime: '2026-05-20T00:00:00.000Z' },
    ])

    const { fileRoutes } = await import('../../packages/server/src/routes/hermes/files')
    const layer = fileRoutes.stack.find((entry: any) => entry.path === '/api/hermes/files/list')
    const ctx: any = { query: {}, state: { user: { role: 'admin' }, profile: { name: 'research' } }, body: null }

    await layer.stack[0](ctx)

    expect(ctx.body.entries.map((entry: any) => entry.name)).toEqual(['config.yaml'])
  })

  it('rejects stat requests for sensitive files', async () => {
    isSensitivePathMock.mockImplementation((path: string) => path.endsWith('.env'))

    const { fileRoutes } = await import('../../packages/server/src/routes/hermes/files')
    const layer = fileRoutes.stack.find((entry: any) => entry.path === '/api/hermes/files/stat')
    const ctx: any = { query: { path: '.env' }, state: { profile: { name: 'research' } }, body: null }

    await layer.stack[0](ctx)

    expect(ctx.status).toBe(403)
    expect(provider.stat).not.toHaveBeenCalled()
  })

  it('rejects regular-user stat requests for config files', async () => {
    const { fileRoutes } = await import('../../packages/server/src/routes/hermes/files')
    const layer = fileRoutes.stack.find((entry: any) => entry.path === '/api/hermes/files/stat')
    const ctx: any = {
      query: { path: 'config.yaml' },
      state: { user: { role: 'user' }, profile: { name: 'research' } },
      body: null,
    }

    await layer.stack[0](ctx)

    expect(ctx.status).toBe(403)
    expect(provider.stat).not.toHaveBeenCalled()
  })
})

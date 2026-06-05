import { beforeEach, describe, expect, it, vi } from 'vitest'

const listMock = vi.fn(async (ctx: any) => {
  ctx.body = { plugins: [], warnings: [], metadata: {} }
})

vi.mock('../../packages/server/src/controllers/hermes/plugins', () => ({
  list: listMock,
}))

vi.mock('../../packages/server/src/middleware/user-auth', () => ({
  requireProfileAdmin: vi.fn(async (_ctx: any, next: any) => { await next() }),
}))

async function runLayer(layer: any, ctx: any) {
  let index = -1
  async function dispatch(i: number): Promise<void> {
    if (i <= index) throw new Error('next() called multiple times')
    index = i
    const fn = layer.stack[i]
    if (fn) await fn(ctx, () => dispatch(i + 1))
  }
  await dispatch(0)
}

describe('plugin routes', () => {
  beforeEach(() => {
    vi.resetModules()
    listMock.mockClear()
  })

  it('registers the plugins inventory route', async () => {
    const { pluginRoutes } = await import('../../packages/server/src/routes/hermes/plugins')
    const paths = pluginRoutes.stack.map((entry: any) => entry.path)

    expect(paths).toEqual(expect.arrayContaining(['/api/hermes/plugins']))
  })

  it('delegates plugin listing to the controller', async () => {
    const { pluginRoutes } = await import('../../packages/server/src/routes/hermes/plugins')
    const layer = pluginRoutes.stack.find((entry: any) => entry.path === '/api/hermes/plugins')
    const ctx: any = { body: null, params: {}, query: {} }

    await runLayer(layer, ctx)

    expect(listMock).toHaveBeenCalledWith(ctx, expect.any(Function))
    expect(ctx.body).toEqual({ plugins: [], warnings: [], metadata: {} })
  })
})

import { describe, expect, it, vi } from 'vitest'

const requireSuperAdminMock = vi.fn(async (_ctx: any, next: any) => {
  await next()
})
const handleUpdateMock = vi.fn(async (ctx: any) => {
  ctx.body = { success: true }
})

vi.mock('../../packages/server/src/middleware/user-auth', () => ({
  requireSuperAdmin: requireSuperAdminMock,
}))

vi.mock('../../packages/server/src/controllers/update', () => ({
  handleUpdate: handleUpdateMock,
  previewStatus: vi.fn(),
  previewTags: vi.fn(),
  preparePreview: vi.fn(),
  installPreview: vi.fn(),
  startPreview: vi.fn(),
  stopPreview: vi.fn(),
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

describe('update routes', () => {
  it('requires super admin authorization before updating', async () => {
    const { updateRoutes } = await import('../../packages/server/src/routes/update')
    const layer = updateRoutes.stack.find((entry: any) => entry.path === '/api/hermes/update')
    const ctx: any = { body: null }

    await runLayer(layer, ctx)

    expect(requireSuperAdminMock).toHaveBeenCalledOnce()
    expect(handleUpdateMock).toHaveBeenCalledOnce()
    expect(ctx.body).toEqual({ success: true })
  })
})

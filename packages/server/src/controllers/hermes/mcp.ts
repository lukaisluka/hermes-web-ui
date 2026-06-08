import type { Context } from 'koa'
import { bridgeMcpAction } from '../../services/hermes/mcp'
import { isRegularUser } from '../../middleware/user-auth'
import { AuditService } from '../../services/audit'

const audit = AuditService.getInstance()

function getProfile(ctx: Context): string | undefined {
  return (ctx.state as any)?.profile?.name || undefined
}

/** Validate server name: non-empty, no control chars, no path separators */
function isValidServerName(name: string): boolean {
  if (!name || name.trim().length === 0) return false
  if (name.length > 128) return false
  // Reject path separators and control characters
  if (/[/\\\x00-\x1f]/.test(name)) return false
  return true
}

function sanitizeMcpStatusForRegularUser(response: any) {
  return {
    ok: response?.ok === true,
    servers: Array.isArray(response?.servers)
      ? response.servers.map((server: any) => ({
          name: String(server?.name || ''),
          transport: server?.transport,
          connected: server?.connected === true,
          tools: Number(server?.tools || 0),
          tools_registered: Number(server?.tools_registered || 0),
          tool_names: [],
          tool_names_registered: [],
          error: server?.error ? 'Unavailable' : null,
          raw_config: { enabled: server?.raw_config?.enabled !== false },
          tool_details: [],
        }))
      : [],
    total_tools: Number(response?.total_tools || 0),
  }
}

export async function listServers(ctx: Context) {
  try {
    const response = await bridgeMcpAction('mcp_list', {}, getProfile(ctx))
    ctx.body = isRegularUser((ctx.state as any)?.user)
      ? sanitizeMcpStatusForRegularUser(response)
      : response
  } catch (err: any) {
    ctx.status = 503
    ctx.body = { error: err.message || 'MCP bridge not available' }
  }
}

export async function addServer(ctx: Context) {
  try {
    const { name, config } = (ctx.request.body || {}) as Record<string, unknown>
    if (typeof name !== 'string' || !isValidServerName(name)) {
      ctx.status = 400
      ctx.body = { error: 'Valid server name is required' }
      return
    }
    if (!config || typeof config !== 'object') {
      ctx.status = 400
      ctx.body = { error: 'config object is required' }
      return
    }
    ctx.body = await bridgeMcpAction('mcp_server_add', { name: name.trim(), config }, getProfile(ctx))
    audit.recordEvent({
      action: 'mcp_server.create',
      actor: { id: ctx.state.user.id, username: ctx.state.user.username, role: ctx.state.user.role },
      profile: getProfile(ctx),
      targetType: 'mcp_server',
      targetId: name.trim(),
      description: `Added MCP server "${name.trim()}"`,
      meta: { name: name.trim() },
    })
  } catch (err: any) {
    ctx.status = 503
    ctx.body = { error: err.message || 'Failed to add MCP server' }
  }
}

export async function updateServer(ctx: Context) {
  try {
    const name = ctx.params.name as string
    const { config } = (ctx.request.body || {}) as Record<string, unknown>
    if (!name || !isValidServerName(name)) {
      ctx.status = 400
      ctx.body = { error: 'Valid server name is required' }
      return
    }
    if (!config || typeof config !== 'object') {
      ctx.status = 400
      ctx.body = { error: 'config object is required' }
      return
    }
    ctx.body = await bridgeMcpAction('mcp_server_update', { name, config }, getProfile(ctx))
    audit.recordEvent({
      action: 'mcp_server.update',
      actor: { id: ctx.state.user.id, username: ctx.state.user.username, role: ctx.state.user.role },
      profile: getProfile(ctx),
      targetType: 'mcp_server',
      targetId: name,
      description: `Updated MCP server "${name}"`,
      meta: { name },
    })
  } catch (err: any) {
    ctx.status = 503
    ctx.body = { error: err.message || 'Failed to update MCP server' }
  }
}

export async function removeServer(ctx: Context) {
  try {
    const name = ctx.params.name as string
    if (!name || !isValidServerName(name)) {
      ctx.status = 400
      ctx.body = { error: 'Valid server name is required' }
      return
    }
    ctx.body = await bridgeMcpAction('mcp_server_remove', { name }, getProfile(ctx))
    audit.recordEvent({
      action: 'mcp_server.delete',
      actor: { id: ctx.state.user.id, username: ctx.state.user.username, role: ctx.state.user.role },
      profile: getProfile(ctx),
      targetType: 'mcp_server',
      targetId: name,
      description: `Removed MCP server "${name}"`,
      meta: { name },
    })
  } catch (err: any) {
    ctx.status = 503
    ctx.body = { error: err.message || 'Failed to remove MCP server' }
  }
}

export async function testServer(ctx: Context) {
  try {
    const name = ctx.params.name as string
    if (!name || !isValidServerName(name)) {
      ctx.status = 400
      ctx.body = { error: 'Valid server name is required' }
      return
    }
    ctx.body = await bridgeMcpAction('mcp_server_test', { name }, getProfile(ctx))
    audit.recordEvent({
      action: 'mcp_server.test',
      actor: { id: ctx.state.user.id, username: ctx.state.user.username, role: ctx.state.user.role },
      profile: getProfile(ctx),
      targetType: 'mcp_server',
      targetId: name,
      description: `Tested MCP server "${name}" connection`,
      meta: { name },
    })
  } catch (err: any) {
    ctx.status = 503
    ctx.body = { error: err.message || 'Failed to test MCP server' }
  }
}

export async function listTools(ctx: Context) {
  try {
    const server = ctx.query.server as string | undefined
    const raw = ctx.query.raw === '1' || ctx.query.raw === 'true'
    const payload: Record<string, any> = {}
    if (server) payload.server = server
    if (raw) payload.raw = true
    ctx.body = await bridgeMcpAction('mcp_tools_list', payload, getProfile(ctx))
  } catch (err: any) {
    ctx.status = 503
    ctx.body = { error: err.message || 'MCP bridge not available' }
  }
}

export async function reloadMcp(ctx: Context) {
  try {
    const server = ctx.query.server as string | undefined
    const payload = server ? { server } : {}
    ctx.body = await bridgeMcpAction('mcp_reload', payload, getProfile(ctx))
    audit.recordEvent({
      action: 'mcp.reload',
      actor: { id: ctx.state.user.id, username: ctx.state.user.username, role: ctx.state.user.role },
      profile: getProfile(ctx),
      targetType: 'mcp',
      targetId: '',
      description: 'Reloaded MCP configuration',
      meta: {},
    })
  } catch (err: any) {
    ctx.status = 503
    ctx.body = { error: err.message || 'Failed to reload MCP' }
  }
}

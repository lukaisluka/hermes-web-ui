import type { Context } from 'koa'
import type { GroupChatServer } from '../../services/hermes/group-chat'
import { isReservedMentionName } from '../../services/hermes/group-chat/mention-routing'
import { isProfileAdmin, isRegularUser, isSuperAdmin } from '../../middleware/user-auth'
import { findUserById, userCanAccessProfile } from '../../db/hermes/users-store'
import { AuditService } from '../../services/audit'

const audit = AuditService.getInstance()

let chatServer: GroupChatServer | null = null

export function setGroupChatServer(server: GroupChatServer) {
    chatServer = server
}

export function getGroupChatServer(): GroupChatServer | null {
    return chatServer
}

type AgentInput = { profile: string; name?: string; description?: string; invited?: boolean | number }

function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function generateInviteCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = ''
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)]
    }
    return code
}

function currentScopeProfile(ctx: Context): string {
    return (ctx.state as any)?.profile?.name ||
        String(ctx.get?.('x-hermes-profile') || '').trim() ||
        (typeof ctx.query?.profile === 'string' ? ctx.query.profile.trim() : '') ||
        'default'
}

function allowedProfiles(ctx: Context): Set<string> {
    return new Set(((ctx.state as any)?.user?.profiles || []).map((profile: string) => profile.trim()).filter(Boolean))
}

function rejectUnauthorizedProfiles(ctx: Context, profiles: string[]): boolean {
    if (!isRegularUser((ctx.state as any)?.user)) return false
    const allowed = allowedProfiles(ctx)
    const denied = profiles.find(profile => !allowed.has(profile))
    if (!denied) return false
    ctx.status = 403
    ctx.body = { error: `Profile "${denied}" is not available for this user` }
    return true
}

function roomAccessError(ctx: Context, storage: any, room: any | undefined): string | null {
    const user = (ctx.state as any)?.user
    if (!user || isSuperAdmin(user)) return null
    if (!room) return 'Room not found'
    const agents = typeof storage.getRoomAgents === 'function'
        ? storage.getRoomAgents(room.id) as Array<{ profile: string }>
        : []
    if (room.profile && !userCanAccessProfile(user.id, room.profile)) {
        return 'Room is not available for this user'
    }
    if (!room.profile && agents.length === 0) {
        return 'Room is not available for this user'
    }
    const deniedAgent = agents.find(agent => !userCanAccessProfile(user.id, agent.profile))
    if (deniedAgent) return 'Room is not available for this user'
    return null
}

function rejectRoomAccess(ctx: Context, storage: any, room: any | undefined): boolean {
    const error = roomAccessError(ctx, storage, room)
    if (!error) return false
    ctx.status = error === 'Room not found' ? 404 : 403
    ctx.body = { error }
    return true
}

function isRoomOwner(ctx: Context, room: any): boolean {
    return Boolean((ctx.state as any)?.user && room?.ownerUserId === (ctx.state as any).user.id)
}

function isRoomMember(ctx: Context, storage: any, room: any): boolean {
    const userId = (ctx.state as any)?.user?.id
    return Boolean(userId && typeof storage.isRoomMemberByAuthUserId === 'function' && storage.isRoomMemberByAuthUserId(room.id, userId))
}

function rejectRoomManagement(ctx: Context, storage: any, room: any): boolean {
    const user = (ctx.state as any)?.user
    if (!user || isRoomOwner(ctx, room) || (isProfileAdmin(user) && room.ownerUserId != null)) return false
    ctx.status = 403
    ctx.body = { error: room.ownerUserId == null
        ? 'This ownerless room is frozen until a profile administrator assigns a new owner'
        : 'Only the room owner or a profile administrator can manage this room' }
    return true
}

function rejectRoomMessageAccess(ctx: Context, storage: any, room: any): boolean {
    const user = (ctx.state as any)?.user
    if (!user || isSuperAdmin(user) || isRoomOwner(ctx, room) || isRoomMember(ctx, storage, room)) return false
    ctx.status = 403
    ctx.body = { error: 'Join the room before reading messages' }
    return true
}

function presentRoom(ctx: Context, storage: any, room: any) {
    const canAssignOwner = Boolean((ctx.state as any)?.user && isProfileAdmin((ctx.state as any).user))
    const canManage = !(ctx.state as any)?.user || isRoomOwner(ctx, room) ||
        (isProfileAdmin((ctx.state as any).user) && room.ownerUserId != null)
    return {
        ...room,
        inviteCode: canManage ? room.inviteCode : null,
        canManage,
        canAssignOwner,
    }
}

function sanitizeAgentConnectReason(reason?: string): string {
    return (reason || 'agent runtime connection failed')
        .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]')
        .replace(/(api[_-]?key|token|secret|password)=([^\s]+)/gi, '$1=[REDACTED]')
        .split('\n')[0]
        .slice(0, 240)
}

function agentConnectFailureBody(profile: string, err: any) {
    return {
        code: 'PROFILE_AGENT_CONNECT_FAILED',
        error: `Failed to connect agent "${profile}" to room`,
        profile,
        reason: sanitizeAgentConnectReason(err?.message),
    }
}

async function connectAndPersistRoomAgent(server: GroupChatServer, roomId: string, input: AgentInput, agentId = generateId()) {
    const profile = input.profile
    const name = input.name || profile
    const description = input.description || ''
    const invited = input.invited ? 1 : 0
    const client = await server.agentClients.createAgent({
        agentId,
        profile,
        name,
        description,
        invited,
    })

    try {
        await server.agentClients.addAgentToRoom(roomId, client)
        return server.getStorage().addRoomAgent(roomId, agentId, profile, name, description, invited)
    } catch (err) {
        server.agentClients.removeAgentFromRoom(roomId, client.agentId)
        throw err
    }
}

export async function createRoom(ctx: Context) {
    if (!chatServer) {
        ctx.status = 503
        ctx.body = { error: 'Group chat not initialized' }
        return
    }

    const { name, inviteCode, agents, compression } = ctx.request.body as {
        name?: string
        inviteCode?: string
        agents?: { profile: string; name?: string; description?: string; invited?: boolean }[]
        compression?: { triggerTokens?: number; maxHistoryTokens?: number; tailMessageCount?: number }
    }
    if (!name || !inviteCode) {
        ctx.status = 400
        ctx.body = { error: 'name and inviteCode are required' }
        return
    }
    const reservedAgent = (agents || []).find(a => isReservedMentionName(a.name || a.profile))
    if (reservedAgent) {
        ctx.status = 400
        ctx.body = { error: '`all` is reserved for @all mentions' }
        return
    }
    const scopeProfile = currentScopeProfile(ctx)
    if (rejectUnauthorizedProfiles(ctx, [scopeProfile, ...(agents || []).map(agent => agent.profile)])) return
    if ((agents || []).some(agent => agent.profile !== scopeProfile)) {
        ctx.status = 400
        ctx.body = { error: 'All room agents must use the room profile' }
        return
    }

    const roomId = generateId()
    const storage = chatServer.getStorage()
    storage.saveRoom(roomId, name, inviteCode, compression, scopeProfile, (ctx.state as any)?.user?.id)

    const addedAgents = []
    const agentResults = []
    for (const a of agents || []) {
        try {
            const agent = await connectAndPersistRoomAgent(chatServer, roomId, {
                profile: a.profile,
                name: a.name || a.profile,
                description: a.description || '',
                invited: a.invited,
            })
            addedAgents.push(agent)
            agentResults.push({ profile: a.profile, ok: true, agent })
        } catch (err: any) {
            console.error(`[GroupChat] Failed to connect agent ${a.profile} to room ${roomId}: ${sanitizeAgentConnectReason(err.message)}`)
            agentResults.push({ ok: false, ...agentConnectFailureBody(a.profile, err) })
        }
    }

    const room = storage.getRoom(roomId)
    const presentedRoom = room ? presentRoom(ctx, storage, room) : room
    ctx.body = { room: presentedRoom, agents: addedAgents, agentResults }
    if ((ctx.state as any)?.user) {
        audit.recordEvent({
            action: 'group_chat_room.create',
            actor: { id: (ctx.state as any).user.id, username: (ctx.state as any).user.username, role: (ctx.state as any).user.role },
            profile: scopeProfile,
            targetType: 'group_chat_room',
            targetId: roomId,
            description: `Created group chat room "${name}"`,
        })
    }
}

export async function cloneRoom(ctx: Context) {
    if (!chatServer) {
        ctx.status = 503
        ctx.body = { error: 'Group chat not initialized' }
        return
    }

    const sourceRoom = chatServer.getStorage().getRoom(ctx.params.roomId)
    if (!sourceRoom) {
        ctx.status = 404
        ctx.body = { error: 'Room not found' }
        return
    }
    const storage = chatServer.getStorage()
    if (rejectRoomAccess(ctx, storage, sourceRoom)) return
    if (rejectRoomManagement(ctx, storage, sourceRoom)) return

    const { name, inviteCode } = ctx.request.body as { name?: string; inviteCode?: string }
    const roomId = generateId()
    const code = inviteCode?.trim() || generateInviteCode()
    storage.saveRoom(roomId, name?.trim() || `${sourceRoom.name} Copy`, code, {
        triggerTokens: sourceRoom.triggerTokens,
        maxHistoryTokens: sourceRoom.maxHistoryTokens,
        tailMessageCount: sourceRoom.tailMessageCount,
    }, sourceRoom.profile || currentScopeProfile(ctx), (ctx.state as any)?.user?.id)

    const addedAgents = []
    const agentResults = []
    for (const sourceAgent of storage.getRoomAgents(sourceRoom.id)) {
        try {
            const agent = await connectAndPersistRoomAgent(chatServer, roomId, {
                profile: sourceAgent.profile,
                name: sourceAgent.name,
                description: sourceAgent.description,
                invited: sourceAgent.invited,
            })
            addedAgents.push(agent)
            agentResults.push({ profile: sourceAgent.profile, ok: true, agent })
        } catch (err: any) {
            console.error(`[GroupChat] Failed to connect cloned agent ${sourceAgent.profile} to room ${roomId}: ${sanitizeAgentConnectReason(err.message)}`)
            agentResults.push({ ok: false, ...agentConnectFailureBody(sourceAgent.profile, err) })
        }
    }

    const room = storage.getRoom(roomId)
    ctx.body = { room: room ? presentRoom(ctx, storage, room) : room, agents: addedAgents, agentResults }
}

export async function getRoom(ctx: Context) {
    if (!chatServer) {
        ctx.status = 503
        ctx.body = { error: 'Group chat not initialized' }
        return
    }

    const room = chatServer.getStorage().getRoom(ctx.params.roomId)
    if (!room) {
        ctx.status = 404
        ctx.body = { error: 'Room not found' }
        return
    }
    if (rejectRoomAccess(ctx, chatServer.getStorage(), room)) return
    if (rejectRoomMessageAccess(ctx, chatServer.getStorage(), room)) return

    const offset = ctx.query.offset ? Math.max(0, parseInt(ctx.query.offset as string, 10) || 0) : 0
    const limit = ctx.query.limit ? Math.max(1, parseInt(ctx.query.limit as string, 10) || 300) : 300
    const messages = chatServer.getStorage().getMessages(ctx.params.roomId, limit, offset)
    const total = chatServer.getStorage().getMessageCount(ctx.params.roomId)
    const agents = chatServer.getStorage().getRoomAgents(ctx.params.roomId)
    const members = chatServer.getStorage().getRoomMembers(ctx.params.roomId)
    ctx.body = { room: presentRoom(ctx, chatServer.getStorage(), room), messages, agents, members, total, offset, limit, hasMore: offset + messages.length < total }
}

export async function listRooms(ctx: Context) {
    if (!chatServer) {
        ctx.status = 503
        ctx.body = { error: 'Group chat not initialized' }
        return
    }

    const user = (ctx.state as any).user
    const storage = chatServer.getStorage()
    const rooms = !user || isSuperAdmin(user)
        ? storage.getAllRooms()
        : storage.getRoomsForProfiles(user.profiles || [])
    const visibleRooms = isRegularUser(user)
        ? rooms.filter(room =>
            !roomAccessError(ctx, storage, room) &&
            (isRoomOwner(ctx, room) || isRoomMember(ctx, storage, room)))
        : rooms
    ctx.body = { rooms: visibleRooms.map(room => presentRoom(ctx, storage, room)) }
}

export async function getRoomByInviteCode(ctx: Context) {
    if (!chatServer) {
        ctx.status = 503
        ctx.body = { error: 'Group chat not initialized' }
        return
    }

    const room = chatServer.getStorage().getRoomByInviteCode(ctx.params.code)
    if (!room) {
        ctx.status = 404
        ctx.body = { error: 'Room not found' }
        return
    }
    if (rejectRoomAccess(ctx, chatServer.getStorage(), room)) return

    ctx.body = { room: presentRoom(ctx, chatServer.getStorage(), room) }
}

export async function updateRoomInviteCode(ctx: Context) {
    if (!chatServer) {
        ctx.status = 503
        ctx.body = { error: 'Group chat not initialized' }
        return
    }

    const { inviteCode } = ctx.request.body as { inviteCode?: string }
    if (!inviteCode) {
        ctx.status = 400
        ctx.body = { error: 'inviteCode is required' }
        return
    }

    const storage = chatServer.getStorage()
    const room = storage.getRoom(ctx.params.roomId)
    if (!room) {
        ctx.status = 404
        ctx.body = { error: 'Room not found' }
        return
    }
    if (rejectRoomAccess(ctx, storage, room)) return
    if (rejectRoomManagement(ctx, storage, room)) return

    storage.updateRoomInviteCode(ctx.params.roomId, inviteCode)
    ctx.body = { success: true }
}

export async function updateRoomOwner(ctx: Context) {
    if (!chatServer) {
        ctx.status = 503
        ctx.body = { error: 'Group chat not initialized' }
        return
    }
    if (!isProfileAdmin((ctx.state as any)?.user)) {
        ctx.status = 403
        ctx.body = { error: 'Administrator privileges are required' }
        return
    }

    const storage = chatServer.getStorage()
    const room = storage.getRoom(ctx.params.roomId)
    if (!room) {
        ctx.status = 404
        ctx.body = { error: 'Room not found' }
        return
    }
    if (rejectRoomAccess(ctx, storage, room)) return

    const ownerUserId = Number((ctx.request.body as { userId?: unknown })?.userId)
    const owner = Number.isInteger(ownerUserId) ? findUserById(ownerUserId) : null
    if (!owner || owner.status !== 'active') {
        ctx.status = 400
        ctx.body = { error: 'New owner must be an active user' }
        return
    }
    const roomProfile = String(room.profile || '').trim()
    if (!roomProfile || (owner.role !== 'super_admin' && !userCanAccessProfile(owner.id, roomProfile))) {
        ctx.status = 400
        ctx.body = { error: 'New owner must have access to the room profile' }
        return
    }

    storage.updateRoomOwner(room.id, owner.id)
    const updatedRoom = storage.getRoom(room.id)
    ctx.body = { room: updatedRoom ? presentRoom(ctx, storage, updatedRoom) : updatedRoom }
    if ((ctx.state as any)?.user) {
        audit.recordEvent({
            action: 'group_chat_room.transfer_owner',
            actor: { id: (ctx.state as any).user.id, username: (ctx.state as any).user.username, role: (ctx.state as any).user.role },
            profile: String(room.profile || '').trim(),
            targetType: 'group_chat_room',
            targetId: room.id,
            description: `Transferred ownership of room "${room.name}"`,
        })
    }
}

export async function addAgentToRoom(ctx: Context) {
    if (!chatServer) {
        ctx.status = 503
        ctx.body = { error: 'Group chat not initialized' }
        return
    }

    const { profile, name, description, invited } = ctx.request.body as { profile?: string; name?: string; description?: string; invited?: boolean }
    if (!profile) {
        ctx.status = 400
        ctx.body = { error: 'profile is required' }
        return
    }
    if (isReservedMentionName(name || profile)) {
        ctx.status = 400
        ctx.body = { error: '`all` is reserved for @all mentions' }
        return
    }
    const storage = chatServer.getStorage()
    const room = storage.getRoom(ctx.params.roomId)
    if (!room) {
        ctx.status = 404
        ctx.body = { error: 'Room not found' }
        return
    }
    if (rejectRoomAccess(ctx, storage, room)) return
    if (rejectRoomManagement(ctx, storage, room)) return
    if (rejectUnauthorizedProfiles(ctx, [profile])) return
    if (room.profile && profile !== room.profile) {
        ctx.status = 400
        ctx.body = { error: 'Agent profile must match the room profile' }
        return
    }

    // Prevent duplicate agent in same room
    const existing = storage.getRoomAgents(ctx.params.roomId)
    if (existing.find(a => a.profile === profile)) {
        ctx.status = 409
        ctx.body = { error: 'Agent already in room' }
        return
    }

    try {
        const agent = await connectAndPersistRoomAgent(chatServer, ctx.params.roomId, {
            profile,
            name: name || profile,
            description: description || '',
            invited,
        })
        ctx.body = { agent }
        if ((ctx.state as any)?.user) {
            audit.recordEvent({
                action: 'group_chat_room.add_agent',
                actor: { id: (ctx.state as any).user.id, username: (ctx.state as any).user.username, role: (ctx.state as any).user.role },
                profile: String(room.profile || '').trim(),
                targetType: 'group_chat_room',
                targetId: ctx.params.roomId,
                description: `Added agent "${name || profile}" to room "${room.name}"`,
            })
        }
    } catch (err: any) {
        console.error(`[GroupChat] Failed to connect agent ${profile} to room ${ctx.params.roomId}: ${sanitizeAgentConnectReason(err.message)}`)
        ctx.status = 502
        ctx.body = agentConnectFailureBody(profile, err)
    }
}

export async function listRoomAgents(ctx: Context) {
    if (!chatServer) {
        ctx.status = 503
        ctx.body = { error: 'Group chat not initialized' }
        return
    }

    const storage = chatServer.getStorage()
    const room = storage.getRoom(ctx.params.roomId)
    if (!room) {
        ctx.status = 404
        ctx.body = { error: 'Room not found' }
        return
    }
    if (rejectRoomAccess(ctx, storage, room)) return
    const agents = storage.getRoomAgents(ctx.params.roomId)
    ctx.body = { agents }
}

export async function removeAgentFromRoom(ctx: Context) {
    if (!chatServer) {
        ctx.status = 503
        ctx.body = { error: 'Group chat not initialized' }
        return
    }

    const roomId = ctx.params.roomId
    const requestedAgentId = ctx.params.agentId
    const storage = chatServer.getStorage()
    const room = storage.getRoom(roomId)
    if (!room) {
        ctx.status = 404
        ctx.body = { error: 'Room not found' }
        return
    }
    if (rejectRoomAccess(ctx, storage, room)) return
    if (rejectRoomManagement(ctx, storage, room)) return
    const agent = storage.getRoomAgent(roomId, requestedAgentId)
    if (!agent) {
        ctx.status = 404
        ctx.body = { error: 'Agent not found' }
        return
    }

    storage.removeRoomMembersForAgent(roomId, agent)
    storage.removeRoomAgent(roomId, requestedAgentId)
    chatServer.agentClients.removeAgentFromRoom(roomId, agent.agentId)
    ctx.body = {
        success: true,
        agents: storage.getRoomAgents(roomId),
        members: storage.getRoomMembers(roomId),
    }
    if ((ctx.state as any)?.user) {
        audit.recordEvent({
            action: 'group_chat_room.remove_agent',
            actor: { id: (ctx.state as any).user.id, username: (ctx.state as any).user.username, role: (ctx.state as any).user.role },
            profile: String(room.profile || '').trim(),
            targetType: 'group_chat_room',
            targetId: roomId,
            description: `Removed agent "${agent.name || agent.profile}" from room "${room.name}"`,
        })
    }
}

export async function deleteRoom(ctx: Context) {
    if (!chatServer) {
        ctx.status = 503
        ctx.body = { error: 'Group chat not initialized' }
        return
    }

    const roomId = ctx.params.roomId
    const storage = chatServer.getStorage()
    const room = storage.getRoom(roomId)
    if (!room) {
        ctx.status = 404
        ctx.body = { error: 'Room not found' }
        return
    }
    if (rejectRoomAccess(ctx, storage, room)) return
    if (rejectRoomManagement(ctx, storage, room)) return
    // Disconnect all agents in room
    chatServer.agentClients.disconnectRoom(roomId)
    // Delete all data
    const roomName = room.name
    const roomProfile = String(room.profile || '').trim()
    storage.deleteRoom(roomId)
    ctx.body = { success: true }
    if ((ctx.state as any)?.user) {
        audit.recordEvent({
            action: 'group_chat_room.delete',
            actor: { id: (ctx.state as any).user.id, username: (ctx.state as any).user.username, role: (ctx.state as any).user.role },
            profile: roomProfile,
            targetType: 'group_chat_room',
            targetId: roomId,
            description: `Deleted group chat room "${roomName}"`,
        })
    }
}

export async function clearRoomContext(ctx: Context) {
    if (!chatServer) {
        ctx.status = 503
        ctx.body = { error: 'Group chat not initialized' }
        return
    }

    const roomId = ctx.params.roomId
    const storage = chatServer.getStorage()
    const room = storage.getRoom(roomId)
    if (!room) {
        ctx.status = 404
        ctx.body = { error: 'Room not found' }
        return
    }
    if (rejectRoomAccess(ctx, storage, room)) return
    if (rejectRoomManagement(ctx, storage, room)) return

    storage.clearRoomContext(roomId)
    chatServer.clearRoomRuntimeState(roomId)
    const updatedRoom = storage.getRoom(roomId)
    ctx.body = { success: true, room: updatedRoom ? presentRoom(ctx, storage, updatedRoom) : updatedRoom }
}

export async function updateRoomConfig(ctx: Context) {
    if (!chatServer) {
        ctx.status = 503
        ctx.body = { error: 'Group chat not initialized' }
        return
    }

    const roomId = ctx.params.roomId
    const { triggerTokens, maxHistoryTokens, tailMessageCount } = ctx.request.body as {
        triggerTokens?: number
        maxHistoryTokens?: number
        tailMessageCount?: number
    }

    const storage = chatServer.getStorage()
    const room = storage.getRoom(roomId)
    if (!room) {
        ctx.status = 404
        ctx.body = { error: 'Room not found' }
        return
    }
    if (rejectRoomAccess(ctx, storage, room)) return
    if (rejectRoomManagement(ctx, storage, room)) return
    storage.updateRoomConfig(roomId, { triggerTokens, maxHistoryTokens, tailMessageCount })
    const updatedRoom = storage.getRoom(roomId)
    ctx.body = { room: updatedRoom ? presentRoom(ctx, storage, updatedRoom) : updatedRoom }
    if ((ctx.state as any)?.user) {
        audit.recordEvent({
            action: 'group_chat_room.update_config',
            actor: { id: (ctx.state as any).user.id, username: (ctx.state as any).user.username, role: (ctx.state as any).user.role },
            profile: String(room.profile || '').trim(),
            targetType: 'group_chat_room',
            targetId: roomId,
            description: `Updated config for room "${room.name}"`,
        })
    }
}

export async function compressRoom(ctx: Context) {
    if (!chatServer) {
        ctx.status = 503
        ctx.body = { error: 'Group chat not initialized' }
        return
    }

    const roomId = ctx.params.roomId
    const storage = chatServer.getStorage()
    const room = storage.getRoom(roomId)
    if (!room) {
        ctx.status = 404
        ctx.body = { error: 'Room not found' }
        return
    }
    if (rejectRoomAccess(ctx, storage, room)) return
    if (rejectRoomManagement(ctx, storage, room)) return

    const engine = chatServer.getContextEngine()
    if (!engine) {
        ctx.status = 503
        ctx.body = { error: 'Context engine not available' }
        return
    }

    try {
        const result = await engine.forceCompress(roomId)
        ctx.body = { success: true, summary: result }
    } catch (err: any) {
        ctx.status = 500
        ctx.body = { error: err.message }
    }
}

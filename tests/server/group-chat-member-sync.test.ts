import { describe, expect, it, vi, beforeEach } from 'vitest'

const { socketHandlers, mockSocket, mockIo } = vi.hoisted(() => {
  const socketHandlers = new Map<string, (...args: any[]) => void>()
  const mockSocket: any = {
    id: 'socket-1',
    connected: true,
    io: { on: vi.fn() },
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      socketHandlers.set(event, handler)
      if (event === 'connect') queueMicrotask(() => handler())
      return mockSocket
    }),
    emit: vi.fn(),
    disconnect: vi.fn(),
  }
  const mockIo = vi.fn(() => mockSocket)
  return { socketHandlers, mockSocket, mockIo }
})
const mockUserCanAccessProfile = vi.hoisted(() => vi.fn())
const mockFindUserById = vi.hoisted(() => vi.fn())

vi.mock('socket.io-client', () => ({
  io: mockIo,
}))

vi.mock('../../packages/server/src/services/auth', () => ({
  getToken: vi.fn(async () => 'test-token'),
}))

vi.mock('../../packages/server/src/middleware/user-auth', () => ({
  authenticateUserToken: vi.fn(),
  isAuthEnabled: vi.fn(async () => false),
  isRegularUser: (user: any) => user?.role === 'user',
  isSuperAdmin: (user: any) => user?.role === 'super_admin',
  isProfileAdmin: (user: any) => user?.role === 'admin' || user?.role === 'super_admin',
}))

vi.mock('../../packages/server/src/db/hermes/users-store', () => ({
  findUserByUsername: vi.fn(),
  findUserById: mockFindUserById,
  getUserAvatar: vi.fn(() => ''),
  userCanAccessProfile: mockUserCanAccessProfile,
}))

import { AgentClients } from '../../packages/server/src/services/hermes/group-chat/agent-clients'
import { GroupChatServer } from '../../packages/server/src/services/hermes/group-chat'
import { groupChatRoutes, setGroupChatServer } from '../../packages/server/src/routes/hermes/group-chat'

function routeHandler(path: string, method: string) {
  const layer = (groupChatRoutes as any).stack.find((item: any) => item.path === path && item.methods.includes(method))
  if (!layer) throw new Error(`Route not found: ${method} ${path}`)
  return layer.stack[0]
}

describe('Group Chat member/agent identity sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    socketHandlers.clear()
    mockUserCanAccessProfile.mockReturnValue(true)
    mockFindUserById.mockReturnValue(null)
  })

  it('uses the persisted group-chat agent id as the runtime agent id and socket user id', async () => {
    const clients = new AgentClients()

    const client = await clients.createAgent({
      agentId: 'agent-stable-1',
      profile: 'default',
      name: 'Worker',
      description: '',
      invited: 0,
    } as any)

    expect(client.agentId).toBe('agent-stable-1')
    expect(mockIo).toHaveBeenCalledWith(
      'http://127.0.0.1:8648/group-chat',
      expect.objectContaining({
        auth: expect.objectContaining({
          token: 'test-token',
          userId: 'agent-stable-1',
          name: 'Worker',
          source: 'agent',
          agentSocketSecret: expect.any(String),
        }),
      }),
    )
  })

  it('passes the same persisted agent id into the runtime client when adding an agent', async () => {
    const addRoomAgent = vi.fn((roomId: string, agentId: string, profile: string, name: string, description: string, invited: number) => ({
      id: 'row-1', roomId, agentId, profile, name, description, invited,
    }))
    const chatServer = {
      getStorage: () => ({
        getRoom: vi.fn(() => ({ id: 'room-1', name: 'Room', inviteCode: null, profile: 'default' })),
        getRoomAgents: vi.fn(() => []),
        addRoomAgent,
      }),
      agentClients: {
        createAgent: vi.fn(async () => ({ agentId: 'runtime-agent' })),
        addAgentToRoom: vi.fn(async () => undefined),
      },
    }
    setGroupChatServer(chatServer as any)

    const handler = routeHandler('/api/hermes/group-chat/rooms/:roomId/agents', 'POST')
    const ctx: any = {
      params: { roomId: 'room-1' },
      request: { body: { profile: 'default', name: 'Worker' } },
      status: 200,
      body: undefined,
    }
    await handler(ctx, async () => {})

    const persisted = ctx.body.agent
    expect(persisted.agentId).toBeTruthy()
    expect(chatServer.agentClients.createAgent).toHaveBeenCalledWith(expect.objectContaining({
      agentId: persisted.agentId,
      profile: 'default',
      name: 'Worker',
    }))
  })

  it('does not persist an agent when the runtime client cannot connect', async () => {
    const addRoomAgent = vi.fn()
    const chatServer = {
      getStorage: () => ({
        getRoom: vi.fn(() => ({ id: 'room-1', name: 'Room', inviteCode: null, profile: 'default' })),
        getRoomAgents: vi.fn(() => []),
        addRoomAgent,
      }),
      agentClients: {
        createAgent: vi.fn(async () => {
          throw new Error('Connection timeout')
        }),
        addAgentToRoom: vi.fn(),
        removeAgentFromRoom: vi.fn(),
      },
    }
    setGroupChatServer(chatServer as any)

    const handler = routeHandler('/api/hermes/group-chat/rooms/:roomId/agents', 'POST')
    const ctx: any = {
      params: { roomId: 'room-1' },
      request: { body: { profile: 'default', name: 'Worker' } },
      status: 200,
      body: undefined,
    }
    await handler(ctx, async () => {})

    expect(ctx.status).toBe(502)
    expect(ctx.body).toMatchObject({
      code: 'PROFILE_AGENT_CONNECT_FAILED',
      profile: 'default',
      reason: 'Connection timeout',
    })
    expect(addRoomAgent).not.toHaveBeenCalled()
  })

  it('does not persist an agent and disconnects runtime state when room join fails', async () => {
    const addRoomAgent = vi.fn()
    const runtimeClient = { agentId: 'agent-stable-1' }
    const chatServer = {
      getStorage: () => ({
        getRoom: vi.fn(() => ({ id: 'room-1', name: 'Room', inviteCode: null, profile: 'default' })),
        getRoomAgents: vi.fn(() => []),
        addRoomAgent,
      }),
      agentClients: {
        createAgent: vi.fn(async () => runtimeClient),
        addAgentToRoom: vi.fn(async () => {
          throw new Error('join failed')
        }),
        removeAgentFromRoom: vi.fn(),
      },
    }
    setGroupChatServer(chatServer as any)

    const handler = routeHandler('/api/hermes/group-chat/rooms/:roomId/agents', 'POST')
    const ctx: any = {
      params: { roomId: 'room-1' },
      request: { body: { profile: 'default', name: 'Worker' } },
      status: 200,
      body: undefined,
    }
    await handler(ctx, async () => {})

    expect(ctx.status).toBe(502)
    expect(ctx.body).toMatchObject({
      code: 'PROFILE_AGENT_CONNECT_FAILED',
      profile: 'default',
      reason: 'join failed',
    })
    expect(addRoomAgent).not.toHaveBeenCalled()
    expect(chatServer.agentClients.removeAgentFromRoom).toHaveBeenCalledWith('room-1', 'agent-stable-1')
  })

  it('rolls back AgentClients room state when joining a room fails', async () => {
    const clients = new AgentClients()
    const runtimeClient = {
      agentId: 'agent-stable-1',
      name: 'Worker',
      joinRoom: vi.fn(async () => {
        throw new Error('join failed')
      }),
      disconnect: vi.fn(),
    }

    await expect(clients.addAgentToRoom('room-1', runtimeClient as any)).rejects.toThrow('join failed')

    expect(runtimeClient.disconnect).toHaveBeenCalled()
    expect(clients.getAgents('room-1')).toEqual([])
  })

  it('removes the runtime agent by persisted agentId and returns synchronized room state', async () => {
    const agentsBefore = [{ id: 'row-1', roomId: 'room-1', agentId: 'agent-stable-1', profile: 'default', name: 'Worker', description: '', invited: 0 }]
    const storage = {
      getRoom: vi.fn(() => ({ id: 'room-1', name: 'Room', inviteCode: null, profile: 'default' })),
      getRoomAgent: vi.fn(() => agentsBefore[0]),
      getRoomAgents: vi.fn(() => []),
      removeRoomMembersForAgent: vi.fn(),
      removeRoomAgent: vi.fn(),
      getRoomMembers: vi.fn(() => [{ id: 'member-1', userId: 'human-1', name: 'Han', description: '', joinedAt: 1 }]),
    }
    const chatServer = {
      getStorage: () => storage,
      agentClients: { removeAgentFromRoom: vi.fn() },
    }
    setGroupChatServer(chatServer as any)

    const handler = routeHandler('/api/hermes/group-chat/rooms/:roomId/agents/:agentId', 'DELETE')
    const ctx: any = {
      params: { roomId: 'room-1', agentId: 'row-1' },
      status: 200,
      body: undefined,
    }
    await handler(ctx, async () => {})

    expect(chatServer.agentClients.removeAgentFromRoom).toHaveBeenCalledWith('room-1', 'agent-stable-1')
    expect(storage.removeRoomMembersForAgent).toHaveBeenCalledWith('room-1', agentsBefore[0])
    expect(storage.removeRoomAgent).toHaveBeenCalledWith('room-1', 'row-1')
    expect(ctx.body).toEqual({
      success: true,
      agents: [],
      members: [{ id: 'member-1', userId: 'human-1', name: 'Han', description: '', joinedAt: 1 }],
    })
  })

  it('filters room list to rooms containing one of the regular admin profiles', async () => {
    const allRooms = [
      { id: 'room-default', name: 'Default', inviteCode: null },
      { id: 'room-private', name: 'Private', inviteCode: null },
    ]
    const visibleRooms = [allRooms[0]]
    const storage = {
      getAllRooms: vi.fn(() => allRooms),
      getRoomsForProfiles: vi.fn(() => visibleRooms),
    }
    setGroupChatServer({ getStorage: () => storage } as any)

    const handler = routeHandler('/api/hermes/group-chat/rooms', 'GET')
    const ctx: any = {
      state: { user: { id: 2, username: 'ops', role: 'admin', profiles: ['default', 'research'] } },
      status: 200,
      body: undefined,
    }
    await handler(ctx, async () => {})

    expect(storage.getRoomsForProfiles).toHaveBeenCalledWith(['default', 'research'])
    expect(storage.getAllRooms).not.toHaveBeenCalled()
    expect(ctx.body).toEqual({ rooms: [{ ...visibleRooms[0], canManage: false, canAssignOwner: true }] })
  })

  it('scopes empty rooms created by regular users to the active profile', async () => {
    const saveRoom = vi.fn()
    const storage = {
      saveRoom,
      getRoom: vi.fn((roomId: string) => ({ id: roomId, name: 'Standup', inviteCode: 'ABC123', profile: 'travel' })),
    }
    setGroupChatServer({ getStorage: () => storage, agentClients: { createAgent: vi.fn() } } as any)

    const handler = routeHandler('/api/hermes/group-chat/rooms', 'POST')
    const ctx: any = {
      state: { user: { id: 7, username: 'han', role: 'user', profiles: ['default', 'travel'] }, profile: { name: 'travel' } },
      request: { body: { name: 'Standup', inviteCode: 'ABC123', agents: [] } },
      status: 200,
      body: undefined,
    }
    await handler(ctx, async () => {})

    expect(saveRoom).toHaveBeenCalledWith(expect.any(String), 'Standup', 'ABC123', undefined, 'travel', 7)
    expect(ctx.body.room).toMatchObject({ profile: 'travel' })
  })

  it('rejects regular users creating rooms with unauthorized agent profiles', async () => {
    const saveRoom = vi.fn()
    setGroupChatServer({ getStorage: () => ({ saveRoom }) } as any)

    const handler = routeHandler('/api/hermes/group-chat/rooms', 'POST')
    const ctx: any = {
      state: { user: { id: 7, username: 'han', role: 'user', profiles: ['default'] }, profile: { name: 'default' } },
      request: { body: { name: 'Secret', inviteCode: 'ABC123', agents: [{ profile: 'secret' }] } },
      status: 200,
      body: undefined,
    }
    await handler(ctx, async () => {})

    expect(ctx.status).toBe(403)
    expect(saveRoom).not.toHaveBeenCalled()
  })

  it('rejects rooms that mix agents from another authorized profile', async () => {
    const saveRoom = vi.fn()
    setGroupChatServer({ getStorage: () => ({ saveRoom }) } as any)

    const handler = routeHandler('/api/hermes/group-chat/rooms', 'POST')
    const ctx: any = {
      state: { user: { id: 7, username: 'han', role: 'user', profiles: ['default', 'travel'] }, profile: { name: 'default' } },
      request: { body: { name: 'Mixed', inviteCode: 'ABC123', agents: [{ profile: 'travel' }] } },
      status: 200,
      body: undefined,
    }
    await handler(ctx, async () => {})

    expect(ctx.status).toBe(400)
    expect(saveRoom).not.toHaveBeenCalled()
  })

  it('shows regular users only rooms they own or joined', async () => {
    const rooms = [
      { id: 'owned', profile: 'default', ownerUserId: 7 },
      { id: 'joined', profile: 'default', ownerUserId: 8 },
      { id: 'other', profile: 'default', ownerUserId: 8 },
    ]
    const storage = {
      getRoomsForProfiles: vi.fn(() => rooms),
      getRoomAgents: vi.fn(() => []),
      isRoomMemberByAuthUserId: vi.fn((roomId: string) => roomId === 'joined'),
    }
    setGroupChatServer({ getStorage: () => storage } as any)

    const handler = routeHandler('/api/hermes/group-chat/rooms', 'GET')
    const ctx: any = {
      state: { user: { id: 7, username: 'han', role: 'user', profiles: ['default'] } },
      status: 200,
      body: undefined,
    }
    await handler(ctx, async () => {})

    expect(ctx.body.rooms.map((room: any) => room.id)).toEqual(['owned', 'joined'])
  })

  it('requires profile administrators to join before reading room messages', async () => {
    const room = { id: 'room-1', profile: 'default', ownerUserId: 7 }
    const storage = {
      getRoom: vi.fn(() => room),
      getRoomAgents: vi.fn(() => []),
      isRoomMemberByAuthUserId: vi.fn(() => false),
    }
    setGroupChatServer({ getStorage: () => storage } as any)

    const handler = routeHandler('/api/hermes/group-chat/rooms/:roomId', 'GET')
    const ctx: any = {
      state: { user: { id: 3, username: 'ops', role: 'admin', profiles: ['default'] } },
      params: { roomId: 'room-1' },
      query: {},
      status: 200,
      body: undefined,
    }
    await handler(ctx, async () => {})

    expect(ctx.status).toBe(403)
  })

  it('keeps room list unrestricted for super admins', async () => {
    const rooms = [{ id: 'room-1', name: 'All', inviteCode: null }]
    const storage = {
      getAllRooms: vi.fn(() => rooms),
      getRoomsForProfiles: vi.fn(() => []),
    }
    setGroupChatServer({ getStorage: () => storage } as any)

    const handler = routeHandler('/api/hermes/group-chat/rooms', 'GET')
    const ctx: any = {
      state: { user: { id: 1, username: 'admin', role: 'super_admin' } },
      status: 200,
      body: undefined,
    }
    await handler(ctx, async () => {})

    expect(storage.getAllRooms).toHaveBeenCalledOnce()
    expect(storage.getRoomsForProfiles).not.toHaveBeenCalled()
    expect(ctx.body).toEqual({ rooms: [{ ...rooms[0], canManage: false, canAssignOwner: true }] })
  })

  it('rechecks database profile access for direct admin room access', async () => {
    const room = { id: 'room-1', profile: 'research', ownerUserId: 7 }
    const storage = {
      getRoom: vi.fn(() => room),
      getRoomAgents: vi.fn(() => []),
      isRoomMemberByAuthUserId: vi.fn(() => true),
    }
    setGroupChatServer({ getStorage: () => storage } as any)
    mockUserCanAccessProfile.mockReturnValue(false)

    const handler = routeHandler('/api/hermes/group-chat/rooms/:roomId', 'GET')
    const ctx: any = {
      state: { user: { id: 3, username: 'ops', role: 'admin', profiles: ['research'] } },
      params: { roomId: 'room-1' },
      query: {},
      status: 200,
      body: undefined,
    }
    await handler(ctx, async () => {})

    expect(ctx.status).toBe(403)
    expect(mockUserCanAccessProfile).toHaveBeenCalledWith(3, 'research')
  })

  it('freezes ownerless rooms until a profile administrator assigns an eligible owner', async () => {
    const room = { id: 'room-1', profile: 'default', ownerUserId: null }
    const updatedRoom = { ...room, ownerUserId: 7 }
    const storage = {
      getRoom: vi.fn()
        .mockReturnValueOnce(room)
        .mockReturnValueOnce(updatedRoom),
      getRoomAgents: vi.fn(() => []),
      updateRoomOwner: vi.fn(),
    }
    setGroupChatServer({ getStorage: () => storage } as any)
    mockFindUserById.mockReturnValue({ id: 7, role: 'user', status: 'active' })

    const handler = routeHandler('/api/hermes/group-chat/rooms/:roomId/owner', 'PUT')
    const ctx: any = {
      state: { user: { id: 3, username: 'ops', role: 'admin', profiles: ['default'] } },
      params: { roomId: 'room-1' },
      request: { body: { userId: 7 } },
      status: 200,
      body: undefined,
    }
    await handler(ctx, async () => {})

    expect(storage.updateRoomOwner).toHaveBeenCalledWith('room-1', 7)
    expect(ctx.body.room).toEqual(expect.objectContaining({
      ownerUserId: 7,
      canManage: true,
      canAssignOwner: true,
    }))
  })

  it('rechecks current profile bindings for regular-user socket room access', () => {
    const server = Object.create(GroupChatServer.prototype) as any
    server.socketAuthenticatedUserMap = new Map()
    server.storage = {
      getRoom: vi.fn(() => ({ id: 'room-1', profile: 'research' })),
      getRoomAgents: vi.fn(() => [{ profile: 'research' }]),
    }
    const socket = {
      id: 'socket-1',
      data: {
        user: { id: 7, username: 'han', role: 'user', profiles: ['research'] },
      },
    }
    mockUserCanAccessProfile.mockReturnValue(false)

    expect(server.canSocketAccessRoom(socket, 'room-1')).toBe(false)
    expect(mockUserCanAccessProfile).toHaveBeenCalledWith(7, 'research')
  })

  it('routes @mentions from users and bounded agent replies', () => {
    const server = Object.create(GroupChatServer.prototype) as any
    const emit = vi.fn()
    server.rooms = new Map([
      ['room-1', {
        hasOnlineMember: vi.fn(() => true),
        getOnlineMemberBySocketId: vi.fn((socketId: string) => socketId === 'agent-socket'
          ? { userId: 'agent-1', name: '丫鬟', source: 'agent' }
          : { userId: 'human-1', name: 'Human', source: 'human' }),
      }],
    ])
    server.socketUserMap = new Map([
      ['human-socket', 'human-1'],
      ['agent-socket', 'agent-1'],
    ])
    server.userInfoMap = new Map([
      ['human-1', { name: 'Human', description: '' }],
      ['agent-1', { name: '丫鬟', description: '' }],
    ])
    server.agentClients = { processMentions: vi.fn(async () => undefined) }
    server.storage = {
      saveMessageAndRefreshRoom: vi.fn((msg: any) => ({ message: msg, totalTokens: 123 })),
    }
    server.nsp = { to: vi.fn(() => ({ emit })) }

    server.handleMessage({ id: 'human-socket' }, { roomId: 'room-1', content: '@all hi', role: 'user' }, vi.fn())
    expect(server.agentClients.processMentions).toHaveBeenCalledTimes(1)
    expect(server.agentClients.processMentions).toHaveBeenLastCalledWith('room-1', expect.objectContaining({
      content: '@all hi',
      senderId: 'human-1',
      mentionDepth: 0,
    }))

    server.agentClients.processMentions.mockClear()
    server.handleMessage({ id: 'agent-socket' }, { roomId: 'room-1', content: '@all agent says hi', role: 'assistant', mentionDepth: 1 }, vi.fn())
    expect(server.agentClients.processMentions).toHaveBeenCalledTimes(1)
    expect(server.agentClients.processMentions).toHaveBeenLastCalledWith('room-1', expect.objectContaining({
      content: '@all agent says hi',
      senderId: 'agent-1',
      mentionDepth: 1,
    }))

    server.agentClients.processMentions.mockClear()
    server.handleMessage({ id: 'agent-socket' }, { roomId: 'room-1', content: '@all too deep', role: 'assistant', mentionDepth: 4 }, vi.fn())
    expect(server.agentClients.processMentions).not.toHaveBeenCalled()
  })
})

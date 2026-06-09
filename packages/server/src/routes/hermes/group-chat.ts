import Router from '@koa/router'
import * as ctrl from '../../controllers/hermes/group-chat'

export const groupChatRoutes = new Router()

// Re-export server accessors so existing consumers don't break
export const setGroupChatServer = ctrl.setGroupChatServer
export const getGroupChatServer = ctrl.getGroupChatServer

// Create room
groupChatRoutes.post('/api/hermes/group-chat/rooms', ctrl.createRoom)

// Clone room roles/config without copying the conversation context.
groupChatRoutes.post('/api/hermes/group-chat/rooms/:roomId/clone', ctrl.cloneRoom)

// Get room detail and messages
groupChatRoutes.get('/api/hermes/group-chat/rooms/:roomId', ctrl.getRoom)

// List rooms
groupChatRoutes.get('/api/hermes/group-chat/rooms', ctrl.listRooms)

// Get room by invite code
groupChatRoutes.get('/api/hermes/group-chat/rooms/join/:code', ctrl.getRoomByInviteCode)

// Update room invite code
groupChatRoutes.put('/api/hermes/group-chat/rooms/:roomId/invite-code', ctrl.updateRoomInviteCode)

// Assign or transfer room ownership. Profile administrators only.
groupChatRoutes.put('/api/hermes/group-chat/rooms/:roomId/owner', ctrl.updateRoomOwner)

// Add agent to room
groupChatRoutes.post('/api/hermes/group-chat/rooms/:roomId/agents', ctrl.addAgentToRoom)

// List agents in room
groupChatRoutes.get('/api/hermes/group-chat/rooms/:roomId/agents', ctrl.listRoomAgents)

// Remove agent from room
groupChatRoutes.delete('/api/hermes/group-chat/rooms/:roomId/agents/:agentId', ctrl.removeAgentFromRoom)

// Delete room
groupChatRoutes.delete('/api/hermes/group-chat/rooms/:roomId', ctrl.deleteRoom)

// Clear current room context while keeping members, agents, and room config.
groupChatRoutes.post('/api/hermes/group-chat/rooms/:roomId/clear-context', ctrl.clearRoomContext)

// Update room compression config
groupChatRoutes.put('/api/hermes/group-chat/rooms/:roomId/config', ctrl.updateRoomConfig)

// Force compress a room's context
groupChatRoutes.post('/api/hermes/group-chat/rooms/:roomId/compress', ctrl.compressRoom)

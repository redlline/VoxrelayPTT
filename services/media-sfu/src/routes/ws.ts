import { FastifyInstance } from 'fastify';
import { getRedis } from '../lib/redis.js';
import { SfuSignalingHandler } from '../services/sfu-signaling.js';
import { floorControlManager } from '../floor-control/index.js';
import { setWsConnections, recordWsMessage } from '../lib/metrics.js';
import { logger } from '../lib/logger.js';
import { checkWsRateLimit } from '../lib/rate-limit.js';
import { getDb } from '../db/connection.js';
import { roomManager } from '../mediasoup/room-manager.js';
interface ClientInfo {
  userId: string;
  displayName: string;
  role: string;
  socket: any;
  handler: SfuSignalingHandler;
}

const clients = new Map<string, ClientInfo>();
const userSockets = new Map<string, Set<string>>();
const channelClients = new Map<string, Set<string>>();
import { directCallChannels } from '../lib/direct-calls.js';

function addClientToChannel(clientId: string, channelId: string): void {
  if (!channelClients.has(channelId)) {
    channelClients.set(channelId, new Set());
  }
  channelClients.get(channelId)!.add(clientId);
}

function removeClientFromChannel(clientId: string, channelId: string): void {
  const members = channelClients.get(channelId);
  if (!members) return;
  members.delete(clientId);
  if (members.size === 0) {
    channelClients.delete(channelId);
  }
}

function removeClientFromAllChannels(clientId: string): void {
  for (const [channelId, members] of channelClients) {
    if (members.delete(clientId) && members.size === 0) {
      channelClients.delete(channelId);
    }
  }
}

export function broadcastToChannel(channelId: string, msg: any, excludeUserId?: string): void {
  const data = JSON.stringify(msg);
  const members = channelClients.get(channelId);
  if (!members) return;
  for (const clientId of members) {
    const client = clients.get(clientId);
    if (!client) continue;
    if (excludeUserId && client.userId === excludeUserId) continue;
    if (client.socket.readyState === 1) {
      client.socket.send(data);
    }
  }
}

export function broadcastToDispatchers(msg: any): void {
  const data = JSON.stringify(msg);
  for (const [, client] of clients) {
    if (client.role !== 'admin' && client.role !== 'dispatcher') continue;
    if (client.socket.readyState === 1) {
      client.socket.send(data);
    }
  }
}

export async function wsRoutes(app: FastifyInstance) {
  // This process starts with no live sockets, so any presence state left over
  // in Redis from a previous (e.g. crashed) instance is stale — reset it.
  try {
    const redis = getRedis();
    await redis.del('online_users');
    await redis.del('user_channels');
  } catch (err) {
    logger.warn({ err }, 'Failed to reset presence state on startup');
  }

  app.get('/ws', { websocket: true }, async (socket, request) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      socket.close(4001, 'Authentication required');
      return;
    }

    let payload: { sub: string; role: string; displayName: string };
    try {
      payload = app.jwt.verify(token) as any;
    } catch {
      socket.close(4001, 'Invalid token');
      return;
    }

    const clientId = crypto.randomUUID();
    const redis = getRedis();
    const isNewUser = !userSockets.has(payload.sub) || userSockets.get(payload.sub)!.size === 0;
    redis.sadd('online_users', payload.sub);

    if (!userSockets.has(payload.sub)) {
      userSockets.set(payload.sub, new Set());
    }
    userSockets.get(payload.sub)!.add(clientId);

    // Send current online users list to the connecting client (including self)
    redis.smembers('online_users').then((onlineIds: string[]) => {
      // Include all online users (others will see self too via user.online broadcast)
      sendToSocket(socket, { type: 'online_users', userIds: onlineIds });
    }).catch(() => {});

    const handler = new SfuSignalingHandler(
      (msg: any) => {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify(msg));
        }
      },
      payload.sub,
      payload.displayName || '',
      payload.role,
      broadcastToChannel,
      broadcastToDispatchers,
      (channelId: string) => addClientToChannel(clientId, channelId),
      (channelId: string) => removeClientFromChannel(clientId, channelId),
    );

    const client: ClientInfo = {
      userId: payload.sub,
      displayName: payload.displayName || '',
      role: payload.role,
      socket,
      handler,
    };

    clients.set(clientId, client);
    setWsConnections(clients.size);

    // Only broadcast user.online if this is the first socket for this user
    if (isNewUser) {
      broadcastToAll({ type: 'user.online', userId: payload.sub }, payload.sub);
    }

    socket.on('message', async (rawData: any) => {
      try {
        const msg = JSON.parse(rawData.toString());

        if (msg.type === 'ping') {
          sendToSocket(socket, { type: 'pong' });
          return;
        }

        // Client requests current online users list
        if (msg.type === 'get_online_users') {
          redis.smembers('online_users').then((onlineIds: string[]) => {
            sendToSocket(socket, { type: 'online_users', userIds: onlineIds });
          }).catch(() => {});
          return;
        }

        if (msg.type === 'update-profile' && msg.displayName) {
          client.displayName = msg.displayName;
          handler.displayName = msg.displayName;
          return;
        }

        if (!(await checkWsRateLimit(payload.sub))) {
          sendToSocket(socket, { type: 'error', message: 'Rate limit exceeded' });
          return;
        }

        recordWsMessage(msg.type || 'unknown');

        // Chat message handling
        if (msg.type === 'chat.send') {
          await handleChatMessage(msg, payload);
          return;
        }

        // GPS location update
        if (msg.type === 'location.update') {
          await handleLocationUpdate(msg, payload);
          return;
        }

        // Direct PTT 1:1
        if (msg.type === 'direct_ptt.call') {
          await handleDirectPttCall(msg, payload, clientId);
          return;
        }
        if (msg.type === 'direct_ptt.end') {
          await handleDirectPttEnd(msg, payload);
          return;
        }

        await handler.handle(msg);
      } catch (err) {
        logger.error({ err, userId: payload.sub }, 'WS message processing error');
        sendToSocket(socket, { type: 'error', message: 'Message processing failed' });
      }
    });

    socket.on('close', async () => {
      clients.delete(clientId);
      setWsConnections(clients.size);
      removeClientFromAllChannels(clientId);
      userSockets.get(payload.sub)?.delete(clientId);
      const remainingSockets = userSockets.get(payload.sub)?.size || 0;
      if (remainingSockets === 0) {
        userSockets.delete(payload.sub);
        redis.srem('online_users', payload.sub);
        redis.hdel('user_channels', payload.sub);
        broadcastToAll({ type: 'user.offline', userId: payload.sub }, payload.sub);
        await cleanupUserDirectCalls(payload.sub);
      }

      handler.cleanup();
    });
  });
}

function sendToSocket(socket: any, msg: any): void {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify(msg));
  }
}

export function sendToUser(userId: string, msg: any): void {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  const data = JSON.stringify(msg);
  for (const clientId of sockets) {
    const client = clients.get(clientId);
    if (client?.socket.readyState === 1) {
      client.socket.send(data);
    }
  }
}

// GPS location tracking
async function handleLocationUpdate(msg: any, payload: { sub: string }): Promise<void> {
  const { channelId, latitude, longitude, accuracy } = msg;
  if (!channelId || latitude == null || longitude == null) return;

  const sql = getDb();
  try {
    await sql`
      INSERT INTO user_locations (user_id, channel_id, latitude, longitude, accuracy, updated_at)
      VALUES (${payload.sub}::uuid, ${channelId}::uuid, ${latitude}, ${longitude}, ${accuracy ?? null}, NOW())
      ON CONFLICT (user_id, channel_id)
      DO UPDATE SET latitude = ${latitude}, longitude = ${longitude}, accuracy = ${accuracy ?? null}, updated_at = NOW()
    `;

    broadcastToChannel(channelId, {
      type: 'location.updated',
      userId: payload.sub,
      latitude,
      longitude,
      accuracy: accuracy ?? null,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, 'Location update error');
  }
}

// Direct PTT 1:1 — create a temp channel for two users
const activeCalls = new Map<string, string>(); // callId -> channelId

async function handleDirectPttCall(msg: any, payload: { sub: string; displayName: string; role: string }, callerClientId: string): Promise<void> {
  const { targetUserId, conversationId } = msg;
  if (!targetUserId || !conversationId) return;

  const sql = getDb();
  try {
    // Verify both are participants of the conversation
    const participants = await sql`
      SELECT user_id FROM conversation_participants
      WHERE conversation_id = ${conversationId}::uuid
    `;
    const userIds = participants.map((p: any) => p.user_id);
    if (!userIds.includes(payload.sub) || !userIds.includes(targetUserId)) return;

    // Create a temporary channel for the call
    const callId = crypto.randomUUID();
    const channelName = `Call: ${payload.displayName}`;

    const [channel] = await sql.begin(async (tx) => {
      const [c] = await tx`
        INSERT INTO channels (name, description, type, owner_id, is_active)
        VALUES (${channelName}, 'Direct call', 'private', ${payload.sub}, true)
        RETURNING *
      `;

      await tx`
        INSERT INTO channel_members (channel_id, user_id, role)
        VALUES (${c.id}, ${payload.sub}, 'owner')
      `;
      await tx`
        INSERT INTO channel_members (channel_id, user_id, role)
        VALUES (${c.id}, ${targetUserId}, 'member')
      `;

      return [c];
    });

    activeCalls.set(callId, channel.id);
    directCallChannels.add(channel.id);

    // Notify target user
    sendToUser(targetUserId, {
      type: 'direct_ptt.incoming',
      callId,
      channelId: channel.id,
      callerId: payload.sub,
      callerName: payload.displayName,
      conversationId,
      isDirectCall: true,
    });

    // Confirm to caller
    sendToUser(payload.sub, {
      type: 'direct_ptt.calling',
      callId,
      channelId: channel.id,
      targetUserId,
      conversationId,
      isDirectCall: true,
    });
  } catch (err) {
    logger.error({ err }, 'Direct PTT call error');
  }
}

async function handleDirectPttEnd(msg: any, payload: { sub: string; displayName: string; role: string }): Promise<void> {
  const { callId, channelId } = msg;
  if (!channelId) return;

  // Only allow members of the call channel to end it
  const sql = getDb();
  const [member] = await sql`
    SELECT user_id FROM channel_members
    WHERE channel_id = ${channelId}::uuid AND user_id = ${payload.sub}::uuid
  `;
  if (!member) return;

  await endDirectCall(channelId, callId);
}

async function endDirectCall(channelId: string, callId?: string): Promise<void> {
  // Notify all channel members that the call ended
  broadcastToChannel(channelId, {
    type: 'direct_ptt.ended',
    channelId,
  });

  // Delete the temporary call channel from DB completely
  try {
    const sql = getDb();
    await sql`DELETE FROM channel_members WHERE channel_id = ${channelId}::uuid`;
    await sql`DELETE FROM channels WHERE id = ${channelId}::uuid`;
  } catch (err) {
    logger.error({ err }, 'Failed to delete call channel');
  }

  // Clean up mediasoup room and floor state for this channel
  try {
    directCallChannels.delete(channelId);
    await floorControlManager.forceRelease(channelId, 'Call ended');
    await roomManager.closeRoom(channelId);
  } catch (err) {
    logger.warn({ err }, 'Mediasoup room cleanup error');
  }

  // Clean up the active call tracker
  if (callId) {
    activeCalls.delete(callId);
  } else {
    for (const [id, ch] of activeCalls) {
      if (ch === channelId) activeCalls.delete(id);
    }
  }
}

// If a user disconnects without sending direct_ptt.end, tear down any
// direct-call channels they were a member of so they don't linger forever.
async function cleanupUserDirectCalls(userId: string): Promise<void> {
  if (directCallChannels.size === 0) return;
  const sql = getDb();
  for (const channelId of [...directCallChannels]) {
    try {
      const [member] = await sql`
        SELECT user_id FROM channel_members
        WHERE channel_id = ${channelId}::uuid AND user_id = ${userId}::uuid
      `;
      if (member) {
        await endDirectCall(channelId);
      }
    } catch (err) {
      logger.warn({ err, channelId }, 'Failed to clean up direct call on disconnect');
    }
  }
}

async function handleChatMessage(msg: any, payload: { sub: string; displayName: string }): Promise<void> {
  const { conversationId, content, type, metadata } = msg;
  if (!conversationId || !content || typeof content !== 'string' || content.length > 5000) {
    return;
  }

  const sql = getDb();
  try {
    const [member] = await sql`
      SELECT id FROM conversation_participants
      WHERE conversation_id = ${conversationId}::uuid AND user_id = ${payload.sub}
    `;
    if (!member) return;

    const [message] = await sql`
      INSERT INTO messages (conversation_id, sender_id, content, type, metadata)
      VALUES (${conversationId}::uuid, ${payload.sub}, ${content}, ${type || 'text'}, ${metadata ? JSON.stringify(metadata) : null})
      RETURNING *
    `;

    await sql`
      UPDATE conversations SET updated_at = NOW() WHERE id = ${conversationId}::uuid
    `;

    const evt = {
      type: 'message.new',
      message: {
        id: message.id,
        conversationId,
        senderId: payload.sub,
        content,
        messageType: type || 'text',
        metadata: metadata || null,
        createdAt: message.created_at,
        sender: { id: payload.sub, displayName: payload.displayName || '' },
      },
    };

    const participants = await sql`
      SELECT user_id FROM conversation_participants WHERE conversation_id = ${conversationId}::uuid
    `;
    for (const p of participants) {
      if (p.user_id !== payload.sub) {
        sendToUser(p.user_id, evt);
      }
    }
  } catch (err) {
    logger.error({ err, userId: payload.sub }, 'Chat message handling error');
  }
}

export function broadcastToAll(msg: any, excludeUserId?: string): void {
  const data = JSON.stringify(msg);
  for (const [, client] of clients) {
    if (excludeUserId && client.userId === excludeUserId) continue;
    if (client.socket.readyState === 1) {
      client.socket.send(data);
    }
  }
}

// Floor control event listeners — broadcast speaker-changed to channel + all dispatchers
const floorSpeakingStarted = (event: any) => {
  let producerId: string | null = null;
  const room = roomManager.getRoom(event.channelId);
  if (room) {
    for (const [id, producer] of room.producers) {
      if (producer.appData?.userId === event.userId && producer.kind === 'audio') {
        producerId = id;
        break;
      }
    }
  }
  broadcastToChannel(event.channelId, {
    type: 'speaker-changed',
    channelId: event.channelId,
    activeSpeaker: event.userId,
    displayName: event.displayName,
    producerId,
  });
  broadcastToDispatchers({
    type: 'speaker-changed',
    channelId: event.channelId,
    activeSpeaker: event.userId,
    displayName: event.displayName,
    producerId,
  });
};

const floorSpeakingStopped = (event: any) => {
  broadcastToChannel(event.channelId, {
    type: 'speaker-changed',
    channelId: event.channelId,
    activeSpeaker: null,
    producerId: null,
  });
  broadcastToDispatchers({
    type: 'speaker-changed',
    channelId: event.channelId,
    activeSpeaker: null,
    producerId: null,
  });
};

const floorPttGranted = (event: any) => {
  if (event.type === 'ptt.granted' && event.userId) {
    sendToUser(event.userId, {
      type: 'ptt.granted',
      channelId: event.channelId,
      userId: event.userId,
      displayName: event.displayName,
    });

    const room = roomManager.getRoom(event.channelId);
    if (room) {
      for (const producer of room.producers.values()) {
        if (producer.appData?.userId === event.userId && producer.kind === 'audio') {
          producer.resume().catch(() => {});
        }
      }
    }
  }
};

const floorPttForceRelease = (event: any) => {
  if (event.type === 'ptt.force_release' && event.userId) {
    sendToUser(event.userId, {
      type: 'ptt.force_release',
      channelId: event.channelId,
      userId: event.userId,
      reason: event.reason,
    });

    const room = roomManager.getRoom(event.channelId);
    if (room) {
      for (const producer of room.producers.values()) {
        if (producer.appData?.userId === event.userId && producer.kind === 'audio') {
          producer.pause().catch(() => {});
        }
      }
    }
  }
};

floorControlManager.on('speaking.started', floorSpeakingStarted);
floorControlManager.on('speaking.stopped', floorSpeakingStopped);
floorControlManager.on('ptt.granted', floorPttGranted);
floorControlManager.on('ptt.force_release', floorPttForceRelease);

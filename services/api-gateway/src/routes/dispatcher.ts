import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getRedis } from '../lib/redis.js';
import { floorControlManager } from '../floor-control/index.js';
import { getDb } from '../db/connection.js';
import { roomManager } from '../mediasoup/room-manager.js';
import { sendToUser } from './ws.js';

function requireDispatcher(request: any, reply: any) {
  const { role } = request.user as { role: string };
  if (role !== 'admin' && role !== 'dispatcher') {
    return reply.status(403).send({ error: 'Dispatcher access required' });
  }
}

export async function dispatcherRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', (request, reply, done) => {
    requireDispatcher(request, reply);
    done();
  });

  app.get('/channels', {
    schema: {
      summary: 'List channels with speaker status',
      description: 'Returns all active channels with their current speaker, member count, and recording status',
      tags: ['dispatcher'],
      response: { 200: { type: 'object', properties: { channels: { type: 'array' } } } },
    },
  }, async () => {
    const redis = getRedis();
    const sql = getDb();

    const channels = await sql`
      SELECT c.id, c.name, c.type,
        (SELECT COUNT(*) FROM recording_sessions WHERE channel_id = c.id AND ended_at IS NULL) > 0 as is_recording
      FROM channels c WHERE c.is_active = true
    `;

    const result = [];
    for (const ch of channels) {
      const speakerId = await redis.get(`floor:speaker:${ch.id}`);
      const memberCount = await redis.scard(`channel:${ch.id}:members`);

      result.push({
        id: ch.id,
        name: ch.name,
        type: ch.type,
        memberCount,
        currentSpeaker: speakerId,
        isRecording: ch.isRecording,
      });
    }

    return { channels: result };
  });

  app.get('/users', {
    schema: {
      summary: 'List users with online status',
      description: 'Returns all users with their online status, role, and current listening channel',
      tags: ['dispatcher'],
      response: { 200: { type: 'object', properties: { users: { type: 'array' } } } },
    },
  }, async () => {
    const redis = getRedis();
    const onlineIds = await redis.smembers('online_users');
    const onlineSet = new Set(onlineIds);

    const userChannels = await redis.hgetall('user_channels');

    const sql = getDb();
    const users = await sql`
      SELECT id, display_name, role, is_active, last_seen_at
      FROM users ORDER BY display_name
    `;

    return {
      users: users.map((u) => ({
        id: u.id,
        displayName: u.display_name,
        role: u.role,
        isActive: u.is_active,
        isOnline: onlineSet.has(u.id),
        lastSeen: u.last_seen_at,
        listeningChannel: userChannels[u.id] || null,
      })),
    };
  });

  app.get('/channels/:channelId/speaker', async (request) => {
    const { channelId } = z.object({ channelId: z.string().uuid() }).parse(request.params);
    const speakerId = floorControlManager.getSpeaker(channelId);

    if (!speakerId) {
      return { speaker: null };
    }

    const sql = getDb();
    const [user] = await sql`
      SELECT id, display_name FROM users WHERE id = ${speakerId}
    `;

    return {
      speaker: user
        ? { id: user.id, displayName: user.display_name }
        : { id: speakerId, displayName: 'Unknown' },
    };
  });

  app.post('/force-ptt', async (request, reply) => {
    const body = z.object({
      channelId: z.string().uuid(),
      targetUserId: z.string().uuid(),
    }).parse(request.body);

    const { sub: dispatcherId } = request.user as { sub: string };
    const sql = getDb();

    const [target] = await sql`
      SELECT id, display_name FROM users WHERE id = ${body.targetUserId}
    `;

    if (!target) {
      return reply.status(404).send({ error: 'Target user not found' });
    }

    await floorControlManager.remoteActivate(
      body.channelId,
      target.id,
      target.display_name,
      dispatcherId,
    );

    return { success: true, message: `Forced PTT activated for ${target.display_name}` };
  });

  app.post('/force-release', async (request, reply) => {
    const body = z.object({
      channelId: z.string().uuid(),
      targetUserId: z.string().uuid(),
    }).parse(request.body);

    await floorControlManager.remoteRelease(body.channelId, body.targetUserId);
    return { success: true };
  });

  app.post('/move-user', async (request, reply) => {
    const body = z.object({
      channelId: z.string().uuid(),
      targetUserId: z.string().uuid(),
    }).parse(request.body);

    const sql = getDb();

    const [channel] = await sql`
      SELECT id, name, type, is_active
      FROM channels
      WHERE id = ${body.channelId}
    `;
    if (!channel || !channel.is_active) {
      return reply.status(404).send({ error: 'Channel not found' });
    }

    const [target] = await sql`
      SELECT id, display_name, is_active
      FROM users
      WHERE id = ${body.targetUserId}
    `;
    if (!target || !target.is_active) {
      return reply.status(404).send({ error: 'Target user not found' });
    }

    const [membership] = await sql`
      SELECT id
      FROM channel_members
      WHERE channel_id = ${body.channelId} AND user_id = ${body.targetUserId}
    `;

    let assigned = false;
    if (!membership) {
      await sql`
        INSERT INTO channel_members (channel_id, user_id, role)
        VALUES (${body.channelId}, ${body.targetUserId}, 'member')
      `;
      assigned = true;
    }

    sendToUser(body.targetUserId, {
      type: 'dispatcher.open_channel',
      channelId: body.channelId,
      channelName: channel.name,
      source: 'dispatcher',
    });

    return {
      success: true,
      assigned,
      notified: true,
      message: `${target.display_name} moved to ${channel.name}`,
    };
  });

  app.get('/rooms', async () => {
    return {
      rooms: roomManager.getRoomCount(),
      workers: roomManager.getWorkerCount(),
    };
  });
}

import { FastifyInstance } from 'fastify';
import { getRedis } from '../lib/redis.js';
import { z } from 'zod';

function resolveTurnConfig() {
  const raw = process.env.TURN_SERVER;
  if (!raw) return null;

  const urls = raw.includes(',') ? raw.split(',').map(s => s.trim()) : raw;

  const username = process.env.TURN_USERNAME || process.env.TURN_USER;
  const credential = process.env.TURN_PASSWORD || process.env.TURN_CREDENTIAL;
  if (!username || !credential) return null;

  return { urls, username, credential };
}

export async function webrtcRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/config', async () => {
    const turnConfig = resolveTurnConfig();
    return {
      iceServers: [
        { urls: process.env.STUN_SERVER || 'stun:stun.l.google.com:19302' },
        ...(turnConfig
          ? [turnConfig]
          : []),
      ],
      codecs: [
        { mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
      ],
    };
  });

  app.post('/room/:channelId/join', async (request, reply) => {
    const { channelId } = z.object({ channelId: z.string().uuid() }).parse(request.params);
    const { sub: userId } = request.user as { sub: string };
    const redis = getRedis();

    const isMember = await redis.sismember(`channel:${channelId}:members`, userId);
    if (!isMember) {
      return reply.status(403).send({ error: 'Not a channel member' });
    }

    const peers = await redis.smembers(`webrtc:room:${channelId}:peers`);
    await redis.sadd(`webrtc:room:${channelId}:peers`, userId);

    return {
      channelId,
      userId,
      peers: peers.filter((p) => p !== userId),
    };
  });

  app.post('/room/:channelId/leave', async (request, reply) => {
    const { channelId } = z.object({ channelId: z.string().uuid() }).parse(request.params);
    const { sub: userId } = request.user as { sub: string };
    const redis = getRedis();

    await redis.srem(`webrtc:room:${channelId}:peers`, userId);
    return { success: true };
  });
}

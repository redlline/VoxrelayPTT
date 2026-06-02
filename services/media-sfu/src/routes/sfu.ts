import { FastifyInstance } from 'fastify';
import { roomManager } from '../mediasoup/room-manager.js';
import crypto from 'crypto';

function generateTurnCredentials(): { username: string; credential: string } {
  const turnSecret = process.env.TURN_SECRET || process.env.TURN_CREDENTIAL || 'dev-secret';
  const timestamp = Math.floor(Date.now() / 1000) + 86400;
  const username = `${timestamp}`;
  const hmac = crypto.createHmac('sha1', turnSecret);
  hmac.update(username);
  return { username, credential: hmac.digest('base64') };
}

function resolveTurnServerConfig(): null | {
  urls: string | string[];
  username: string;
  credential: string;
} {
  const raw = process.env.TURN_SERVER;
  if (!raw) return null;

  const urls = raw.includes(',') ? raw.split(',').map(s => s.trim()) : raw;

  const username = process.env.TURN_USERNAME;
  const password = process.env.TURN_PASSWORD;
  if (username && password) {
    return { urls, username, credential: password };
  }

  const turnCreds = generateTurnCredentials();
  return {
    urls,
    username: turnCreds.username,
    credential: turnCreds.credential,
  };
}

export async function sfuRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/config', {
    schema: {
      summary: 'Get WebRTC SFU config',
      description: 'Returns STUN/TURN servers and supported codecs for WebRTC connections',
      tags: ['sfu'],
      response: {
        200: {
          type: 'object',
          properties: {
            iceServers: { type: 'array' },
            codecs: { type: 'array' },
          },
        },
      },
    },
  }, async () => {
    const turnConfig = resolveTurnServerConfig();

    return {
      iceServers: [
        { urls: process.env.STUN_SERVER || 'stun:stun.l.google.com:19302' },
        ...(turnConfig
          ? [turnConfig]
          : []),
      ],
      codecs: [
        { mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
        { mimeType: 'video/VP8', clockRate: 90000 },
      ],
    };
  });

  app.get('/stats', async () => {
    return {
      workers: roomManager.getWorkerCount(),
      rooms: roomManager.getRoomCount(),
      initialized: roomManager.isInitialized(),
    };
  });

  app.get('/rooms/:channelId', async (request, reply) => {
    const { channelId } = request.params as { channelId: string };
    const room = roomManager.getRoom(channelId);

    if (!room) {
      return reply.status(404).send({ error: 'Room not active' });
    }

    return {
      channelId,
      transports: room.transports.size,
      producers: room.producers.size,
      consumers: room.consumers.size,
      hasPlainTransport: !!room.plainTransport,
    };
  });

  app.get('/rtp-capabilities/:channelId', async (request) => {
    const { channelId } = request.params as { channelId: string };
    const room = await roomManager.getOrCreateRoom(channelId);
    return { rtpCapabilities: room.router.rtpCapabilities };
  });
}

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { recordingManager } from '../recording/index.js';
import { startChannelRecording, stopChannelRecording } from '../recording/bridge.js';
import { floorControlManager } from '../floor-control/index.js';
import { getDb } from '../db/connection.js';

function getRecordingContentType(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.webm')) return 'audio/webm';
  return 'audio/ogg';
}

export async function recordingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/:channelId', async (request) => {
    const { channelId } = z.object({ channelId: z.string().uuid() }).parse(request.params);
    const query = z.object({
      limit: z.coerce.number().default(50),
      offset: z.coerce.number().default(0),
    }).parse(request.query);

    const sessions = await recordingManager.getSessions(channelId, query.limit, query.offset);
    return { sessions };
  });

  app.get('/session/:sessionId', async (request) => {
    const { sessionId } = z.object({ sessionId: z.string().uuid() }).parse(request.params);
    const segments = await recordingManager.getSegments(sessionId);
    return { segments };
  });

  app.get('/file/*', async (request, reply) => {
    const key = (request.params as any)['*'] as string;

    if (!key) {
      return reply.status(400).send({ error: 'File key is required' });
    }

    const buffer = await recordingManager.getAudioByKey(key);
    if (!buffer) {
      return reply.status(404).send({ error: 'Recording not found' });
    }

    reply.header('Content-Type', getRecordingContentType(key));
    reply.header('Content-Length', buffer.length.toString());
    reply.header('Accept-Ranges', 'bytes');

    return reply.send(buffer);
  });

  app.get('/active/:channelId', async (request) => {
    const { channelId } = z.object({ channelId: z.string().uuid() }).parse(request.params);
    const sessionId = recordingManager.getActiveSession(channelId);
    return { active: !!sessionId, sessionId };
  });

  app.post('/:channelId/start', {
    schema: {
      summary: 'Start manual recording',
      description: 'Force-start a recording session for a channel (dispatcher/admin only)',
      tags: ['recordings'],
      params: { type: 'object', properties: { channelId: { type: 'string', format: 'uuid' } } },
    },
  }, async (request, reply) => {
    const { channelId } = z.object({ channelId: z.string().uuid() }).parse(request.params);

    const active = recordingManager.getActiveSession(channelId);
    if (active) {
      return reply.status(409).send({ error: 'Recording already active', sessionId: active });
    }

    const speakerId = floorControlManager.getSpeaker(channelId);
    if (!speakerId) {
      return reply.status(400).send({ error: 'No active speaker to record' });
    }

    const sql = getDb();
    const [speaker] = await sql`SELECT display_name FROM users WHERE id = ${speakerId}`;
    const speakerName = speaker?.display_name || speakerId;

    await startChannelRecording(channelId, speakerId, speakerName);
    return { success: true, message: 'Recording started' };
  });

  app.post('/:channelId/stop', {
    schema: {
      summary: 'Stop manual recording',
      description: 'Force-stop an active recording session for a channel',
      tags: ['recordings'],
      params: { type: 'object', properties: { channelId: { type: 'string', format: 'uuid' } } },
    },
  }, async (request, reply) => {
    const { channelId } = z.object({ channelId: z.string().uuid() }).parse(request.params);

    const active = recordingManager.getActiveSession(channelId);
    if (!active) {
      return reply.status(404).send({ error: 'No active recording' });
    }

    await stopChannelRecording(channelId);
    return { success: true, message: 'Recording stopped' };
  });

  app.post('/:channelId/client-segment', async (request, reply) => {
    const { channelId } = z.object({ channelId: z.string().uuid() }).parse(request.params);
    const body = z.object({
      base64: z.string().min(1),
      durationMs: z.number().int().positive().max(600000),
      contentType: z.enum(['audio/wav', 'audio/ogg', 'audio/webm']).default('audio/wav'),
    }).parse(request.body);

    const { sub: userId, displayName } = request.user as { sub: string; displayName?: string };
    const buffer = Buffer.from(body.base64, 'base64');
    const extension = body.contentType === 'audio/webm'
      ? 'webm'
      : body.contentType === 'audio/ogg'
        ? 'ogg'
        : 'wav';

    const result = await recordingManager.saveUploadedSegment(
      channelId,
      userId,
      displayName || 'User',
      buffer,
      body.durationMs,
      { extension, contentType: body.contentType },
    );

    return reply.send({
      success: true,
      sessionId: result.sessionId,
      detached: result.detached,
      size: buffer.length,
    });
  });
}

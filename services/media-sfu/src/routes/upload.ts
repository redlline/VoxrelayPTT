import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getMinio } from '../lib/minio.js';
import { randomUUID } from 'crypto';

const BUCKET = 'voxrelay-uploads';
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_AUDIO_TYPES = ['audio/wav', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/x-wav', 'audio/wave', 'audio/x-pn-wav'];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_AUDIO_TYPES];

export async function uploadRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.post('/upload', async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    // Normalize audio mimetype — browsers may send application/octet-stream for wav
    let mimetype = file.mimetype;
    const filename = (file.filename || '').toLowerCase();
    request.log.info({ mimetype, filename, fieldname: file.fieldname }, 'Upload received');
    if (!ALLOWED_TYPES.includes(mimetype)) {
      // Try to detect by filename extension
      if (filename.endsWith('.wav') || filename.endsWith('.wave')) mimetype = 'audio/wav';
      else if (filename.endsWith('.webm')) mimetype = 'audio/webm';
      else if (filename.endsWith('.ogg')) mimetype = 'audio/ogg';
      else if (filename.endsWith('.mp4')) mimetype = 'audio/mp4';
      else if (filename.endsWith('.mp3')) mimetype = 'audio/mpeg';
      else if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) mimetype = 'image/jpeg';
      else if (filename.endsWith('.png')) mimetype = 'image/png';
      else if (filename.endsWith('.gif')) mimetype = 'image/gif';
      else if (filename.endsWith('.webp')) mimetype = 'image/webp';
    }

    if (!ALLOWED_TYPES.includes(mimetype)) {
      return reply.status(400).send({ error: `Invalid file type: ${file.mimetype}. Allowed: images (JPEG, PNG, GIF, WebP) and audio (WAV, WebM, OGG, MP4, MP3)` });
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    const chunks: Buffer[] = [];
    let totalSize = 0;

    for await (const chunk of file.file) {
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        return reply.status(400).send({ error: 'File too large. Max 10MB' });
      }
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    // Use normalized mimetype for extension
    const extMap: Record<string, string> = {
      'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/x-pn-wav': 'wav',
      'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3',
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
    };
    const ext = extMap[mimetype] || mimetype.split('/')[1] || 'bin';
    const key = `chat/${randomUUID()}.${ext}`;

    try {
      const minio = getMinio();
      await minio.putObject(BUCKET, key, buffer, buffer.length, {
        'Content-Type': mimetype,
      });

      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
      const host = process.env.UPLOAD_HOST || request.hostname;
      const url = `${protocol}://${host}/api/v1/files/${key}`;

      return reply.status(201).send({ url, key, mimetype: file.mimetype, size: buffer.length });
    } catch (err: any) {
      request.log.error({ err }, 'Upload failed');
      return reply.status(500).send({ error: 'Upload failed' });
    }
  });

  // Serve uploaded files
  app.get('/files/*', async (request, reply) => {
    const key = (request.params as any)['*'];
    if (!key) {
      return reply.status(400).send({ error: 'Missing file key' });
    }

    try {
      const minio = getMinio();
      const stream = await minio.getObject(BUCKET, key);
      const stat = await minio.statObject(BUCKET, key);

      reply.header('Content-Type', stat.metaData?.['content-type'] || 'application/octet-stream');
      reply.header('Content-Length', stat.size);
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      reply.header('X-Content-Type-Options', 'nosniff');

      return reply.send(stream);
    } catch {
      return reply.status(404).send({ error: 'File not found' });
    }
  });

}

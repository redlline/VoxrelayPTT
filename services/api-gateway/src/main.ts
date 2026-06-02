import Fastify, { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { channelRoutes } from './routes/channels.js';
import { adminRoutes } from './routes/admin.js';
import { wsRoutes } from './routes/ws.js';
import { sfuRoutes } from './routes/sfu.js';
import { recordingsRoutes } from './routes/recordings.js';
import { dispatcherRoutes } from './routes/dispatcher.js';
import { webrtcRoutes } from './routes/webrtc.js';
import { messageRoutes } from './routes/messages.js';
import { uploadRoutes } from './routes/upload.js';
import { connectDb } from './db/connection.js';
import { connectRedis } from './lib/redis.js';
import { seedDefaultData } from './db/seed.js';
import { runMigrations } from './db/migrate.js';
import { roomManager } from './mediasoup/room-manager.js';
import { ensureBucket } from './lib/minio.js';
import { getDb } from './db/connection.js';
import { initMetrics, getMetricsJson, updateMediasoupMetrics } from './lib/metrics.js';
import { setLogger } from './lib/logger.js';

function validateEnv() {
  const required = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'DB_PASSWORD', 'COOKIE_SECRET'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const JWT_SECRET = process.env.JWT_ACCESS_SECRET!;
  if (JWT_SECRET.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must be at least 32 characters long');
  }

  const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
  if (JWT_REFRESH_SECRET.length < 32) {
    throw new Error('JWT_REFRESH_SECRET must be at least 32 characters long');
  }

  if (process.env.COOKIE_SECRET!.length < 32) {
    throw new Error('COOKIE_SECRET must be at least 32 characters long');
  }

  if (process.env.NODE_ENV === 'production') {
    const prodRequired = ['CORS_ORIGIN', 'MEDIASOUP_ANNOUNCED_IP'];
    const prodMissing = prodRequired.filter(key => !process.env[key]);
    if (prodMissing.length > 0) {
      throw new Error(`Missing required production variables: ${prodMissing.join(', ')}`);
    }
  }
}

const PORT = parseInt(process.env.PORT || '3000');
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_ACCESS_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
const COOKIE_SECRET = process.env.COOKIE_SECRET!;
const INSTANCE_ID = process.env.INSTANCE_ID || '1';
const isProduction = process.env.NODE_ENV === 'production';

async function buildApp() {
  const app = Fastify({
    bodyLimit: 10 * 1024 * 1024,
    trustProxy: isProduction ? process.env.TRUSTED_PROXY_IPS?.split(',') : true,
    requestTimeout: 30000,
    logger: isProduction
      ? { level: process.env.LOG_LEVEL || 'info' }
      : {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true },
          },
        },
  });

  // Share app logger with module-level code
  setLogger(app.log);

  // CORS
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
    credentials: true,
  });

  // Signed cookies for integrity
  await app.register(cookie, {
    secret: COOKIE_SECRET,
    parseOptions: {},
  });

  // JWT config
  await app.register(jwt, {
    secret: JWT_SECRET,
    sign: { algorithm: 'HS256' },
    cookie: {
      cookieName: 'token',
      signed: true,
    },
  });

  // Global rate limit with per-IP tracking
  await app.register(rateLimit, {
    max: 1000,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      return request.ip;
    },
    skipOnError: false,
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'VoxRelay API',
        description: 'Push-to-Talk system API',
        version: '0.2.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, { routePrefix: '/docs' });
  await app.register(websocket);

  // Multipart for file uploads
  await app.register(import('@fastify/multipart'), {
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  });

  // Auth preHandler decorator (not provided by @fastify/jwt v9+)
  async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      await request.jwtVerify();
    } catch {
      reply.status(401).send({ error: 'Unauthorized' });
    }
  }
  app.decorate('authenticate', authenticate);

  // Routes
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(userRoutes, { prefix: '/api/v1/users' });
  await app.register(channelRoutes, { prefix: '/api/v1/channels' });
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });
  await app.register(sfuRoutes, { prefix: '/api/v1/sfu' });
  await app.register(webrtcRoutes, { prefix: '/api/v1/webrtc' });
  await app.register(recordingsRoutes, { prefix: '/api/v1/recordings' });
  await app.register(dispatcherRoutes, { prefix: '/api/v1/dispatcher' });
  await app.register(uploadRoutes, { prefix: '/api/v1' });
  await app.register(messageRoutes, { prefix: '/api/v1' });
  await app.register(wsRoutes);

  // Global error handler — structured JSON errors
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode || 500;
    const message = statusCode === 500 && isProduction
      ? 'Internal server error'
      : error.message;

    if (statusCode === 500) {
      request.log.error({ err: error, url: request.url }, 'Unhandled error');
    }

    reply.status(statusCode).send({
      error: message,
      statusCode,
      ...(error.validation && { validation: error.validation }),
    });
  });

  app.get('/health', async () => {
    const checks: Record<string, boolean> = {
      mediasoup: roomManager.isInitialized(),
    };

    try {
      const sql = getDb();
      await sql`SELECT 1`;
      checks.postgres = true;
    } catch {
      checks.postgres = false;
    }

    try {
      const { getRedis } = await import('./lib/redis.js');
      const redis = getRedis();
      await redis.ping();
      checks.redis = true;
    } catch {
      checks.redis = false;
    }

    const healthy = Object.values(checks).every(v => v);

    return {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
      rooms: roomManager.getRoomCount(),
    };
  });

  app.get('/metrics', async (request, reply) => {
    // Protect metrics endpoint with basic auth or internal IP check
    const authHeader = request.headers.authorization;
    const metricsToken = process.env.METRICS_TOKEN;

    if (metricsToken && authHeader !== `Bearer ${metricsToken}`) {
      reply.status(401).send({ error: 'Unauthorized' });
      return;
    }

    updateMediasoupMetrics();
    reply.header('Content-Type', 'text/plain');
    return await getMetricsJson();
  });

  return app;
}

async function main() {
  validateEnv();

  await connectDb();
  await connectRedis();
  await runMigrations();
  await seedDefaultData();

  // Init Mediasoup
  await roomManager.init();
  initMetrics();

  const app = await buildApp();

  // Init MinIO bucket (non-fatal)
  try {
    await ensureBucket();
    app.log.info('MinIO bucket ready');
  } catch (err: any) {
    app.log.warn({ err }, 'MinIO not available — recordings will be disabled');
  }

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`VoxRelay API v0.2 instance=${INSTANCE_ID} running at http://${HOST}:${PORT}`);
    app.log.info(`Swagger docs at http://${HOST}:${PORT}/docs`);
    app.log.info(`Mediasoup: ${roomManager.getWorkerCount()} workers, ${roomManager.getRoomCount()} rooms`);

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      app.log.info(`${signal} received, starting graceful shutdown...`);
      try {
        await app.close();
        await roomManager.close();
        const { closeDb } = await import('./db/connection.js');
        await closeDb();
        const { closeRedis } = await import('./lib/redis.js');
        await closeRedis();
        app.log.info('Graceful shutdown completed');
        process.exit(0);
      } catch (err) {
        app.log.error({ err }, 'Error during shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();

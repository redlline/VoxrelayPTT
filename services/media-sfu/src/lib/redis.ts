import Redis from 'ioredis';
import { logger } from './logger.js';

let redis: Redis;

export async function connectRedis() {
  redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy: (times) => Math.min(times * 50, 2000),
    maxRetriesPerRequest: 3,
  });

  redis.on('connect', () => logger.info('Connected to Redis'));
  redis.on('error', (err) => logger.error({ err }, 'Redis connection error'));
}

export function getRedis() {
  if (!redis) throw new Error('Redis not connected');
  return redis;
}

export async function closeRedis() {
  if (redis) await redis.quit();
}

import { getRedis } from './redis.js';

const WS_WINDOW_MS = parseInt(process.env.WS_RATE_LIMIT_WINDOW_MS || '10000');
const WS_MAX_MESSAGES = parseInt(process.env.WS_RATE_LIMIT_MAX || '100');

export async function checkWsRateLimit(userId: string): Promise<boolean> {
  const redis = getRedis();
  const key = `ratelimit:ws:${userId}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, WS_WINDOW_MS);
  }
  return count <= WS_MAX_MESSAGES;
}

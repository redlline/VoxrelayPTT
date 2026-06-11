import { getRedis } from '../lib/redis.js';

const LOCK_PREFIX = 'speaker_lock:';
const ACQUIRE_SCRIPT = `
  local key = KEYS[1]
  local ttl = ARGV[1]
  local owner = ARGV[2]
  local current = redis.call('GET', key)
  if current and current ~= owner then
    return 0
  end
  redis.call('SET', key, owner, 'EX', ttl)
  return 1
`;
const RELEASE_SCRIPT = `
  local key = KEYS[1]
  local owner = ARGV[1]
  local current = redis.call('GET', key)
  if current == owner then
    redis.call('DEL', key)
    return 1
  end
  return 0
`;

export class RedisSpeakerLock {
  private ttl: number;

  constructor(ttlSeconds = 8) {
    this.ttl = ttlSeconds;
  }

  async acquire(channelId: string, userId: string): Promise<boolean> {
    const redis = getRedis();
    const key = `${LOCK_PREFIX}${channelId}`;
    try {
      const result = await redis.eval(ACQUIRE_SCRIPT, 1, key, String(this.ttl), userId);
      return result === 1;
    } catch {
      const current = await redis.get(key);
      if (current && current !== userId) return false;
      await redis.setex(key, this.ttl, userId);
      return true;
    }
  }

  async release(channelId: string, userId: string): Promise<boolean> {
    const redis = getRedis();
    const key = `${LOCK_PREFIX}${channelId}`;
    try {
      const result = await redis.eval(RELEASE_SCRIPT, 1, key, userId);
      return result === 1;
    } catch {
      const current = await redis.get(key);
      if (current === userId) {
        await redis.del(key);
        return true;
      }
      return false;
    }
  }

  async getOwner(channelId: string): Promise<string | null> {
    const redis = getRedis();
    return redis.get(`${LOCK_PREFIX}${channelId}`);
  }

  async refresh(channelId: string, userId: string): Promise<boolean> {
    const redis = getRedis();
    const key = `${LOCK_PREFIX}${channelId}`;
    const current = await redis.get(key);
    if (current === userId) {
      await redis.expire(key, this.ttl);
      return true;
    }
    return false;
  }
}

export const redisSpeakerLock = new RedisSpeakerLock();

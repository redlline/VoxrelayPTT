import { getRedis } from '../lib/redis.js';
import { FloorPriority, FloorState, FloorQueueItem, FloorEvent, SpeakerEvent } from './types.js';

const FLOOR_TIMEOUT_MS = parseInt(process.env.FLOOR_TIMEOUT_MS || '30000', 10);
const redisPrefix = 'floor:';

type EventCallback = (event: FloorEvent | SpeakerEvent) => void;

export class FloorControlManager {
  private floors = new Map<string, FloorState>();
  private listeners = new Map<string, Set<EventCallback>>();
  private timeouts = new Map<string, NodeJS.Timeout>();
  private userPriorities = new Map<string, FloorPriority>();

  getOrCreateFloor(channelId: string): FloorState {
    let floor = this.floors.get(channelId);
    if (!floor) {
      floor = {
        channelId,
        currentSpeaker: null,
        currentSpeakerName: null,
        currentSpeakerPriority: FloorPriority.NORMAL,
        speakingSince: null,
        queue: [],
        locked: false,
        lockedBy: null,
      };
      this.floors.set(channelId, floor);
    }
    return floor;
  }

  async requestFloor(
    channelId: string,
    userId: string,
    displayName: string,
    priority: FloorPriority = FloorPriority.NORMAL,
  ): Promise<FloorEvent> {
    const floor = this.getOrCreateFloor(channelId);

    if (floor.currentSpeaker === userId) {
      return { type: 'ptt.granted', channelId, userId, displayName };
    }

    if (floor.locked && floor.lockedBy !== userId) {
      return { type: 'ptt.denied', channelId, userId, reason: 'Floor is locked by dispatcher' };
    }

    if (floor.currentSpeaker) {
      if (priority > floor.currentSpeakerPriority) {
        await this.forceRelease(channelId, `Higher priority user ${displayName}`);
        return this.grantFloor(channelId, userId, displayName, priority);
      }

      const exists = floor.queue.some((q) => q.userId === userId);
      if (!exists) {
        floor.queue.push({
          userId,
          displayName,
          priority,
          requestedAt: Date.now(),
        });
      }
      floor.queue.sort((a, b) => b.priority - a.priority || a.requestedAt - b.requestedAt);
      await this.syncQueueToRedis(channelId, floor.queue);

      const position = floor.queue.findIndex((q) => q.userId === userId) + 1;
      return { type: 'ptt.queued', channelId, userId, position };
    }

    return this.grantFloor(channelId, userId, displayName, priority);
  }

  async releaseFloor(channelId: string, userId: string): Promise<FloorEvent> {
    const floor = this.floors.get(channelId);
    if (!floor) {
      return { type: 'ptt.released', channelId, userId };
    }
    if (floor.currentSpeaker === userId) {
      return this.clearSpeaker(channelId);
    }
    // Remove from queue if present
    const before = floor.queue.length;
    floor.queue = floor.queue.filter((q) => q.userId !== userId);
    if (floor.queue.length !== before) {
      await this.syncQueueToRedis(channelId, floor.queue);
    }
    return { type: 'ptt.released', channelId, userId };
  }

  async forceRelease(channelId: string, reason?: string): Promise<FloorEvent> {
    const floor = this.floors.get(channelId);
    if (!floor) {
      return { type: 'ptt.released', channelId };
    }

    const previousSpeaker = floor.currentSpeaker;
    await this.clearSpeaker(channelId);

    const event: FloorEvent = {
      type: 'ptt.force_release',
      channelId,
      userId: previousSpeaker || undefined,
      reason,
    };
    this.emit(event);
    return event;
  }

  async remoteActivate(
    channelId: string,
    targetUserId: string,
    targetName: string,
    dispatcherUserId: string,
  ): Promise<FloorEvent> {
    const floor = this.getOrCreateFloor(channelId);
    if (floor.currentSpeaker) {
      await this.forceRelease(channelId, `Remote activated by dispatcher ${dispatcherUserId}`);
    }

    floor.locked = true;
    floor.lockedBy = targetUserId;
    await getRedis().setex(`${redisPrefix}lock:${channelId}`, 60, targetUserId);
    return this.grantFloor(channelId, targetUserId, targetName, FloorPriority.DISPATCHER);
  }

  async remoteRelease(channelId: string, targetUserId: string): Promise<FloorEvent> {
    const floor = this.floors.get(channelId);
    if (!floor) {
      return { type: 'ptt.released', channelId };
    }

    if (floor.currentSpeaker === targetUserId) {
      return this.clearSpeaker(channelId);
    }

    floor.queue = floor.queue.filter((q) => q.userId !== targetUserId);
    await this.syncQueueToRedis(channelId, floor.queue);
    await getRedis().del(`${redisPrefix}lock:${channelId}`);
    floor.locked = false;
    floor.lockedBy = null;
    return { type: 'ptt.released', channelId, userId: targetUserId };
  }

  getFloorState(channelId: string): FloorState | undefined {
    return this.floors.get(channelId);
  }

  getSpeaker(channelId: string): string | null {
    return this.floors.get(channelId)?.currentSpeaker ?? null;
  }

  setUserPriority(userId: string, priority: FloorPriority): void {
    this.userPriorities.set(userId, priority);
  }

  on(event: string, callback: EventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: EventCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  private async grantFloor(
    channelId: string,
    userId: string,
    displayName: string,
    priority: FloorPriority,
  ): Promise<FloorEvent> {
    const floor = this.getOrCreateFloor(channelId);
    floor.currentSpeaker = userId;
    floor.currentSpeakerName = displayName;
    floor.currentSpeakerPriority = priority;
    floor.speakingSince = Date.now();

    const redis = getRedis();
    await redis.setex(`${redisPrefix}speaker:${channelId}`, 60, userId);
    await redis.setex(`${redisPrefix}priority:${channelId}:${userId}`, 60, String(priority));
    await redis.setex(`${redisPrefix}speaking_since:${channelId}`, 60, String(Date.now()));

    const timeout = setTimeout(async () => {
      await this.forceRelease(channelId, 'Speaking timeout (30s)');
    }, FLOOR_TIMEOUT_MS);
    this.timeouts.set(channelId, timeout);

    this.emit({ type: 'speaking.started', channelId, userId, displayName });
    return { type: 'ptt.granted', channelId, userId, displayName };
  }

  private async clearSpeaker(channelId: string): Promise<FloorEvent> {
    const floor = this.floors.get(channelId);
    if (!floor) {
      return { type: 'ptt.released', channelId };
    }

    const previousSpeaker = floor.currentSpeaker;

    floor.currentSpeaker = null;
    floor.currentSpeakerName = null;
    floor.currentSpeakerPriority = FloorPriority.NORMAL;
    floor.speakingSince = null;
    floor.locked = false;
    floor.lockedBy = null;

    const timeout = this.timeouts.get(channelId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(channelId);
    }

    const redis = getRedis();
    await redis.del(`${redisPrefix}speaker:${channelId}`);
    await redis.del(`${redisPrefix}speaking_since:${channelId}`);
    await redis.del(`${redisPrefix}lock:${channelId}`);

    this.emit({ type: 'speaking.stopped', channelId, userId: previousSpeaker || '' });

    if (floor.queue.length > 0) {
      const next = floor.queue.shift()!;
      await this.syncQueueToRedis(channelId, floor.queue);
      const grantEvent = await this.grantFloor(channelId, next.userId, next.displayName, next.priority);
      this.emit(grantEvent);
    } else {
      await this.syncQueueToRedis(channelId, floor.queue);
    }

    return { type: 'ptt.released', channelId, userId: previousSpeaker || undefined };
  }

  private emit(event: FloorEvent | SpeakerEvent): void {
    const callbacks = this.listeners.get(event.type);
    if (!callbacks) return;
    callbacks.forEach((cb) => cb(event));
  }

  private async syncQueueToRedis(channelId: string, queue: FloorQueueItem[]): Promise<void> {
    const redis = getRedis();
    const key = `${redisPrefix}queue:${channelId}`;
    await redis.del(key);
    if (queue.length === 0) return;
    const payload = queue.map((item) => JSON.stringify(item));
    await redis.rpush(key, ...payload);
  }
}

export const floorControlManager = new FloorControlManager();

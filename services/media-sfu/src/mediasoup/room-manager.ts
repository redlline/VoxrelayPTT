import { createWorker } from 'mediasoup';
import { mediasoupConfig } from './config.js';
import { RoomState } from './types.js';

interface ManagedWorker {
  worker: any;
  usage: number;
}

export class RoomManager {
  private workers: ManagedWorker[] = [];
  private rooms = new Map<string, RoomState>();
  private pendingRooms = new Map<string, Promise<RoomState>>();
  private initialized = false;

  async init(): Promise<void> {
    const count = mediasoupConfig.numWorkers;
    console.log(`Initializing ${count} mediasoup workers...`);

    for (let i = 0; i < count; i++) {
      const worker = await createWorker(mediasoupConfig.worker);

      worker.on('died', () => {
        console.error(`Mediasoup worker ${i} died! Restarting...`);
        this.handleWorkerDeath(i);
      });

      this.workers.push({ worker, usage: 0 });
      console.log(`Mediasoup worker ${i} started [pid: ${worker.pid}]`);
    }

    this.initialized = true;
    console.log('Mediasoup initialized successfully');
  }

  private getLeastLoadedWorker(): any {
    let best = this.workers[0];
    for (const w of this.workers) {
      if (w.usage < best.usage) best = w;
    }
    best.usage++;
    return best.worker;
  }

  private releaseWorker(worker: any): void {
    const found = this.workers.find((w) => w.worker === worker);
    if (found && found.usage > 0) found.usage--;
  }

  private async handleWorkerDeath(index: number): Promise<void> {
    const dead = this.workers[index];
    const deadWorkerId = dead.worker.pid;

    const affectedRooms = [...this.rooms.entries()].filter(
      ([_, state]) => state.router.appData?.workerPid === deadWorkerId,
    );

    const newWorker = await createWorker(mediasoupConfig.worker);
    newWorker.on('died', () => {
      console.error(`Replacement mediasoup worker died!`);
      this.handleWorkerDeath(index);
    });

    this.workers[index] = { worker: newWorker, usage: affectedRooms.length };

    for (const [channelId, oldState] of affectedRooms) {
      try {
        const router = await newWorker.createRouter({ mediaCodecs: mediasoupConfig.router.mediaCodecs });
        router.appData = { channelId, workerPid: newWorker.pid };

        this.rooms.set(channelId, {
          router,
          transports: new Map(),
          producers: new Map(),
          consumers: new Map(),
          plainTransport: null,
          recordingTransport: null,
          recordingConsumer: null,
        });

        console.log(`Room ${channelId} migrated to new worker`);
      } catch (err) {
        console.error(`Failed to migrate room ${channelId}:`, err);
        this.rooms.delete(channelId);
      }
    }
  }

  async getOrCreateRoom(channelId: string): Promise<RoomState> {
    const existingRoom = this.rooms.get(channelId);
    if (existingRoom) return existingRoom;

    const pendingRoom = this.pendingRooms.get(channelId);
    if (pendingRoom) return pendingRoom;

    const createPromise = (async () => {
      const worker = this.getLeastLoadedWorker();
      try {
        const router = await worker.createRouter({ mediaCodecs: mediasoupConfig.router.mediaCodecs });
        router.appData = { channelId, workerPid: worker.pid };

        const room: RoomState = {
          router,
          transports: new Map(),
          producers: new Map(),
          consumers: new Map(),
          plainTransport: null,
          recordingTransport: null,
          recordingConsumer: null,
        };

        this.rooms.set(channelId, room);
        console.log(`Room created: ${channelId} on worker ${worker.pid}`);
        return room;
      } catch (err) {
        this.releaseWorker(worker);
        throw err;
      } finally {
        this.pendingRooms.delete(channelId);
      }
    })();

    this.pendingRooms.set(channelId, createPromise);
    return createPromise;
  }

  getRoom(channelId: string): RoomState | undefined {
    return this.rooms.get(channelId);
  }

  async closeRoom(channelId: string): Promise<void> {
    const room = this.rooms.get(channelId);
    if (!room) return;

    room.producers.forEach((p) => p.close());
    room.consumers.forEach((c) => c.close());
    room.transports.forEach((t) => t.close());
    if (room.plainTransport) room.plainTransport.close();
    if (room.recordingTransport) room.recordingTransport.close();

    this.releaseWorker(room.router.appData?.worker || this.workers[0]?.worker);
    this.rooms.delete(channelId);
    console.log(`Room closed: ${channelId}`);
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  getRoomsMap(): ReadonlyMap<string, RoomState> {
    return this.rooms;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getWorkerCount(): number {
    return this.workers.length;
  }

  async close(): Promise<void> {
    console.log('Closing all mediasoup rooms and workers...');

    // Close all rooms
    const roomIds = Array.from(this.rooms.keys());
    for (const roomId of roomIds) {
      await this.closeRoom(roomId);
    }

    // Close all workers
    for (const { worker } of this.workers) {
      worker.close();
    }

    this.workers = [];
    this.initialized = false;
    console.log('All mediasoup resources closed');
  }
}

export const roomManager = new RoomManager();

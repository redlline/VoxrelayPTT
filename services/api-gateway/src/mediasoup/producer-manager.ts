import { RoomState, ProduceParams } from './types.js';

const BITRATE_TIERS = [
  { maxBitrate: 16000, minScore: 0 },
  { maxBitrate: 24000, minScore: 3 },
  { maxBitrate: 32000, minScore: 6 },
  { maxBitrate: 48000, minScore: 8 },
];

function getBitrateForScore(score: number): number {
  let best = BITRATE_TIERS[0];
  for (const tier of BITRATE_TIERS) {
    if (score >= tier.minScore) best = tier;
  }
  return best.maxBitrate;
}

/** Maps producerId → { transport, room } for adaptive bitrate */
const producerMap = new Map<string, { transport: any; room: RoomState }>();

export class ProducerManager {
  async createProducer(room: RoomState, params: ProduceParams): Promise<any> {
    const transport = room.transports.get(params.transportId);
    if (!transport) {
      throw new Error(`Transport ${params.transportId} not found for producing`);
    }

    const producer = await (transport as any).produce({
      kind: params.kind,
      rtpParameters: params.rtpParameters,
      appData: {
        ...params.appData,
        channelId: params.channelId,
        userId: params.userId,
        transportId: params.transportId,
        currentBitrate: 32000,
        paused: false,
      },
    });

    room.producers.set(producer.id, producer);
    producerMap.set(producer.id, { transport, room });

    producer.on('transportclose', () => {
      console.log(`Producer ${producer.id} transport closed`);
      room.producers.delete(producer.id);
      producerMap.delete(producer.id);
    });

    producer.on('score', (score: any) => {
      if (producer.kind === 'video') return;
      if (!producer.appData) return;
      producer.appData.score = score;
      this.adaptBitrate(producer, score);
    });

    return producer;
  }

  private async adaptBitrate(producer: any, score: any): Promise<void> {
    const scores: number[] = (Array.isArray(score) ? score : [score]).map((s: any) => s.score ?? 0);
    const avgScore = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
    const targetBitrate = getBitrateForScore(avgScore);
    const currentBitrate = producer.appData?.currentBitrate ?? 32000;

    if (targetBitrate === currentBitrate) return;

    const entry = producerMap.get(producer.id);
    if (!entry) return;

    try {
      await (entry.transport as any).setMaxIncomingBitrate(targetBitrate);
      producer.appData.currentBitrate = targetBitrate;
      console.log(
        `Producer ${producer.id} transport bitrate cap: ${currentBitrate} → ${targetBitrate} (score: ${avgScore.toFixed(1)})`,
      );
    } catch {
      // transport bitrate may not support this at all times; scores will retry
    }
  }

  closeProducer(room: RoomState, producerId: string): void {
    const producer = room.producers.get(producerId);
    if (producer) {
      producer.close();
      room.producers.delete(producerId);
    }
  }

  getProducer(room: RoomState, producerId: string): any | undefined {
    return room.producers.get(producerId);
  }

  getProducersByUser(room: RoomState, userId: string): any[] {
    const result: any[] = [];
    for (const producer of room.producers.values()) {
      if (producer.appData?.userId === userId) {
        result.push(producer);
      }
    }
    return result;
  }

  getProducerCount(room: RoomState): number {
    return room.producers.size;
  }

  cleanupUserProducers(room: RoomState, userId: string): void {
    const toClose: string[] = [];
    for (const [id, producer] of room.producers) {
      if (producer.appData?.userId === userId) {
        toClose.push(id);
      }
    }
    for (const id of toClose) {
      this.closeProducer(room, id);
    }
  }
}

export const producerManager = new ProducerManager();

import { RoomState, ConsumeParams } from './types.js';

export class ConsumerManager {
  async createConsumer(room: RoomState, params: ConsumeParams): Promise<any> {
    const transport = room.transports.get(params.transportId);
    if (!transport) {
      throw new Error(`Transport ${params.transportId} not found for consuming`);
    }

    const producer = room.producers.get(params.producerId);
    if (!producer) {
      throw new Error(`Producer ${params.producerId} not found`);
    }

    const rtpCapabilities = params.rtpCapabilities;
    const canConsume = room.router.canConsume({
      producerId: params.producerId,
      rtpCapabilities,
    });

    if (!canConsume) {
      throw new Error('Client cannot consume this producer (codec not supported)');
    }

    const consumer = await (transport as any).consume({
      producerId: params.producerId,
      rtpCapabilities,
      paused: true,
      appData: {
        channelId: params.channelId,
        userId: params.userId,
        transportId: params.transportId,
        producerId: params.producerId,
      },
    });

    room.consumers.set(consumer.id, consumer);

    consumer.on('transportclose', () => {
      console.log(`Consumer ${consumer.id} transport closed`);
      room.consumers.delete(consumer.id);
    });

    consumer.on('producerclose', () => {
      console.log(`Consumer ${consumer.id} producer closed`);
      room.consumers.delete(consumer.id);
    });

    consumer.on('score', (score: any) => {
      if (consumer.appData) consumer.appData.score = score;
    });

    return consumer;
  }

  async resumeConsumer(consumer: any): Promise<void> {
    await consumer.resume();
  }

  closeConsumer(room: RoomState, consumerId: string): void {
    const consumer = room.consumers.get(consumerId);
    if (consumer) {
      consumer.close();
      room.consumers.delete(consumerId);
    }
  }

  getConsumer(room: RoomState, consumerId: string): any | undefined {
    return room.consumers.get(consumerId);
  }

  getConsumersByUser(room: RoomState, userId: string): any[] {
    const result: any[] = [];
    for (const consumer of room.consumers.values()) {
      if (consumer.appData?.userId === userId) {
        result.push(consumer);
      }
    }
    return result;
  }

  getConsumersByProducer(room: RoomState, producerId: string): any[] {
    const result: any[] = [];
    for (const consumer of room.consumers.values()) {
      if (consumer.appData?.producerId === producerId) {
        result.push(consumer);
      }
    }
    return result;
  }

  removeAllConsumersForUser(room: RoomState, userId: string): void {
    const toClose: string[] = [];
    for (const [id, consumer] of room.consumers) {
      if (consumer.appData?.userId === userId) {
        toClose.push(id);
      }
    }
    for (const id of toClose) {
      this.closeConsumer(room, id);
    }
  }

  cleanupUserConsumers(room: RoomState, userId: string): void {
    this.removeAllConsumersForUser(room, userId);
  }

  async reconnectConsumersForUser(
    room: RoomState,
    userId: string,
    transportId: string,
    rtpCapabilities: any,
  ): Promise<Array<{ consumerId: string; producerId: string; kind: string; rtpParameters: any }>> {
    const results: Array<{ consumerId: string; producerId: string; kind: string; rtpParameters: any }> = [];

    for (const [producerId, producer] of room.producers) {
      if (producer.appData?.userId === userId) continue;

      const canConsume = room.router.canConsume({ producerId, rtpCapabilities });
      if (!canConsume) continue;

      try {
        const consumer = await this.createConsumer(room, {
          channelId: (room.router.appData as any)?.channelId || '',
          userId,
          transportId,
          producerId,
          rtpCapabilities,
        });

        results.push({
          consumerId: consumer.id,
          producerId: consumer.producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        });
      } catch {
        // skip producers this client cannot consume
      }
    }

    return results;
  }
}

export const consumerManager = new ConsumerManager();

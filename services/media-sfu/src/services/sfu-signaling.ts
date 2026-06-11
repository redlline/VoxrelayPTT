import { roomManager } from '../mediasoup/room-manager.js';
import { transportManager } from '../mediasoup/transport-manager.js';
import { producerManager } from '../mediasoup/producer-manager.js';
import { consumerManager } from '../mediasoup/consumer-manager.js';
import { floorControlManager } from '../floor-control/index.js';
import { FloorPriority } from '../floor-control/types.js';
import { startChannelRecording, stopChannelRecording } from '../recording/bridge.js';
import { recordPttRequest, recordPttGrant, recordPttRelease } from '../lib/metrics.js';
import { getDb } from '../db/connection.js';
import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { directCallChannels } from '../lib/direct-calls.js';

type SendFn = (msg: any) => void;
type BroadcastToChannelFn = (channelId: string, msg: any, excludeUserId?: string) => void;
type BroadcastToDispatchersFn = (msg: any) => void;
type ChannelJoinFn = (channelId: string) => void;
type ChannelLeaveFn = (channelId: string) => void;

export class SfuSignalingHandler {
  private send: SendFn;
  private broadcastToChannelFn: BroadcastToChannelFn;
  private broadcastToDispatchersFn: BroadcastToDispatchersFn;
  private onChannelJoinFn?: ChannelJoinFn;
  private onChannelLeaveFn?: ChannelLeaveFn;
  userId: string;
  displayName: string;
  role: string;
  private joinedChannels = new Set<string>();
  private transportIds = new Set<string>();

  constructor(
    send: SendFn,
    userId: string,
    displayName: string,
    role: string,
    broadcastToChannelFn: BroadcastToChannelFn,
    broadcastToDispatchersFn: BroadcastToDispatchersFn,
    onChannelJoinFn?: ChannelJoinFn,
    onChannelLeaveFn?: ChannelLeaveFn,
  ) {
    this.send = send;
    this.userId = userId;
    this.displayName = displayName;
    this.role = role;
    this.broadcastToChannelFn = broadcastToChannelFn;
    this.broadcastToDispatchersFn = broadcastToDispatchersFn;
    this.onChannelJoinFn = onChannelJoinFn;
    this.onChannelLeaveFn = onChannelLeaveFn;
  }

  async handle(msg: any): Promise<void> {
    const { type, channelId } = msg;

    try {
      switch (type) {
        case 'transport.create':
          await this.handleTransportCreate(channelId, msg.direction, msg.forceTcp, msg.sctpCapabilities);
          break;
        case 'transport.connect':
          await this.handleTransportConnect(channelId, msg.transportId, msg.dtlsParameters);
          break;
        case 'produce':
          await this.handleProduce(channelId, msg.transportId, msg.kind, msg.rtpParameters);
          break;
        case 'consume':
          await this.handleConsume(channelId, msg.transportId, msg.producerId, msg.rtpCapabilities);
          break;
        case 'consumer.resume':
          await this.handleConsumerResume(msg.consumerId);
          break;
        case 'ptt.request':
          await this.handlePttRequest(channelId);
          break;
        case 'ptt.release':
          await this.handlePttRelease(channelId);
          break;
        case 'dispatcher.force_ptt':
          await this.handleDispatcherForcePtt(channelId, msg.targetUserId);
          break;
        case 'dispatcher.force_release':
          await this.handleDispatcherForceRelease(channelId, msg.targetUserId);
          break;
        case 'dispatcher.force_release_any':
          await this.handleDispatcherForceReleaseAny(channelId);
          break;
        case 'dispatcher.announcement':
          await this.handleDispatcherAnnouncement(channelId, msg.text);
          break;
        case 'dispatcher.voice_announcement':
          await this.handleDispatcherVoiceAnnouncement(channelId, msg);
          break;
        case 'channel.join':
          await this.handleChannelJoin(channelId);
          break;
        case 'channel.leave':
          await this.handleChannelLeave(channelId);
          break;
        case 'transport.restart':
          await this.handleTransportRestart(channelId, msg.transportId);
          break;
        case 'reconnect.sync':
          await this.handleReconnectSync(channelId, msg.rtpCapabilities);
          break;
        default:
          break;
      }
    } catch (err: any) {
      logger.warn({ err, type, userId: this.userId }, 'SFU signaling error');
      this.send({ type: 'error', error: err.message, originalType: type });
    }
  }

  cleanup(): void {
    for (const channelId of this.joinedChannels) {
      const room = roomManager.getRoom(channelId);
      if (!room) continue;

      transportManager.closeUserTransports(room, this.userId);
      producerManager.cleanupUserProducers(room, this.userId);
      consumerManager.cleanupUserConsumers(room, this.userId);
    }
    this.joinedChannels.clear();
    this.transportIds.clear();
  }

  private async handleTransportCreate(
    channelId: string,
    direction: string,
    forceTcp?: boolean,
    sctpCapabilities?: any,
  ): Promise<void> {
    await this.ensureChannelAccess(channelId);
    const room = await roomManager.getOrCreateRoom(channelId);

    const transport = await transportManager.createWebRtcTransport(room, {
      channelId,
      userId: this.userId,
      direction: direction as 'send' | 'recv',
      forceTcp,
      sctpCapabilities,
    });

    this.transportIds.add(transport.id);

    this.send({
      type: 'transport.created',
      channelId,
      direction,
      transportId: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    });
  }

  private async handleTransportConnect(
    channelId: string,
    transportId: string,
    dtlsParameters: any,
  ): Promise<void> {
    await this.ensureChannelAccess(channelId);
    const room = roomManager.getRoom(channelId);
    if (!room) throw new Error(`Room ${channelId} not found`);

    await transportManager.connectWebRtcTransport(room, transportId, dtlsParameters);
    this.send({ type: 'transport.connected', transportId });
  }

  private async handleProduce(
    channelId: string,
    transportId: string,
    kind: string,
    rtpParameters: any,
  ): Promise<void> {
    await this.ensureChannelAccess(channelId);
    const room = roomManager.getRoom(channelId);
    if (!room) throw new Error(`Room ${channelId} not found`);

    const speaker = floorControlManager.getSpeaker(channelId);

    const producer = await producerManager.createProducer(room, {
      channelId,
      userId: this.userId,
      transportId,
      kind: kind as 'audio' | 'video',
      rtpParameters,
      appData: { transportId, displayName: this.displayName },
    });

    // Video is independent of floor control — don't pause/resume by PTT state
    // Direct call channels: never pause audio — everyone can talk
    if (kind === 'audio' && !directCallChannels.has(channelId)) {
      if (speaker && speaker !== this.userId) {
        await producer.pause();
      }
      if (speaker === this.userId) {
        await startChannelRecording(channelId, this.userId, this.displayName).catch(
          (err) => logger.warn({ err }, 'Recording start skipped'),
        );
      }
    }

    this.send({
      type: 'produced',
      producerId: producer.id,
    });

    const isAudioSpeaker = kind === 'audio' && speaker === this.userId;

    this.broadcastToChannel(channelId, {
      type: 'new-consumer',
      channelId,
      producerId: producer.id,
      kind: producer.kind,
      rtpParameters,
      producerPeerId: this.userId,
      producerDisplayName: this.displayName,
    }, this.userId);

    // If this audio producer was created by the current speaker, re-broadcast
    // speaker-changed so other clients can look up the consumer by producerId.
    if (isAudioSpeaker) {
      this.broadcastToChannel(channelId, {
        type: 'speaker-changed',
        channelId,
        activeSpeaker: this.userId,
        displayName: this.displayName,
        producerId: producer.id,
      });
    }

    // Notify channel listeners when this producer goes away.
    producer.on('close', () => {
      this.broadcastToChannel(channelId, {
        type: 'consumer.closed',
        channelId,
        producerId: producer.id,
      });
    });
  }

  private async handleConsume(
    channelId: string,
    transportId: string,
    producerId: string,
    rtpCapabilities: any,
  ): Promise<void> {
    await this.ensureChannelAccess(channelId);
    const room = roomManager.getRoom(channelId);
    if (!room) throw new Error(`Room ${channelId} not found`);

    const consumer = await consumerManager.createConsumer(room, {
      channelId,
      userId: this.userId,
      transportId,
      producerId,
      rtpCapabilities,
    });

    this.send({
      type: 'consumed',
      consumerId: consumer.id,
      producerId: consumer.producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    });
  }

  private async handleConsumerResume(consumerId: string): Promise<void> {
    for (const [, room] of roomManager.getRoomsMap()) {
      const consumer = consumerManager.getConsumer(room, consumerId);
      if (consumer) {
        await consumerManager.resumeConsumer(consumer);
        this.send({ type: 'consumer.resumed', consumerId });
        return;
      }
    }
    throw new Error(`Consumer ${consumerId} not found`);
  }

  private async handlePttRequest(channelId: string): Promise<void> {
    await this.ensureChannelAccess(channelId);

    const sql = getDb();
    const [mutedRow] = await sql`
      SELECT is_muted FROM channel_members
      WHERE channel_id = ${channelId} AND user_id = ${this.userId}
      LIMIT 1
    `;
    if (mutedRow?.is_muted) {
      this.send({ type: 'ptt.denied', channelId, userId: this.userId, reason: 'You have been muted by an admin' });
      return;
    }

    // Direct call channels: always grant floor without queuing
    if (directCallChannels.has(channelId)) {
      this.send({ type: 'ptt.granted', channelId, userId: this.userId, displayName: this.displayName });
      const room = roomManager.getRoom(channelId);
      if (room) {
        const producers = producerManager.getProducersByUser(room, this.userId);
        for (const producer of producers) {
          if (producer.kind === 'audio') {
            await producer.resume();
          }
        }
      }
      let audioProducerId: string | null = null;
      const dcRoom = roomManager.getRoom(channelId);
      if (dcRoom) {
        const dcProducers = producerManager.getProducersByUser(dcRoom, this.userId);
        for (const p of dcProducers) {
          if (p.kind === 'audio') { audioProducerId = p.id; break; }
        }
      }
      this.broadcastToChannel(channelId, {
        type: 'speaker-changed',
        channelId,
        activeSpeaker: this.userId,
        displayName: this.displayName,
        producerId: audioProducerId,
      });
      return;
    }

    const priority = this.getPriority();
    floorControlManager.setUserPriority(this.userId, priority);
    recordPttRequest(channelId, this.role);
    const event = await floorControlManager.requestFloor(channelId, this.userId, this.displayName, priority);

    this.send(event);

    if (event.type === 'ptt.granted') {
      recordPttGrant(channelId);
      const room = roomManager.getRoom(channelId);
      let resumedAudioProducer = false;
      if (room) {
        const producers = producerManager.getProducersByUser(room, this.userId);
        for (const producer of producers) {
          if (producer.kind === 'audio') {
            await producer.resume();
            resumedAudioProducer = true;
          }
        }
      }
      if (resumedAudioProducer) {
        await startChannelRecording(channelId, this.userId, this.displayName).catch(
          (err) => logger.warn({ err }, 'Recording start skipped'),
        );
      }
    }
  }

  private async handlePttRelease(channelId: string): Promise<void> {
    await this.ensureChannelAccess(channelId);
    const event = await floorControlManager.releaseFloor(channelId, this.userId);
    this.send(event);
    recordPttRelease(channelId);

    const room = roomManager.getRoom(channelId);
    if (room) {
      const producers = producerManager.getProducersByUser(room, this.userId);
      for (const producer of producers) {
        if (producer.kind === 'audio') {
          await producer.pause();
        }
      }
    }
    // Stop recording
    if (event.userId === this.userId) {
      await stopChannelRecording(channelId).catch(
        (err) => logger.warn({ err }, 'Recording stop skipped'),
      );
    }
  }

  private async handleDispatcherForcePtt(channelId: string, targetUserId: string): Promise<void> {
    await this.ensureChannelAccess(channelId);
    if (this.role !== 'admin' && this.role !== 'dispatcher') {
      throw new Error('Only dispatchers can force PTT');
    }

    const event = await floorControlManager.remoteActivate(
      channelId, targetUserId, this.displayName, this.userId,
    );

    this.broadcastToDispatchersFn({
      type: 'dispatcher.ptt_activated',
      channelId,
      targetUserId,
      activatedBy: this.userId,
    });

    if (event.type === 'ptt.granted') {
      const room = roomManager.getRoom(channelId);
      if (room) {
        const producers = producerManager.getProducersByUser(room, targetUserId);
        for (const producer of producers) {
          if (producer.kind === 'audio') {
            await producer.resume();
          }
        }
      }
    }
  }

  private async handleDispatcherForceRelease(channelId: string, targetUserId: string): Promise<void> {
    await this.ensureChannelAccess(channelId);
    if (this.role !== 'admin' && this.role !== 'dispatcher') {
      throw new Error('Only dispatchers can force release');
    }

    const activeSpeaker = floorControlManager.getSpeaker(channelId);
    await floorControlManager.remoteRelease(channelId, targetUserId);
    if (activeSpeaker === targetUserId) {
      await stopChannelRecording(channelId).catch(() => {});
    }

    const room = roomManager.getRoom(channelId);
    if (room) {
      const producers = producerManager.getProducersByUser(room, targetUserId);
      for (const producer of producers) {
        if (producer.kind === 'audio') {
          await producer.pause();
        }
      }
    }
  }

  private async handleDispatcherForceReleaseAny(channelId: string): Promise<void> {
    await this.ensureChannelAccess(channelId);
    if (this.role !== 'admin' && this.role !== 'dispatcher') {
      throw new Error('Only dispatchers can force release');
    }

    const speakerId = floorControlManager.getSpeaker(channelId);
    if (!speakerId) {
      this.send({ type: 'error', message: 'No active speaker to release' });
      return;
    }

    await floorControlManager.remoteRelease(channelId, speakerId);
    await stopChannelRecording(channelId).catch(() => {});

    const room = roomManager.getRoom(channelId);
    if (room) {
      const producers = producerManager.getProducersByUser(room, speakerId);
      for (const producer of producers) {
        if (producer.kind === 'audio') {
          await producer.pause();
        }
      }
    }

    this.send({ type: 'ptt.released', channelId, userId: speakerId });
  }

  private async handleDispatcherAnnouncement(channelId: string, text: string): Promise<void> {
    await this.ensureChannelAccess(channelId);
    if (this.role !== 'admin' && this.role !== 'dispatcher') {
      throw new Error('Only dispatchers can send announcements');
    }
    if (!text || typeof text !== 'string' || !text.trim()) {
      throw new Error('Announcement text is required');
    }

    this.broadcastToChannelFn(channelId, {
      type: 'dispatcher.announcement',
      channelId,
      text: text.trim(),
    });
  }

  private async handleDispatcherVoiceAnnouncement(channelId: string, msg: any): Promise<void> {
    await this.ensureChannelAccess(channelId);
    if (this.role !== 'admin' && this.role !== 'dispatcher') {
      throw new Error('Only dispatchers can send voice announcements');
    }

    const { sctpCapabilities, forceTcp } = msg;
    const room = await roomManager.getOrCreateRoom(channelId);

    const transport = await transportManager.createWebRtcTransport(room, {
      channelId,
      userId: this.userId,
      direction: 'send',
      forceTcp,
      sctpCapabilities,
      appData: { announcement: true },
    });

    this.send({
      type: 'voice_announcement.transport',
      channelId,
      transportId: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    });
  }

  private async handleTransportRestart(channelId: string, transportId: string): Promise<void> {
    await this.ensureChannelAccess(channelId);
    const room = roomManager.getRoom(channelId);
    if (!room) throw new Error(`Room ${channelId} not found`);

    const transport = transportManager.getTransport(room, transportId);
    if (!transport) throw new Error(`Transport ${transportId} not found`);

    const iceParameters = await (transport as any).restartIce();
    this.send({
      type: 'transport.restarted',
      transportId,
      iceParameters,
    });
  }

  private async handleReconnectSync(channelId: string, rtpCapabilities: any): Promise<void> {
    await this.ensureChannelAccess(channelId);
    const room = roomManager.getRoom(channelId);
    if (!room) return;

    const userTransport = [...room.transports.values()].find(
      (t: any) => t.appData?.userId === this.userId && t.appData?.direction === 'recv',
    );
    if (!userTransport) return;

    const consumers = await consumerManager.reconnectConsumersForUser(
      room, this.userId, (userTransport as any).id, rtpCapabilities,
    );

    for (const c of consumers) {
      this.send({
        type: 'consumed',
        consumerId: c.consumerId,
        producerId: c.producerId,
        kind: c.kind,
        rtpParameters: c.rtpParameters,
      });
      this.send({
        type: 'consumer.resumed',
        consumerId: c.consumerId,
      });
    }
  }

  private async handleChannelJoin(channelId: string): Promise<void> {
    await this.ensureChannelAccess(channelId);
    this.joinedChannels.add(channelId);
    this.onChannelJoinFn?.(channelId);

    const redis = getRedis();
    await redis.sadd(`channel:${channelId}:listeners`, this.userId);
    await redis.hset('user_channels', this.userId, [...this.joinedChannels].join(','));

    const room = roomManager.getRoom(channelId);
    if (room) {
      // Send existing producers to the newly joined client so audio can start immediately.
      for (const producer of room.producers.values()) {
        const producerUserId = producer.appData?.userId as string | undefined;
        if (!producerUserId || producerUserId === this.userId) continue;

        this.send({
          type: 'new-consumer',
          channelId,
          producerId: producer.id,
          kind: producer.kind,
          rtpParameters: producer.rtpParameters,
          producerPeerId: producerUserId,
          producerDisplayName: producer.appData?.displayName || '',
        });
      }

      const speaker = floorControlManager.getSpeaker(channelId);
      if (speaker) {
        let speakerProducerId: string | null = null;
        for (const [, sp] of room.producers) {
          if (sp.appData?.userId === speaker && sp.kind === 'audio') {
            speakerProducerId = sp.id; break;
          }
        }
        this.broadcastToChannel(channelId, {
          type: 'speaker-changed',
          channelId,
          activeSpeaker: speaker,
          displayName: speakerProducerId ? (room.producers.get(speakerProducerId)?.appData?.displayName ?? '') : '',
          producerId: speakerProducerId,
        });
      }
    }
    this.broadcastToChannel(channelId, {
      type: 'channel.user_joined',
      channelId,
      userId: this.userId,
      displayName: this.displayName,
      role: this.role,
    }, this.userId);
    this.send({ type: 'channel.joined', channelId, isDirectCall: directCallChannels.has(channelId) });
  }

  private async handleChannelLeave(channelId: string): Promise<void> {
    this.joinedChannels.delete(channelId);
    this.onChannelLeaveFn?.(channelId);

    const redis = getRedis();
    await redis.srem(`channel:${channelId}:listeners`, this.userId);
    if (this.joinedChannels.size > 0) {
      await redis.hset('user_channels', this.userId, [...this.joinedChannels].join(','));
    } else {
      await redis.hdel('user_channels', this.userId);
    }

    const room = roomManager.getRoom(channelId);
    if (room) {
      producerManager.getProducersByUser(room, this.userId).forEach((p) => {
        this.broadcastToChannel(channelId, {
          type: 'consumer.closed',
          channelId,
          producerId: p.id,
        }, this.userId);
        producerManager.closeProducer(room, p.id);
      });
      consumerManager.removeAllConsumersForUser(room, this.userId);
    }

    await floorControlManager.releaseFloor(channelId, this.userId);
    this.broadcastToChannel(channelId, {
      type: 'channel.user_left',
      channelId,
      userId: this.userId,
      displayName: this.displayName,
    }, this.userId);
    this.send({ type: 'channel.left', channelId });
  }

  private broadcastToChannel(channelId: string, msg: any, excludeUserId?: string): void {
    this.broadcastToChannelFn(channelId, msg, excludeUserId);
  }

  private getPriority(): FloorPriority {
    if (this.role === 'admin' || this.role === 'dispatcher') {
      return FloorPriority.DISPATCHER;
    }
    return FloorPriority.NORMAL;
  }

  getJoinedChannels(): string[] {
    return [...this.joinedChannels];
  }

  getUserId(): string {
    return this.userId;
  }

  private async ensureChannelAccess(channelId: string): Promise<void> {
    const sql = getDb();
    const [channel] = await sql`
      SELECT c.id, c.type, c.is_active,
        EXISTS (
          SELECT 1 FROM channel_members cm
          WHERE cm.channel_id = c.id AND cm.user_id = ${this.userId}
        ) AS is_member
      FROM channels c
      WHERE c.id = ${channelId}
      LIMIT 1
    `;

    if (!channel || !channel.is_active) {
      throw new Error('Channel not found');
    }
    if (channel.type === 'private' && !channel.is_member) {
      throw new Error('Access denied to private channel');
    }
  }
}

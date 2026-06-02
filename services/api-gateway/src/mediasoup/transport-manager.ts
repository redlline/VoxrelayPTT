import { mediasoupConfig } from './config.js';
import { RoomState, TransportCreateParams, TransportConnectParams } from './types.js';

export class TransportManager {
  async createWebRtcTransport(
    room: RoomState,
    params: TransportCreateParams,
  ): Promise<any> {
    const transport = await room.router.createWebRtcTransport({
      listenIps: mediasoupConfig.webRtcTransport.listenIps,
      initialAvailableOutgoingBitrate: mediasoupConfig.webRtcTransport.initialAvailableOutgoingBitrate,
      enableUdp: !params.forceTcp,
      enableTcp: true,
      preferUdp: !params.forceTcp,
      enableSctp: Boolean(params.sctpCapabilities),
      appData: {
        channelId: params.channelId,
        userId: params.userId,
        direction: params.direction,
      },
    });

    if (params.direction === 'recv') {
      try { await transport.setMaxIncomingBitrate(256000); } catch {}
    }

    const transportId = transport.id;
    room.transports.set(transportId, transport);

    transport.on('dtlsstatechange', (state: string) => {
      if (state === 'closed' || state === 'failed') {
        console.log(`Transport ${transportId} dtls ${state}, cleaning up`);
        this.closeTransport(room, transportId);
      }
    });

    transport.on('routerclose', () => {
      console.log(`Router closed, transport ${transportId} will close`);
      room.transports.delete(transportId);
    });

    return transport;
  }

  async connectWebRtcTransport(
    room: RoomState,
    transportId: string,
    dtlsParameters: any,
  ): Promise<void> {
    const transport = room.transports.get(transportId) as any;
    if (!transport) {
      throw new Error(`Transport ${transportId} not found`);
    }
    await transport.connect({ dtlsParameters });
  }

  async createPlainTransport(room: RoomState): Promise<any> {
    if (room.plainTransport) return room.plainTransport;

    const transport = await room.router.createPlainTransport(mediasoupConfig.plainTransport);
    room.plainTransport = transport;

    transport.on('routerclose', () => {
      room.plainTransport = null;
    });

    return transport;
  }

  async createRecordingPlainTransport(room: RoomState): Promise<any> {
    if (room.recordingTransport) return room.recordingTransport;

    const transport = await room.router.createPlainTransport(mediasoupConfig.recordingPlainTransport);
    room.recordingTransport = transport;

    transport.on('routerclose', () => {
      room.recordingTransport = null;
    });

    return transport;
  }

  closeTransport(room: RoomState, transportId: string): void {
    const transport = room.transports.get(transportId);
    if (!transport) return;

    if (transport.appData?.direction === 'send') {
      transport.close();
      room.transports.delete(transportId);

      for (const [pid, producer] of room.producers) {
        if (producer.appData?.transportId === transportId) {
          producer.close();
          room.producers.delete(pid);
        }
      }
      return;
    }

    transport.close();
    room.transports.delete(transportId);
  }

  getTransport(room: RoomState, transportId: string) {
    return room.transports.get(transportId);
  }

  closeRecordingPlainTransport(room: RoomState): void {
    if (!room.recordingTransport) return;
    room.recordingTransport.close();
    room.recordingTransport = null;
  }

  closeUserTransports(room: RoomState, userId: string): void {
    const toClose: string[] = [];
    for (const [id, transport] of room.transports) {
      if ((transport as any).appData?.userId === userId) {
        toClose.push(id);
      }
    }
    for (const id of toClose) {
      this.closeTransport(room, id);
    }
  }
}

export const transportManager = new TransportManager();

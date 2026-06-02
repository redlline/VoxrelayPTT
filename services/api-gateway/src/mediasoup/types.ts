import type { Worker, Router, WebRtcTransport, Producer, Consumer, PlainTransport } from 'mediasoup/types';

export interface MediasoupWorker {
  worker: Worker;
  usage: number;
}

export interface RoomState {
  router: Router;
  transports: Map<string, WebRtcTransport | PlainTransport>;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
  plainTransport: PlainTransport | null;
  recordingTransport: PlainTransport | null;
  recordingConsumer: Consumer | null;
}

export interface TransportCreateParams {
  channelId: string;
  userId: string;
  direction: 'send' | 'recv';
  forceTcp?: boolean;
  sctpCapabilities?: any;
  appData?: Record<string, unknown>;
}

export interface ProduceParams {
  channelId: string;
  userId: string;
  transportId: string;
  kind: 'audio' | 'video';
  rtpParameters: any;
  appData?: Record<string, unknown>;
}

export interface ConsumeParams {
  channelId: string;
  userId: string;
  transportId: string;
  producerId: string;
  rtpCapabilities: any;
}

export interface TransportConnectParams {
  channelId: string;
  transportId: string;
  dtlsParameters: any;
}

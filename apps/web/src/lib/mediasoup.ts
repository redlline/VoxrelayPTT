import { Device } from 'mediasoup-client';
import { wsClient } from './ws';
import { api } from './api';

let device: any = null;
let deviceInitPromise: Promise<any> | null = null;
let sendTransport: any = null;
let recvTransport: any = null;
let sendTransportChannelId: string | null = null;
let recvTransportChannelId: string | null = null;
let iceServers: RTCIceServer[] = [];
let pendingSendTransport: Promise<any> | null = null;
let pendingRecvTransport: Promise<any> | null = null;

export async function initDevice(): Promise<any> {
  if (device?.loaded) return device;
  if (deviceInitPromise) return deviceInitPromise;

  deviceInitPromise = (async () => {
    device = new Device();
    await fetchIceServers();

    const rtpCapabilities = await fetchRtpCapabilities();
    await device.load({ routerRtpCapabilities: rtpCapabilities });
    return device;
  })();

  try {
    return await deviceInitPromise;
  } finally {
    deviceInitPromise = null;
  }
}

async function fetchIceServers(): Promise<void> {
  try {
    const config: any = await api.get('/sfu/config');
    iceServers = config.iceServers || [];
  } catch {
    iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  }
}

async function fetchRtpCapabilities(): Promise<any> {
  const data: any = await api.get('/sfu/rtp-capabilities/default');
  return data.rtpCapabilities;
}

export async function createSendTransport(channelId: string): Promise<any> {
  if (sendTransport && sendTransportChannelId && sendTransportChannelId !== channelId) {
    sendTransport.close();
    sendTransport = null;
    sendTransportChannelId = null;
  }
  if (sendTransport) return sendTransport;
  if (pendingSendTransport) return pendingSendTransport;

  pendingSendTransport = (async () => {
    await wsClient.connect();
    const dev = await initDevice();

    const transportOptions = await requestTransport(channelId, 'send');

    sendTransport = dev.createSendTransport({
      ...transportOptions,
      iceServers,
    });
    sendTransportChannelId = channelId;

    sendTransport.on('connect', async ({ dtlsParameters }: any, callback: any, errback: any) => {
      try {
        wsClient.send({
          type: 'transport.connect',
          channelId,
          transportId: sendTransport.id,
          dtlsParameters,
        });
        await waitForConfirm('transport.connected', sendTransport.id);
        callback();
      } catch (err) {
        errback(err as Error);
      }
    });

    sendTransport.on('produce', async ({ kind, rtpParameters }: any, callback: any, errback: any) => {
      try {
        wsClient.send({
          type: 'produce',
          channelId,
          transportId: sendTransport.id,
          kind,
          rtpParameters,
        });
        const msg = await waitForConfirm('produced', '');
        callback({ id: msg.producerId });
      } catch (err) {
        errback(err as Error);
      }
    });

    sendTransport.on('connectionstatechange', (state: string) => {
      if (state === 'failed' || state === 'disconnected') {
        sendTransport = null;
        sendTransportChannelId = null;
      }
    });

    return sendTransport;
  })();

  try {
    return await pendingSendTransport;
  } finally {
    pendingSendTransport = null;
  }
}

export async function createRecvTransport(channelId: string): Promise<any> {
  if (recvTransport && recvTransportChannelId && recvTransportChannelId !== channelId) {
    recvTransport.close();
    recvTransport = null;
    recvTransportChannelId = null;
  }
  if (recvTransport) return recvTransport;
  if (pendingRecvTransport) return pendingRecvTransport;

  pendingRecvTransport = (async () => {
    await wsClient.connect();
    const dev = await initDevice();

    const transportOptions = await requestTransport(channelId, 'recv');

    recvTransport = dev.createRecvTransport({
      ...transportOptions,
      iceServers,
    });
    recvTransportChannelId = channelId;

    recvTransport.on('connect', async ({ dtlsParameters }: any, callback: any, errback: any) => {
      try {
        wsClient.send({
          type: 'transport.connect',
          channelId,
          transportId: recvTransport.id,
          dtlsParameters,
        });
        await waitForConfirm('transport.connected', recvTransport.id);
        callback();
      } catch (err) {
        errback(err as Error);
      }
    });

    recvTransport.on('connectionstatechange', (state: string) => {
      if (state === 'failed' || state === 'disconnected') {
        recvTransport = null;
        recvTransportChannelId = null;
      }
    });

    return recvTransport;
  })();

  try {
    return await pendingRecvTransport;
  } finally {
    pendingRecvTransport = null;
  }
}

async function requestTransport(channelId: string, direction: string): Promise<any> {
  await wsClient.connect();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      wsClient.off('transport.created', handler);
      reject(new Error('Transport creation timeout'));
    }, 10000);

    const handler = (msg: any) => {
      if (
        msg.type === 'transport.created' &&
        msg.channelId === channelId &&
        msg.direction === direction
      ) {
        wsClient.off('transport.created', handler);
        clearTimeout(timeout);
        resolve({
          id: msg.transportId,
          iceParameters: msg.iceParameters,
          iceCandidates: msg.iceCandidates,
          dtlsParameters: msg.dtlsParameters,
        });
      }
    };

    wsClient.on('transport.created', handler);
    const sent = wsClient.send({ type: 'transport.create', channelId, direction });
    if (!sent) {
      wsClient.off('transport.created', handler);
      clearTimeout(timeout);
      reject(new Error('WebSocket is not connected'));
    }
  });
}

export async function createProducer(channelId: string, track: MediaStreamTrack): Promise<any | null> {
  const transport = await createSendTransport(channelId);
  try {
    const producer = await transport.produce({
      track,
      encodings: getOpusEncodings(),
      codecOptions: {
        opusStereo: 0,
        opusFec: 1,
        opusDtx: 1,
        opusMaxPlaybackRate: 48000,
      },
    });

    producer.on('score', (score: any) => {
      const scores = Array.isArray(score) ? score : [score];
      const avgScore = scores.reduce((a: number, s: any) => a + (s.score ?? 0), 0) / scores.length;
      if (producer.appData) {
        producer.appData.score = avgScore;
      }
    });

    return producer;
  } catch (err) {
    console.error('Failed to create producer:', err);
    return null;
  }
}

export async function createVideoProducer(channelId: string, track: MediaStreamTrack): Promise<any | null> {
  const transport = await createSendTransport(channelId);
  try {
    const producer = await transport.produce({
      track,
      encodings: getVideoEncodings(track),
    });

    producer.on('score', () => {});

    return producer;
  } catch (err) {
    console.error('Failed to create video producer:', err);
    return null;
  }
}

function getVideoEncodings(track: MediaStreamTrack) {
  const { width = 640, height = 480 } = track.getSettings();
  const resolution = Math.max(width, height);

  if (resolution > 900) {
    return [
      { maxBitrate: 1500000, scaleResolutionDownBy: 4 },
      { maxBitrate: 500000, scaleResolutionDownBy: 2 },
      { maxBitrate: 200000, scaleResolutionDownBy: 1 },
    ];
  }
  if (resolution > 480) {
    return [
      { maxBitrate: 500000, scaleResolutionDownBy: 2 },
      { maxBitrate: 200000, scaleResolutionDownBy: 1 },
    ];
  }
  return [
    { maxBitrate: 200000, scaleResolutionDownBy: 1 },
  ];
}

export async function createConsumer(
  channelId: string,
  producerId: string,
): Promise<any | null> {
  const transport = await createRecvTransport(channelId);
  try {
    const dev = await initDevice();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Consume timeout')), 10000);

      const handler = (msg: any) => {
        if (msg.type === 'consumed' && msg.producerId === producerId) {
          wsClient.off('consumed', handler);
          clearTimeout(timeout);
          resolve(createConsumerFromResponse(transport, msg));
        }
      };

      wsClient.on('consumed', handler);

      wsClient.send({
        type: 'consume',
        channelId,
        transportId: transport.id,
        producerId,
        rtpCapabilities: device!.rtpCapabilities,
      });
    });
  } catch (err) {
    console.error('Failed to create consumer:', err);
    return null;
  }
}

async function createConsumerFromResponse(transport: any, msg: any): Promise<any> {
  const consumer = await transport.consume({
    id: msg.consumerId,
    producerId: msg.producerId,
    kind: msg.kind,
    rtpParameters: msg.rtpParameters,
  });

  wsClient.send({ type: 'consumer.resume', consumerId: consumer.id });

  return consumer;
}

function getOpusEncodings() {
  return [
    { maxBitrate: 48000, scaleResolutionDownBy: 1 },
  ];
}

function waitForConfirm(eventType: string, id: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      wsClient.off(eventType, handler);
      reject(new Error(`Timeout waiting for ${eventType}`));
    }, 8000);

    const handler = (msg: any) => {
      if (msg.type === eventType && (!id || msg.transportId === id || msg.consumerId === id || msg.producerId === id)) {
        wsClient.off(eventType, handler);
        clearTimeout(timeout);
        resolve(msg);
      }
    };

    wsClient.on(eventType, handler);
  });
}

export function closeTransports(): void {
  sendTransport?.close();
  recvTransport?.close();
  sendTransport = null;
  recvTransport = null;
  sendTransportChannelId = null;
  recvTransportChannelId = null;
}

export function closeRecvTransport(): void {
  recvTransport?.close();
  recvTransport = null;
  recvTransportChannelId = null;
}

export function isDeviceReady(): boolean {
  return device?.loaded ?? false;
}

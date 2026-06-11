export const mediasoupConfig = {
  numWorkers: parseInt(process.env.MEDIASOUP_NUM_WORKERS || '2'),

  worker: {
    logLevel: 'warn' as const,
    logTags: ['ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
    rtcMinPort: parseInt(process.env.MEDIASOUP_MIN_PORT || '40000'),
    rtcMaxPort: parseInt(process.env.MEDIASOUP_MAX_PORT || '40100'),
  } as any,

  router: {
    mediaCodecs: [
      {
        kind: 'audio' as const,
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
        parameters: {
          useinbandfec: 1,
          usedtx: 1,
          stereo: 0,
          maxaveragebitrate: 48000,
          maxplaybackrate: 48000,
          cbr: 0,
          sprop_stereo: 0,
        },
      },
      {
        kind: 'video' as const,
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {},
      },
    ],
  } as any,

  webRtcTransport: {
    listenIps: [
      {
        ip: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
        announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1',
      },
    ],
    initialAvailableOutgoingBitrate: 256000,
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  } as any,

  plainTransport: {
    listenIp: { ip: '0.0.0.0', announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1' },
    rtcpMux: true,
    comedia: true,
  } as any,

  recordingPlainTransport: {
    listenIp: { ip: '127.0.0.1' },
    rtcpMux: true,
    comedia: false,
  } as any,

  producer: {
    minBitrate: 16000,
    maxBitrate: 48000,
    adaptive: true,
  },
};

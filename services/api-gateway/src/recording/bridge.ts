import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { existsSync } from 'fs';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { transportManager } from '../mediasoup/transport-manager.js';
import { consumerManager } from '../mediasoup/consumer-manager.js';
import { producerManager } from '../mediasoup/producer-manager.js';
import { roomManager } from '../mediasoup/room-manager.js';
import { recordingManager } from './index.js';
import { recordRecordingSession, recordRecordingDuration } from '../lib/metrics.js';
import { logger } from '../lib/logger.js';

interface ChannelRecorder {
  port: number;
  sessionId: string;
  producerId: string;
  speakerId: string;
  speakerName: string;
  startedAt: number;
  ffmpeg: ChildProcessWithoutNullStreams;
  outputFile: string;
}

const activeRecorders = new Map<string, ChannelRecorder>();

function getNextPort(): number {
  return 41000 + activeRecorders.size;
}

function getFfmpegCommand(): string {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}

function buildMinimalFfmpegRtpCapabilities(room: any) {
  const codec = room.router.rtpCapabilities.codecs.find(
    (item: any) => item.kind === 'audio' && item.mimeType.toLowerCase() === 'audio/opus',
  );

  if (!codec) {
    throw new Error('Router has no Opus codec for recording');
  }

  return {
    codecs: [
      {
        mimeType: codec.mimeType,
        kind: codec.kind,
        preferredPayloadType: codec.preferredPayloadType,
        clockRate: codec.clockRate,
        channels: codec.channels,
        parameters: codec.parameters || {},
        rtcpFeedback: [],
      },
    ],
    headerExtensions: [],
  };
}

function buildOpusSdp(
  port: number,
  payloadType: number,
  codecParameters: Record<string, any> = {},
  ssrc?: number,
): string {
  const cname = 'voxrelay-recorder';
  const ssrcLine = ssrc ? `a=ssrc:${ssrc} cname:${cname}\r\n` : '';
  const fmtpEntries = Object.entries(codecParameters)
    .map(([key, value]) => `${key}=${value}`);
  const fmtpLine = fmtpEntries.length > 0
    ? `a=fmtp:${payloadType} ${fmtpEntries.join(';')}\r\n`
    : '';
  return [
    'v=0',
    'o=- 0 0 IN IP4 127.0.0.1',
    's=VoxRelay Recording',
    'c=IN IP4 127.0.0.1',
    't=0 0',
    `m=audio ${port} RTP/AVP ${payloadType}`,
    `a=rtpmap:${payloadType} opus/48000/2`,
    'a=rtcp-mux',
    fmtpLine.trimEnd(),
    'a=recvonly',
    ssrcLine.trimEnd(),
    '',
  ].filter(Boolean).join('\r\n');
}

async function waitForProcessExit(proc: ChildProcessWithoutNullStreams, timeoutMs = 3000): Promise<void> {
  await new Promise<void>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve();
    }, timeoutMs);

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };

    proc.once('close', finish);
    proc.once('exit', finish);
    proc.once('error', finish);
  });
}

export async function startChannelRecording(
  channelId: string,
  speakerId: string,
  speakerName: string,
): Promise<void> {
  if (activeRecorders.has(channelId)) return;

  const room = roomManager.getRoom(channelId);
  if (!room) {
    throw new Error(`Room ${channelId} not found`);
  }

  const speakers = producerManager.getProducersByUser(room, speakerId);
  if (speakers.length === 0) {
    throw new Error(`No producers for user ${speakerId} in channel ${channelId}`);
  }

  const sessionId = await recordingManager.startSession(channelId, speakerId);
  try {
    recordRecordingSession();
    const plainTransport = await transportManager.createRecordingPlainTransport(room);
    const port = getNextPort();

    await plainTransport.connect({ ip: '127.0.0.1', port });
    const ffmpegRtpCapabilities = buildMinimalFfmpegRtpCapabilities(room);

    const consumer = await plainTransport.consume({
      producerId: speakers[0].id,
      rtpCapabilities: ffmpegRtpCapabilities,
      paused: true,
      appData: { channelId, userId: speakerId, type: 'recording' },
    });

    room.consumers.set(consumer.id, consumer);
    room.recordingConsumer = consumer;

    const codec = consumer.rtpParameters?.codecs?.[0];
    const payloadType = codec?.payloadType ?? 111;
    const ssrc = consumer.rtpParameters?.encodings?.[0]?.ssrc;

    const outputFile = path.join(
      os.tmpdir(),
      `voxrelay-${channelId}-${sessionId}-${Date.now()}.ogg`,
    );
    const sdp = buildOpusSdp(port, payloadType, codec?.parameters || {}, ssrc);
    const ffmpegBin = getFfmpegCommand();

    let ffmpeg: ChildProcessWithoutNullStreams;
    try {
      ffmpeg = spawn(
      ffmpegBin,
      [
        '-loglevel', 'warning',
        '-protocol_whitelist', 'file,udp,rtp,pipe',
        '-f', 'sdp',
        '-i', 'pipe:0',
        '-c:a', 'libopus',
        '-b:a', '32k',
        '-ar', '48000',
        '-ac', '1',
        '-f', 'ogg',
        '-y',
        outputFile,
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
      );
    } catch (err: any) {
      throw new Error(`Cannot start ffmpeg: ${err.message}`);
    }

    ffmpeg.stdin.write(sdp);
    ffmpeg.stdin.end();

  ffmpeg.stderr.on('data', (chunk) => {
    const msg = chunk.toString().trim();
    if (msg) logger.warn({ channelId }, `ffmpeg: ${msg}`);
  });

  ffmpeg.on('error', (err) => {
    logger.error({ err, channelId }, 'ffmpeg process error');
  });

    const recorder: ChannelRecorder = {
      port,
      sessionId,
      producerId: speakers[0].id,
      speakerId,
      speakerName,
      startedAt: Date.now(),
      ffmpeg,
      outputFile,
    };

    await consumer.resume();
    activeRecorders.set(channelId, recorder);
    logger.info({ channelId, speakerId: speakerName || speakerId, port, outputFile }, 'Recording started');
  } catch (err) {
    await recordingManager.stopSession(channelId).catch(() => {});
    throw err;
  }
}

export async function stopChannelRecording(channelId: string, speakerId?: string): Promise<void> {
  const recorder = activeRecorders.get(channelId);
  try {
    if (recorder) {
      const durationMs = Date.now() - recorder.startedAt;
      const room = roomManager.getRoom(channelId);
      const producer = room?.producers.get(recorder.producerId);
      const consumer = room?.recordingConsumer;
      const transport = room?.recordingTransport as any;
      const producerTransportId = producer?.appData?.transportId as string | undefined;
      const producerTransport = producerTransportId && room
        ? room.transports.get(producerTransportId) as any
        : null;

      try {
        const [producerStats, consumerStats, transportStats, producerTransportStats] = await Promise.all([
          producer?.getStats?.() ?? Promise.resolve([]),
          consumer?.getStats?.() ?? Promise.resolve([]),
          transport?.getStats?.() ?? Promise.resolve([]),
          producerTransport?.getStats?.() ?? Promise.resolve([]),
        ]);
        logger.debug({ channelId, producerStats, consumerStats, transportStats }, 'Recording stats');
      } catch (statsErr: any) {
        logger.warn({ err: statsErr, channelId }, 'Recording stats collection failed');
      }

      recorder.ffmpeg.kill('SIGINT');
      await waitForProcessExit(recorder.ffmpeg, 3000);
      activeRecorders.delete(channelId);

      let audioBuffer = Buffer.alloc(0);
      if (existsSync(recorder.outputFile)) {
        audioBuffer = await fs.readFile(recorder.outputFile);
        await fs.unlink(recorder.outputFile).catch(() => {});
      }

      if (audioBuffer.length > 0) {
        await recordingManager.saveSegment(
          channelId,
          recorder.speakerId,
          recorder.speakerName,
          audioBuffer,
          durationMs,
        );
      }

      recordRecordingDuration(durationMs);
      logger.info({ channelId, durationMs, size: audioBuffer.length }, 'Recording stopped');
    }
    await recordingManager.stopSession(channelId).catch(() => {});
  } finally {
    const room = roomManager.getRoom(channelId);
    if (room && room.recordingConsumer) {
      consumerManager.closeConsumer(room, room.recordingConsumer.id);
      room.recordingConsumer = null;
    }
    if (room) {
      transportManager.closeRecordingPlainTransport(room);
    }
  }
}

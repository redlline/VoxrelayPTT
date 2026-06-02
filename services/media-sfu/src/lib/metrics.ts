import promClient from 'prom-client';
import { roomManager } from '../mediasoup/room-manager.js';

export function initMetrics(): void {
  promClient.collectDefaultMetrics();
}

export async function getMetricsJson(): Promise<string> {
  return promClient.register.metrics();
}

const pttRequestsTotal = new promClient.Counter({
  name: 'voxrelay_ptt_requests_total',
  help: 'Total PTT floor requests',
  labelNames: ['channel_id', 'role'],
});

const pttGrantsTotal = new promClient.Counter({
  name: 'voxrelay_ptt_grants_total',
  help: 'Total PTT floor grants',
  labelNames: ['channel_id'],
});

const pttReleasesTotal = new promClient.Counter({
  name: 'voxrelay_ptt_releases_total',
  help: 'Total PTT floor releases',
  labelNames: ['channel_id'],
});

const wsConnectionsGauge = new promClient.Gauge({
  name: 'voxrelay_ws_connections',
  help: 'Current WebSocket connections',
});

const wsMessagesTotal = new promClient.Counter({
  name: 'voxrelay_ws_messages_total',
  help: 'Total WebSocket messages processed',
  labelNames: ['type'],
});

const recordingSessionsTotal = new promClient.Counter({
  name: 'voxrelay_recording_sessions_total',
  help: 'Total recording sessions started',
});

const recordingDurationMs = new promClient.Histogram({
  name: 'voxrelay_recording_duration_ms',
  help: 'Recording duration in milliseconds',
  buckets: [1000, 5000, 15000, 30000, 60000, 120000],
});

const mediasoupWorkersGauge = new promClient.Gauge({
  name: 'voxrelay_mediasoup_workers',
  help: 'Current Mediasoup workers count',
});

const mediasoupRoomsGauge = new promClient.Gauge({
  name: 'voxrelay_mediasoup_rooms',
  help: 'Current Mediasoup rooms (channels) count',
});

const mediasoupTransportsGauge = new promClient.Gauge({
  name: 'voxrelay_mediasoup_transports',
  help: 'Current Mediasoup transports count',
  labelNames: ['channel_id'],
});

const mediasoupProducersGauge = new promClient.Gauge({
  name: 'voxrelay_mediasoup_producers',
  help: 'Current Mediasoup producers count',
  labelNames: ['channel_id'],
});

const mediasoupConsumersGauge = new promClient.Gauge({
  name: 'voxrelay_mediasoup_consumers',
  help: 'Current Mediasoup consumers count',
  labelNames: ['channel_id'],
});

export function recordPttRequest(channelId: string, role: string): void {
  pttRequestsTotal.inc({ channel_id: channelId, role });
}

export function recordPttGrant(channelId: string): void {
  pttGrantsTotal.inc({ channel_id: channelId });
}

export function recordPttRelease(channelId: string): void {
  pttReleasesTotal.inc({ channel_id: channelId });
}

export function setWsConnections(count: number): void {
  wsConnectionsGauge.set(count);
}

export function recordWsMessage(type: string): void {
  wsMessagesTotal.inc({ type });
}

export function recordRecordingSession(): void {
  recordingSessionsTotal.inc();
}

export function recordRecordingDuration(durationMs: number): void {
  recordingDurationMs.observe(durationMs);
}

export function updateMediasoupMetrics(): void {
  mediasoupWorkersGauge.set(roomManager.getWorkerCount());
  mediasoupRoomsGauge.set(roomManager.getRoomCount());

  const rooms = roomManager.getRoomsMap();
  for (const [channelId, room] of rooms) {
    mediasoupTransportsGauge.set({ channel_id: channelId }, room.transports.size);
    mediasoupProducersGauge.set({ channel_id: channelId }, room.producers.size);
    mediasoupConsumersGauge.set({ channel_id: channelId }, room.consumers.size);
  }
}

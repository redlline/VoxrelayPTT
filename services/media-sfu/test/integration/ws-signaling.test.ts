import { describe, it, expect } from 'vitest';
import { WebSocket } from 'ws';

const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const WS = process.env.TEST_WS_URL || 'ws://127.0.0.1:3000/ws';

async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  return (await res.json()).accessToken;
}

function connectWs(token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}?token=${token}`);
    const timer = setTimeout(() => reject(new Error('WS connection timeout')), 5000);
    ws.on('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function waitForMessage(ws: WebSocket, type: string, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeout);
    const onMessage = (raw: Buffer) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === type) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        resolve(msg);
      }
    };
    ws.on('message', onMessage);
  });
}

describe('WS signaling integration', async () => {
  const up = await isServerUp();
  const testFn = up ? it : it.skip;

  testFn('join/create transport/PTT/release/leave flow', async () => {
    const token = await login('admin@voxrelay.local', 'admin123');
    const ws = await connectWs(token);

    const channelsRes = await fetch(`${API}/api/v1/channels`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(channelsRes.ok).toBe(true);
    const { channels } = await channelsRes.json();
    const channelId = channels[0].id as string;

    ws.send(JSON.stringify({ type: 'channel.join', channelId }));
    const joinMsg = await waitForMessage(ws, 'channel.joined');
    expect(joinMsg.channelId).toBe(channelId);

    ws.send(JSON.stringify({ type: 'transport.create', channelId, direction: 'send' }));
    const transportCreated = await waitForMessage(ws, 'transport.created');
    expect(transportCreated.transportId).toBeTruthy();
    expect(transportCreated.iceParameters).toBeTruthy();

    ws.send(JSON.stringify({
      type: 'transport.connect',
      channelId,
      transportId: transportCreated.transportId,
      dtlsParameters: transportCreated.dtlsParameters,
    }));
    const transportConnected = await waitForMessage(ws, 'transport.connected');
    expect(transportConnected.transportId).toBe(transportCreated.transportId);

    ws.send(JSON.stringify({ type: 'ptt.request', channelId }));
    const pttGranted = await waitForMessage(ws, 'ptt.granted');
    expect(pttGranted.channelId).toBe(channelId);

    ws.send(JSON.stringify({ type: 'ptt.release', channelId }));
    const pttReleased = await waitForMessage(ws, 'ptt.released');
    expect(pttReleased.channelId).toBe(channelId);

    ws.send(JSON.stringify({ type: 'channel.leave', channelId }));
    const leftMsg = await waitForMessage(ws, 'channel.left');
    expect(leftMsg.channelId).toBe(channelId);

    ws.close();
  }, 30_000);
});

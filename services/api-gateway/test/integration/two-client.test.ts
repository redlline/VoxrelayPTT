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

async function ensureUser(email: string, displayName: string): Promise<void> {
  const adminToken = await login('admin@voxrelay.local', 'admin123');
  await fetch(`${API}/api/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      email,
      password: 'test12345',
      displayName,
      role: 'user',
    }),
  });
}

function connectWs(token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}?token=${token}`);
    const timer = setTimeout(() => reject(new Error('WS timeout')), 8000);
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

function waitFor(ws: WebSocket, type: string, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout ${type}`)), timeout);
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

describe('Two-client floor control integration', async () => {
  const up = await isServerUp();
  const testFn = up ? it : it.skip;

  testFn('queues second speaker and promotes after release', async () => {
    const adminToken = await login('admin@voxrelay.local', 'admin123');
    const channelsRes = await fetch(`${API}/api/v1/channels`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(channelsRes.ok).toBe(true);
    const channelId = ((await channelsRes.json()).channels)[0].id as string;

    await ensureUser('user-two@test.local', 'UserTwo');

    const userAToken = await login('admin@voxrelay.local', 'admin123');
    const userBToken = await login('user-two@test.local', 'test12345');

    const wsA = await connectWs(userAToken);
    const wsB = await connectWs(userBToken);

    wsA.send(JSON.stringify({ type: 'channel.join', channelId }));
    wsB.send(JSON.stringify({ type: 'channel.join', channelId }));
    await waitFor(wsA, 'channel.joined');
    await waitFor(wsB, 'channel.joined');

    wsA.send(JSON.stringify({ type: 'ptt.request', channelId }));
    const grantedA = await waitFor(wsA, 'ptt.granted');
    expect(grantedA.channelId).toBe(channelId);

    wsB.send(JSON.stringify({ type: 'ptt.request', channelId }));
    const queuedB = await waitFor(wsB, 'ptt.queued');
    expect(queuedB.channelId).toBe(channelId);
    expect(queuedB.position).toBeGreaterThanOrEqual(1);

    const grantedBPromise = waitFor(wsB, 'ptt.granted', 8000);
    wsA.send(JSON.stringify({ type: 'ptt.release', channelId }));
    await waitFor(wsA, 'ptt.released');

    const grantedB = await grantedBPromise;
    expect(grantedB.channelId).toBe(channelId);

    wsB.send(JSON.stringify({ type: 'ptt.release', channelId }));
    await waitFor(wsB, 'ptt.released');

    wsA.send(JSON.stringify({ type: 'channel.leave', channelId }));
    wsB.send(JSON.stringify({ type: 'channel.leave', channelId }));
    await waitFor(wsA, 'channel.left');
    await waitFor(wsB, 'channel.left');

    wsA.close();
    wsB.close();
  }, 40_000);
});

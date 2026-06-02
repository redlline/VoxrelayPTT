import { describe, it, expect } from 'vitest';
import { WebSocket } from 'ws';

const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const WS = process.env.TEST_WS_URL || 'ws://127.0.0.1:3000/ws';
const RUN_LOAD_TEST = process.env.RUN_LOAD_TEST === '1';
const CONCURRENT = parseInt(process.env.LOAD_TEST_CLIENTS || '100', 10);

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

async function createUser(email: string, displayName: string): Promise<string> {
  const adminToken = await login('admin@voxrelay.local', 'admin123');
  const res = await fetch(`${API}/api/v1/admin/users`, {
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

  if (res.status !== 201 && res.status !== 409) {
    throw new Error(`Create user failed: ${res.status}`);
  }
  return login(email, 'test12345');
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

describe('Load test', async () => {
  const up = await isServerUp();
  const testFn = up && RUN_LOAD_TEST ? it : it.skip;

  testFn('handles concurrent clients and PTT requests', async () => {
    const token = await login('admin@voxrelay.local', 'admin123');
    const channelsRes = await fetch(`${API}/api/v1/channels`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(channelsRes.ok).toBe(true);
    const channelId = ((await channelsRes.json()).channels)[0].id as string;

    const connections: WebSocket[] = [];
    let errors = 0;

    const connectPromises = Array.from({ length: CONCURRENT }, async (_, i) => {
      try {
        const userToken = await createUser(`loadtest${i}@test.local`, `LoadTest${i}`);
        const ws = await connectWs(userToken);
        ws.send(JSON.stringify({ type: 'channel.join', channelId }));
        connections.push(ws);
        return true;
      } catch {
        errors++;
        return false;
      }
    });

    const results = await Promise.all(connectPromises);
    const connected = results.filter(Boolean).length;
    expect(connected).toBeGreaterThan(0);

    const pttPromises = connections.slice(0, Math.min(50, connections.length)).map((ws) => {
      return new Promise<void>((resolve) => {
        ws.send(JSON.stringify({ type: 'ptt.request', channelId }));
        const onMsg = (raw: Buffer) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'ptt.granted' || msg.type === 'ptt.queued') {
            ws.off('message', onMsg);
            resolve();
          }
        };
        ws.on('message', onMsg);
        setTimeout(resolve, 5000);
      });
    });
    await Promise.all(pttPromises);

    for (const ws of connections) {
      ws.send(JSON.stringify({ type: 'ptt.release', channelId }));
      ws.send(JSON.stringify({ type: 'channel.leave', channelId }));
      ws.close();
    }

    expect(errors).toBeLessThan(CONCURRENT);
  }, 120_000);
});

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

async function ensureUser(email: string, displayName: string, role = 'user'): Promise<void> {
  const adminToken = await login('admin@voxrelay.local', 'admin123');
  await fetch(`${API}/api/v1/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ email, password: 'test12345', displayName, role }),
  }).catch(() => {});
}

function connectWs(token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}?token=${token}`);
    const timer = setTimeout(() => reject(new Error('WS timeout')), 8000);
    ws.on('open', () => { clearTimeout(timer); resolve(ws); });
    ws.on('error', (err) => { clearTimeout(timer); reject(err); });
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

describe('Reconnection and dispatcher integration', async () => {
  const up = await isServerUp();
  const testFn = up ? it : it.skip;

  testFn('transport restart Ice works', async () => {
    const token = await login('admin@voxrelay.local', 'admin123');
    const ws = await connectWs(token);

    const { channels } = await (await fetch(`${API}/api/v1/channels`, {
      headers: { Authorization: `Bearer ${token}` },
    })).json();
    const channelId = channels[0].id as string;

    ws.send(JSON.stringify({ type: 'channel.join', channelId }));
    await waitFor(ws, 'channel.joined');

    ws.send(JSON.stringify({ type: 'transport.create', channelId, direction: 'send' }));
    const created = await waitFor(ws, 'transport.created');

    ws.send(JSON.stringify({ type: 'transport.restart', channelId, transportId: created.transportId }));
    const restarted = await waitFor(ws, 'transport.restarted');
    expect(restarted.transportId).toBe(created.transportId);
    expect(restarted.iceParameters).toBeTruthy();

    ws.send(JSON.stringify({ type: 'channel.leave', channelId }));
    await waitFor(ws, 'channel.left');
    ws.close();
  }, 20_000);

  testFn('dispatcher force PTT via WS', async () => {
    await ensureUser('dispatcher-test@test.local', 'DispatcherTest', 'dispatcher');
    await ensureUser('target-user@test.local', 'TargetUser');

    const dispToken = await login('dispatcher-test@test.local', 'test12345');
    const userToken = await login('target-user@test.local', 'test12345');

    const wsDisp = await connectWs(dispToken);
    const wsUser = await connectWs(userToken);

    const { channels } = await (await fetch(`${API}/api/v1/channels`, {
      headers: { Authorization: `Bearer ${dispToken}` },
    })).json();
    const channelId = channels[0].id as string;

    wsDisp.send(JSON.stringify({ type: 'channel.join', channelId }));
    wsUser.send(JSON.stringify({ type: 'channel.join', channelId }));
    await waitFor(wsDisp, 'channel.joined');
    await waitFor(wsUser, 'channel.joined');

    // User requests PTT first
    wsUser.send(JSON.stringify({ type: 'ptt.request', channelId }));
    await waitFor(wsUser, 'ptt.granted');

    // Dispatcher force-releases the user
    wsDisp.send(JSON.stringify({ type: 'dispatcher.force_release', channelId, targetUserId: (await (await fetch(`${API}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${userToken}` } })).json()).user.id }));
    await waitFor(wsUser, 'ptt.force_release', 6000);

    // Dispatcher force-ptt to user
    const targetUser = (await (await fetch(`${API}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${userToken}` } })).json()).user;
    wsDisp.send(JSON.stringify({ type: 'dispatcher.force_ptt', channelId, targetUserId: targetUser.id }));
    await waitFor(wsUser, 'ptt.granted', 6000);

    wsDisp.send(JSON.stringify({ type: 'channel.leave', channelId }));
    wsUser.send(JSON.stringify({ type: 'channel.leave', channelId }));
    await waitFor(wsDisp, 'channel.left');
    await waitFor(wsUser, 'channel.left');
    wsDisp.close();
    wsUser.close();
  }, 30_000);

  testFn('dispatcher text announcement', async () => {
    const token = await login('admin@voxrelay.local', 'admin123');
    const ws = await connectWs(token);

    const { channels } = await (await fetch(`${API}/api/v1/channels`, {
      headers: { Authorization: `Bearer ${token}` },
    })).json();
    const channelId = channels[0].id as string;

    ws.send(JSON.stringify({ type: 'channel.join', channelId }));
    await waitFor(ws, 'channel.joined');

    ws.send(JSON.stringify({ type: 'dispatcher.announcement', channelId, text: 'Test announcement' }));
    const an = await waitFor(ws, 'dispatcher.announcement');
    expect(an.text).toBe('Test announcement');

    ws.send(JSON.stringify({ type: 'channel.leave', channelId }));
    await waitFor(ws, 'channel.left');
    ws.close();
  }, 15_000);
});

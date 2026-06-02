import { normalizeUser, useAuthStore } from '@/features/auth/store';

type MessageHandler = (data: any) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private lifecycleHandlers = new Map<'connected' | 'disconnected', Set<() => void>>();
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private maxReconnectDelay = 30000;
  private url: string = '';
  private intentionalClose = false;
  private connectPromise: Promise<void> | null = null;
  private authRecoverInProgress = false;
  private refreshPromise: Promise<boolean> | null = null;

  connect(): Promise<void> {
    return this.connectWithFreshToken();
  }

  private pingInterval: number | null = null;

  private doConnect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;
    if (this.ws?.readyState === WebSocket.CONNECTING) {
      this.connectPromise = new Promise((resolve, reject) => {
        const onConnected = () => {
          this.offLifecycle('connected', onConnected);
          this.offLifecycle('disconnected', onDisconnected);
          resolve();
        };
        const onDisconnected = () => {
          this.offLifecycle('connected', onConnected);
          this.offLifecycle('disconnected', onDisconnected);
          reject(new Error('Socket disconnected while connecting'));
        };
        this.onLifecycle('connected', onConnected);
        this.onLifecycle('disconnected', onDisconnected);
      });
      return this.connectPromise;
    }

    this.connectPromise = new Promise((resolve, reject) => {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          this.reconnectAttempt = 0;
          this.emitLifecycle('connected');
          if (this.pingInterval) clearInterval(this.pingInterval);
          this.pingInterval = window.setInterval(() => {
            this.send({ type: 'ping' });
          }, 30000);
          this.connectPromise = null;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'pong') return;
            const handlers = this.handlers.get(data.type);
            if (handlers) {
              handlers.forEach((handler) => handler(data));
            }
          } catch { }
        };

        this.ws.onclose = (event) => {
          if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
          }
          this.emitLifecycle('disconnected');
          if (this.connectPromise) {
            this.connectPromise = null;
            reject(new Error('WebSocket closed'));
          }
          if (!this.intentionalClose) {
            if (event.code === 4001) {
              void this.handleAuthClose();
              return;
            }
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), this.maxReconnectDelay);
            this.reconnectAttempt++;
            this.reconnectTimer = window.setTimeout(() => {
              void this.doConnect().catch(() => {});
            }, delay);
          }
        };

        this.ws.onerror = () => {
          this.ws?.close();
        };
      } catch {
        if (!this.intentionalClose) {
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), this.maxReconnectDelay);
          this.reconnectAttempt++;
          this.reconnectTimer = window.setTimeout(() => {
            void this.doConnect().catch(() => {});
          }, delay);
        }
        this.connectPromise = null;
        reject(new Error('Failed to open WebSocket'));
      }
    });

    return this.connectPromise;
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.connectPromise = null;
  }

  send(data: any): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return true;
    }
    return false;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  on(type: string, handler: MessageHandler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
  }

  off(type: string, handler: MessageHandler) {
    this.handlers.get(type)?.delete(handler);
  }

  onLifecycle(event: 'connected' | 'disconnected', handler: () => void) {
    if (!this.lifecycleHandlers.has(event)) {
      this.lifecycleHandlers.set(event, new Set());
    }
    this.lifecycleHandlers.get(event)!.add(handler);
  }

  offLifecycle(event: 'connected' | 'disconnected', handler: () => void) {
    this.lifecycleHandlers.get(event)?.delete(handler);
  }

  private emitLifecycle(event: 'connected' | 'disconnected') {
    this.lifecycleHandlers.get(event)?.forEach((handler) => handler());
  }

  private async connectWithFreshToken(): Promise<void> {
    let token = useAuthStore.getState().accessToken;
    if (!token) return Promise.reject(new Error('No auth token'));

    if (this.isTokenExpired(token)) {
      const refreshed = await this.tryRefresh();
      if (!refreshed) {
        useAuthStore.getState().logout();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        throw new Error('Session expired');
      }
      token = useAuthStore.getState().accessToken;
      if (!token) throw new Error('No auth token after refresh');
    }

    this.intentionalClose = false;
    this.url = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws?token=${token}`;
    return this.doConnect();
  }

  private isTokenExpired(token: string): boolean {
    try {
      const payloadPart = token.split('.')[1];
      if (!payloadPart) return true;
      const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
      const json = atob(base64);
      const payload = JSON.parse(json) as { exp?: number };
      if (!payload.exp) return true;
      const nowSec = Math.floor(Date.now() / 1000);
      // Check 60 seconds before expiration to account for network delays
      return payload.exp <= nowSec + 60;
    } catch {
      return true;
    }
  }

  private async handleAuthClose(): Promise<void> {
    if (this.authRecoverInProgress) return;
    this.authRecoverInProgress = true;
    try {
      const refreshed = await this.tryRefresh();
      if (!refreshed) {
        useAuthStore.getState().logout();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return;
      }

      this.reconnectAttempt = 0;
      await this.connect();
    } catch {
      useAuthStore.getState().logout();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    } finally {
      this.authRecoverInProgress = false;
    }
  }

  private async tryRefresh(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      try {
        const response = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });
        if (!response.ok) return false;

        const data = await response.json();
        const userResponse = await fetch('/api/v1/auth/me', {
          headers: { Authorization: `Bearer ${data.accessToken}` },
        });
        if (!userResponse.ok) return false;

        const userData = await userResponse.json();
        useAuthStore.getState().setAuth(normalizeUser(userData.user), data.accessToken);
        return true;
      } catch {
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    try {
      return await this.refreshPromise;
    } catch {
      return false;
    }
  }
}

export const wsClient = new WebSocketClient();

import { vi } from 'vitest';
import WebSocket from 'ws';

import * as db from '../../src/db.js';
import type { SignalingSession } from '../../src/db.js';
import { freePort } from '../websocket/harness.js';

export const INTERNAL_SECRET = 'in-process-internal-secret';
export const ALLOWED_ORIGIN = 'http://localhost:3000';

type Frame = Record<string, unknown>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class FakeStore {
  readonly rows = new Map<string, SignalingSession>();
  failing = false;
  stalled = false;

  private answer<T>(value: T): Promise<T> {
    return this.stalled ? new Promise<T>(() => undefined) : Promise.resolve(value);
  }

  install(): void {
    const down = { message: 'store unavailable', code: '08006' };
    vi.mocked(db.getSessionByCode).mockImplementation((code) => {
      if (this.failing) return this.answer({ data: null, error: down });
      const row = this.rows.get(code);
      return this.answer({ data: row ? clone(row) : null, error: null });
    });
    vi.mocked(db.insertSession).mockImplementation((code, createdAt, expiresAt, metadata) => {
      if (this.failing) return this.answer({ error: down });
      this.rows.set(code, {
        code,
        created_at: createdAt,
        expires_at: expiresAt,
        metadata: clone(metadata),
      });
      return this.answer({ error: null });
    });
    vi.mocked(db.deleteSessionByCode).mockImplementation((code) => {
      this.rows.delete(code);
      return this.answer({ error: null });
    });
    vi.mocked(db.extendSessionExpiry).mockImplementation((code, expiresAt) => {
      const row = this.rows.get(code);
      if (row && row.expires_at < expiresAt) row.expires_at = expiresAt;
      return this.answer({ error: null });
    });
    vi.mocked(db.listStoredSessionCodes).mockImplementation((codes) =>
      this.answer({ data: codes.filter((code) => this.rows.has(code)), error: null }),
    );
    vi.mocked(db.probeDatabase).mockImplementation(() =>
      Promise.resolve(this.failing ? { ok: false, reason: '08006' } : { ok: true, latencyMs: 1 }),
    );
  }
}

export interface InProcessRelay {
  http: string;
  ws: string;
}

export async function startInProcessRelay(store: FakeStore): Promise<InProcessRelay> {
  store.install();
  const port = await freePort();
  Object.assign(process.env, {
    PORT: String(port),
    SIGNALING_PORT: String(port),
    SIGNALING_HOST: '127.0.0.1',
    SIGNALING_INTERNAL_SECRET: INTERNAL_SECRET,
    WS_CONNECTION_LIMIT: '10000',
    WS_MESSAGE_LIMIT: '10000',
  });
  await import('../../src/index.js');
  const http = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      if ((await fetch(`${http}/ready`)).status === 200) break;
    } catch {
      if (Date.now() > deadline) throw new Error('in-process relay never became ready');
    }
    if (Date.now() > deadline) throw new Error('in-process relay never became ready');
    await new Promise((r) => setTimeout(r, 50));
  }
  return { http, ws: `ws://127.0.0.1:${port}/ws` };
}

export class RelayClient {
  readonly frames: Frame[] = [];
  closed: { code: number; reason: string } | null = null;
  private waiters: Array<() => void> = [];

  private constructor(readonly socket: WebSocket) {
    socket.on('message', (raw) => {
      this.frames.push(JSON.parse(raw.toString()) as Frame);
      this.wake();
    });
    socket.on('close', (code, reason) => {
      this.closed = { code, reason: String(reason) };
      this.wake();
    });
    socket.on('error', () => undefined);
  }

  static connect(url: string): Promise<RelayClient> {
    const socket = new WebSocket(url, { headers: { origin: ALLOWED_ORIGIN } });
    const client = new RelayClient(socket);
    return new Promise((resolveClient, reject) => {
      socket.once('open', () => resolveClient(client));
      socket.once('unexpected-response', () => reject(new Error('upgrade refused')));
    });
  }

  send(frame: Frame): void {
    this.socket.send(JSON.stringify(frame));
  }

  private wake(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const waiter of waiters) waiter();
  }

  private async until<T>(read: () => T | undefined, timeoutMs: number, what: string): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const value = read();
      if (value !== undefined) return value;
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`timed out waiting for ${what}`);
      await new Promise<void>((resolveWait) => {
        const timer = setTimeout(resolveWait, remaining);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolveWait();
        });
      });
    }
  }

  frame(type: string, timeoutMs = 3_000): Promise<Frame> {
    return this.until(
      () => this.frames.find((frame) => frame['type'] === type),
      timeoutMs,
      `a ${type} frame`,
    );
  }

  closure(timeoutMs = 3_000): Promise<{ code: number; reason: string }> {
    return this.until(() => this.closed ?? undefined, timeoutMs, 'the socket to close');
  }

  close(): void {
    this.socket.terminate();
  }
}

export async function createPairing(
  relay: InProcessRelay,
  body: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`${relay.http}/pairings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${INTERNAL_SECRET}` },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

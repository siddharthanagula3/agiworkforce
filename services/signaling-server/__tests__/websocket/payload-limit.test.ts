import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import { MAX_MESSAGE_SIZE_CHARS, WS_MAX_PAYLOAD_BYTES } from '../../src/constants.js';
import { startServer, type RunningServer } from './harness.js';

const ALLOWED_ORIGIN = 'https://app.test';

interface Exchange {
  frames: Array<Record<string, unknown>>;
  closed: { code: number; reason: string } | null;
}

function exchange(
  port: number,
  headers: Record<string, string>,
  message: string,
  settleMs = 1_000,
): Promise<Exchange> {
  return new Promise((resolveExchange) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers });
    const result: Exchange = { frames: [], closed: null };
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      socket.terminate();
      resolveExchange(result);
    };
    socket.on('open', () => {
      socket.send(message);
      setTimeout(finish, settleMs);
    });
    socket.on('message', (raw) => {
      result.frames.push(JSON.parse(raw.toString()) as Record<string, unknown>);
    });
    socket.on('close', (code, reason) => {
      result.closed = { code, reason: String(reason) };
      finish();
    });
    socket.on('error', () => undefined);
  });
}

async function stillServing(server: RunningServer): Promise<boolean> {
  const live = await fetch(`http://127.0.0.1:${server.port}/live`);
  const ready = (await (await fetch(`http://127.0.0.1:${server.port}/ready`)).json()) as {
    status: string;
  };
  return live.status === 200 && ready.status !== 'shutting_down' && server.exitCode() === null;
}

describe('WebSocket payload limits', () => {
  let server: RunningServer;

  beforeAll(async () => {
    server = await startServer({ ALLOWED_ORIGINS: ALLOWED_ORIGIN });
  }, 40000);

  afterAll(() => server?.stop());

  it('bounds every frame in bytes above the largest message the character cap accepts', () => {
    expect(WS_MAX_PAYLOAD_BYTES).toBeGreaterThanOrEqual(3 * MAX_MESSAGE_SIZE_CHARS);
    expect(WS_MAX_PAYLOAD_BYTES).toBeLessThan(1024 * 1024);
  });

  it('closes a socket that sends a frame over the byte cap before buffering it', async () => {
    const result = await exchange(
      server.port,
      { origin: ALLOWED_ORIGIN },
      'x'.repeat(WS_MAX_PAYLOAD_BYTES + 1),
    );
    expect(result.closed?.code).toBe(1009);
    expect(await stillServing(server)).toBe(true);
  });

  it('answers an over-long message in band and keeps the socket open', async () => {
    const result = await exchange(
      server.port,
      { origin: ALLOWED_ORIGIN },
      'x'.repeat(MAX_MESSAGE_SIZE_CHARS + 1),
    );
    expect(result.frames).toContainEqual({ type: 'error', error: 'message_too_large' });
    expect(result.closed).toBeNull();
  });

  it('accepts a non-Latin message that fits the character cap even though it is larger in bytes', async () => {
    const text = '漢'.repeat(60_000);
    const message = JSON.stringify({ type: 'heartbeat', note: text });
    expect(Buffer.byteLength(message)).toBeGreaterThan(MAX_MESSAGE_SIZE_CHARS);
    const result = await exchange(server.port, { origin: ALLOWED_ORIGIN }, message);
    expect(result.closed).toBeNull();
    expect(result.frames).toContainEqual({ type: 'error', error: 'registration_required' });
  });

  it('survives an oversized frame on a socket the origin policy already refused', async () => {
    const result = await exchange(
      server.port,
      { origin: 'https://evil.example' },
      'x'.repeat(WS_MAX_PAYLOAD_BYTES + 1),
    );
    expect(result.closed?.code).toBe(1008);
    expect(await stillServing(server)).toBe(true);
  });

  it('survives a malformed frame on a socket the origin policy already refused', async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`, {
      headers: { origin: 'https://evil.example' },
    });
    await new Promise<void>((resolveOpen) => socket.on('open', () => resolveOpen()));
    const raw = (socket as unknown as { _socket: import('node:net').Socket })._socket;
    raw.write(Buffer.from([0x8f, 0x80, 0, 0, 0, 0]));
    await new Promise((r) => setTimeout(r, 500));
    socket.terminate();
    expect(await stillServing(server)).toBe(true);
  });
});

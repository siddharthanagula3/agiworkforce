import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import { serviceRoot, startServer, type RunningServer } from './harness.js';

const INTERNAL_SECRET = 'test-internal-secret-value';

type Probe = { outcome: 'open' } | { outcome: 'closed'; code: number; reason: string };

function probeWs(port: number, headers: Record<string, string>, settleMs = 750): Promise<Probe> {
  return new Promise((resolveProbe) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers });
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const finish = (result: Probe) => {
      if (settled) return;
      settled = true;
      if (settleTimer) clearTimeout(settleTimer);
      resolveProbe(result);
    };
    socket.on('open', () => {
      settleTimer = setTimeout(() => {
        finish({ outcome: 'open' });
        socket.close();
      }, settleMs);
    });
    socket.on('close', (code, reason) =>
      finish({ outcome: 'closed', code, reason: String(reason) }),
    );
    socket.on('error', () => finish({ outcome: 'closed', code: 0, reason: 'transport_error' }));
  });
}

describe('WebSocket origin policy with no ALLOWED_ORIGINS in production', () => {
  let server: RunningServer;

  beforeAll(async () => {
    server = await startServer({ SIGNALING_INTERNAL_SECRET: INTERNAL_SECRET });
  }, 40000);

  afterAll(() => server?.stop());

  it('rejects a browser connection instead of accepting every origin', async () => {
    const result = await probeWs(server.port, { origin: 'https://evil.example' });
    expect(result).toMatchObject({ outcome: 'closed', code: 1008 });
  });

  it('rejects a no-Origin connection that presents no internal secret', async () => {
    const result = await probeWs(server.port, {});
    expect(result).toMatchObject({ outcome: 'closed', code: 1008, reason: 'origin_required' });
  });

  it('rejects a no-Origin connection whose internal secret is wrong at the first byte', async () => {
    const wrong = `X${INTERNAL_SECRET.slice(1)}`;
    const result = await probeWs(server.port, { 'x-signaling-internal-secret': wrong });
    expect(result).toMatchObject({ outcome: 'closed', code: 1008, reason: 'origin_required' });
  });

  it('still admits an internal client presenting the correct secret', async () => {
    const result = await probeWs(server.port, { 'x-signaling-internal-secret': INTERNAL_SECRET });
    expect(result).toEqual({ outcome: 'open' });
  });

  it('is live but never ready while the pairing store is unreachable', async () => {
    const live = await fetch(`http://127.0.0.1:${server.port}/live`);
    expect(live.status).toBe(200);

    const ready = await fetch(`http://127.0.0.1:${server.port}/ready`);
    const body = (await ready.json()) as {
      status: string;
      checks: { database: { status: string } };
    };
    expect(ready.status).toBe(503);
    expect(body.status).toBe('not_ready');
    expect(body.checks.database.status).toBe('down');
  });
});

describe('WebSocket origin policy with a configured allow-list', () => {
  let server: RunningServer;

  beforeAll(async () => {
    server = await startServer({
      ALLOWED_ORIGINS: 'https://app.example',
      SIGNALING_INTERNAL_SECRET: INTERNAL_SECRET,
    });
  }, 40000);

  afterAll(() => server?.stop());

  it('admits an allow-listed origin', async () => {
    const result = await probeWs(server.port, { origin: 'https://app.example' });
    expect(result).toEqual({ outcome: 'open' });
  });

  it('rejects an origin that is not on the allow-list', async () => {
    const result = await probeWs(server.port, { origin: 'https://evil.example' });
    expect(result).toMatchObject({ outcome: 'closed', code: 1008, reason: 'forbidden_origin' });
  });
});

describe('internal secret comparison', () => {
  const source = readFileSync(resolve(serviceRoot, 'src/index.ts'), 'utf8');

  it('never compares the internal secret with a short-circuiting operator', () => {
    expect(source).not.toMatch(
      /internalSecret\s*[!=]==\s*(internalSecretExpected|SIGNALING_SECRET)/,
    );
    expect(source).not.toMatch(/[!=]==\s*SIGNALING_SECRET\b/);
  });

  it('routes the internal secret through the constant-time helper', () => {
    expect(source).toMatch(/constantTimeCompare\(internalSecret, internalSecretExpected\)/);
  });

  it('applies the rate limiter and blacklist before the secret is compared', () => {
    const blacklistAt = source.indexOf('wsRateLimiter.isBlacklisted(ip)');
    const rateLimitAt = source.indexOf('wsRateLimiter.checkConnection(ip)');
    const handshakeAt = source.indexOf('const handshake = evaluateWsHandshake({');
    expect(blacklistAt).toBeGreaterThan(-1);
    expect(rateLimitAt).toBeGreaterThan(-1);
    expect(handshakeAt).toBeGreaterThan(rateLimitAt);
    expect(rateLimitAt).toBeGreaterThan(blacklistAt);
  });
});

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const INTERNAL_SECRET = 'test-internal-secret-value';

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (typeof address === 'string' || address === null) {
        probe.close(() => reject(new Error('no port')));
        return;
      }
      const { port } = address;
      probe.close(() => resolvePort(port));
    });
  });
}

interface RunningServer {
  port: number;
  stop: () => void;
}

async function startServer(overrides: Record<string, string>): Promise<RunningServer> {
  const port = await freePort();
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  delete env['ALLOWED_ORIGINS'];
  delete env['TRUST_PROXY'];
  delete env['ADMIN_API_KEY'];
  delete env['SIGNALING_INTERNAL_SECRET'];
  Object.assign(
    env,
    {
      NODE_ENV: 'production',
      PORT: String(port),
      SIGNALING_PORT: String(port),
      SIGNALING_HOST: '127.0.0.1',
      SIGNALING_WS_PATH: '/ws',
      NEON_DATABASE_URL: 'postgresql://test:test@127.0.0.1:54321/test',
    },
    overrides,
  );

  const child: ChildProcessWithoutNullStreams = spawn(
    resolve(serviceRoot, 'node_modules/.bin/tsx'),
    ['src/index.ts'],
    { cwd: serviceRoot, env, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  child.stdout.on('data', () => {});

  const deadline = Date.now() + 20000;
  for (;;) {
    if (child.exitCode !== null) {
      throw new Error(`signaling server exited early (${child.exitCode}): ${stderr}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/ready`);
      if (response.status === 200) break;
    } catch {
      /* not listening yet */
    }
    if (Date.now() > deadline) {
      child.kill('SIGKILL');
      throw new Error(`signaling server never became ready: ${stderr}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  return { port, stop: () => child.kill('SIGKILL') };
}

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

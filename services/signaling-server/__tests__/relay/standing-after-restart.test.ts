import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PAIRING_STANDING_CONCURRENCY } from '../../src/constants.js';
import { logger } from '../../src/logger.js';
import { freshPairCredential, issuePairToken, withPairCredential } from '../../src/pair-token.js';
import { pairingReference } from '../../src/standing.js';
import {
  FakeStore,
  INTERNAL_SECRET,
  RAISED_LIMITS,
  RelayClient,
  createPairing,
  startInProcessRelay,
  type InProcessRelay,
} from './in-process.js';

const RECHECK_MS = 200;
const MAX_STALE_MS = 60_000;
const WEB_LATENCY_MS = 150;
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const store = new FakeStore();
const calls: Array<Array<{ code: string }>> = [];
let webAnswer: 200 | 401 | 503 = 200;
let inFlight = 0;
let peakInFlight = 0;
let web: Server;
let relay: InProcessRelay;
let accountSequence = 0;

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    request.on('end', () => resolve(body));
  });
}

beforeAll(async () => {
  web = createServer((request, response) => {
    inFlight += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);
    void readBody(request).then(async (body) => {
      await new Promise((resolve) => setTimeout(resolve, WEB_LATENCY_MS));
      inFlight -= 1;
      if (webAnswer !== 200) {
        response.writeHead(webAnswer).end();
        return;
      }
      const pairings = (JSON.parse(body) as { pairings: Array<{ code: string }> }).pairings;
      calls.push(pairings);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          results: pairings.map((pairing) => ({ code: pairing.code, standing: 'active' })),
        }),
      );
    });
  });
  await new Promise<void>((resolve) => web.listen(0, '127.0.0.1', resolve));
  const { port } = web.address() as AddressInfo;
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  relay = await startInProcessRelay(store, {
    ...RAISED_LIMITS,
    SIGNALING_STANDING_URL: `http://127.0.0.1:${port}/api/pair/standing`,
    SIGNALING_STANDING_RECHECK_MS: String(RECHECK_MS),
    SIGNALING_STANDING_MAX_STALE_MS: String(MAX_STALE_MS),
  });
});

afterAll(async () => {
  vi.useRealTimers();
  await new Promise<void>((resolve) => web.close(() => resolve()));
});

beforeEach(() => {
  webAnswer = 200;
  calls.length = 0;
  peakInFlight = 0;
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function nextAccount(): string {
  return `3c9f0a52-0000-4000-8000-${String(++accountSequence).padStart(12, '0')}`;
}

function randomCode(): string {
  return [...randomBytes(12)].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

function storedBeforeTheRestart(): { code: string; desktopToken: string } {
  const account = nextAccount();
  const code = randomCode();
  const createdAt = Date.now() - 10 * 60_000;
  const credential = freshPairCredential(null);
  store.rows.set(code, {
    code,
    created_at: createdAt,
    expires_at: createdAt + 24 * 60 * 60_000,
    metadata: withPairCredential({ userId: account }, 'desktop', credential),
  });
  const desktopToken = issuePairToken(INTERNAL_SECRET, {
    code,
    role: 'desktop',
    createdAt,
    accountId: account,
    ...credential,
  });
  return { code, desktopToken };
}

async function freshPairing(): Promise<{ code: string; desktopToken: string }> {
  const created = await createPairing(relay, { metadata: { userId: nextAccount() } });
  expect(created.status).toBe(200);
  return {
    code: String(created.json['code']),
    desktopToken: (created.json['pairTokens'] as { desktop: string }).desktop,
  };
}

function standingFailureLogs(): Array<Record<string, unknown>> {
  return vi
    .mocked(logger.warn)
    .mock.calls.filter((call) => call[1] === 'Pairing standing check failed')
    .map((call) => call[0] as unknown as Record<string, unknown>);
}

describe('pairings that reconnect after a relay restart', () => {
  it('admits a pairing made before the restart for the hold while the web app cannot answer', async () => {
    webAnswer = 503;
    const { code, desktopToken } = storedBeforeTheRestart();
    const desktop = await RelayClient.connect(relay.ws);
    try {
      desktop.send({ type: 'register', code, role: 'desktop', pairToken: desktopToken });
      expect(await desktop.frame('registered')).toMatchObject({ code, role: 'desktop' });
      expect(desktop.frames.some((frame) => frame['error'] === 'service_unavailable')).toBe(false);
    } finally {
      desktop.close();
    }
  });

  it('logs why the web app could not answer without the pairing code or any secret', async () => {
    webAnswer = 401;
    const { code, desktopToken } = await freshPairing();
    await sleep(RECHECK_MS + 50);
    const desktop = await RelayClient.connect(relay.ws);
    try {
      desktop.send({ type: 'register', code, role: 'desktop', pairToken: desktopToken });
      await desktop.frame('registered');
      const logged = standingFailureLogs();
      expect(logged).toHaveLength(1);
      expect(logged[0]).toMatchObject({
        reason: 'client_error',
        status: 401,
        pairings: [pairingReference(code)],
      });
      const written = JSON.stringify(logged[0]);
      expect(written).not.toContain(code);
      expect(written).not.toContain(INTERNAL_SECRET);
      expect(written).not.toContain(desktopToken);
    } finally {
      desktop.close();
    }
  });

  it('asks the web app in a few bounded batches when many pairings reconnect at once', async () => {
    const pairings = await Promise.all(Array.from({ length: 8 }, () => freshPairing()));
    await sleep(RECHECK_MS + 50);
    calls.length = 0;
    peakInFlight = 0;

    const desktops = await Promise.all(pairings.map(() => RelayClient.connect(relay.ws)));
    try {
      pairings.forEach(({ code, desktopToken }, index) => {
        desktops[index]!.send({ type: 'register', code, role: 'desktop', pairToken: desktopToken });
      });
      await Promise.all(desktops.map((desktop) => desktop.frame('registered', 5_000)));

      expect(calls.length).toBeLessThanOrEqual(3);
      expect(peakInFlight).toBeLessThanOrEqual(PAIRING_STANDING_CONCURRENCY);
      expect(
        calls
          .flat()
          .map((entry) => entry.code)
          .sort(),
      ).toEqual(pairings.map((pairing) => pairing.code).sort());
    } finally {
      for (const desktop of desktops) desktop.close();
    }
  });
});

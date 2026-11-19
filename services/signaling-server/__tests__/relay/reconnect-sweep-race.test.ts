import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SESSION_CLEANUP_INTERVAL_MS,
  STALE_SESSION_HEARTBEAT_THRESHOLD_MS,
} from '../../src/constants.js';
import {
  FakeStore,
  INTERNAL_SECRET,
  RAISED_LIMITS,
  RelayClient,
  createPairing,
  startInProcessRelay,
  type InProcessRelay,
} from './in-process.js';

const IDLE_MS = STALE_SESSION_HEARTBEAT_THRESHOLD_MS + 60_000;

const store = new FakeStore();
let web: Server;
let relay: InProcessRelay;
let accountSequence = 0;
let gate: Promise<void> | null = null;
let asked: (() => void) | null = null;

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
    void readBody(request).then(async (body) => {
      asked?.();
      await gate;
      const pairings = (JSON.parse(body) as { pairings: Array<{ code: string }> }).pairings;
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
  vi.useFakeTimers({
    toFake: ['setInterval', 'clearInterval', 'Date'],
    shouldAdvanceTime: true,
  });
  relay = await startInProcessRelay(store, {
    ...RAISED_LIMITS,
    SIGNALING_STANDING_URL: `http://127.0.0.1:${port}/api/pair/standing`,
    SIGNALING_STANDING_RECHECK_MS: '1000',
  });
});

afterAll(async () => {
  vi.useRealTimers();
  await new Promise<void>((resolve) => web.close(() => resolve()));
});

beforeEach(() => {
  gate = null;
  asked = null;
});

async function idlePairing() {
  const account = `5b2e9d10-0000-4000-8000-${String(++accountSequence).padStart(12, '0')}`;
  const created = await createPairing(relay, { metadata: { userId: account } });
  expect(created.status).toBe(200);
  const code = String(created.json['code']);
  const desktopToken = (created.json['pairTokens'] as { desktop: string }).desktop;
  const claimed = await fetch(`${relay.http}/pairings/${code}/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${INTERNAL_SECRET}` },
    body: JSON.stringify({ role: 'mobile', accountId: account }),
  });
  const claimToken = String(((await claimed.json()) as { pairToken: string }).pairToken);

  const desktop = await RelayClient.connect(relay.ws);
  desktop.send({ type: 'register', code, role: 'desktop', pairToken: desktopToken });
  await desktop.frame('registered');
  const mobile = await RelayClient.connect(relay.ws);
  mobile.send({ type: 'register', code, role: 'mobile', pairToken: claimToken });
  const mobileToken = String((await mobile.frame('registered'))['pairToken']);
  await mobile.frame('peer_ready');
  await desktop.frame('peer_ready');
  desktop.close();
  mobile.close();
  await new Promise((resolve) => setTimeout(resolve, 150));
  return { code, mobileToken };
}

function holdTheWebApp(): { arrived: Promise<void>; release: () => void } {
  let release = () => {};
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const arrived = new Promise<void>((resolve) => {
    asked = resolve;
  });
  return { arrived, release };
}

describe('a reconnect that races the stale-session sweep', () => {
  it('registers a pairing that sat idle past the stale threshold when a sweep runs during admission', async () => {
    const { code, mobileToken } = await idlePairing();
    vi.setSystemTime(Date.now() + IDLE_MS);
    const web = holdTheWebApp();
    const phone = await RelayClient.connect(relay.ws);
    try {
      phone.send({ type: 'register', code, role: 'mobile', pairToken: mobileToken });
      await web.arrived;

      vi.advanceTimersByTime(SESSION_CLEANUP_INTERVAL_MS);
      web.release();

      expect(await phone.frame('registered')).toMatchObject({ code, role: 'mobile' });
      expect(phone.frames.some((frame) => frame['error'] === 'pairing_not_found')).toBe(false);
      expect(store.rows.has(code)).toBe(true);
    } finally {
      phone.close();
    }
  });

  it('asks the phone to retry, never to pair again, when the session was swept during admission', async () => {
    const { code, mobileToken } = await idlePairing();
    vi.setSystemTime(Date.now() + IDLE_MS);
    const web = holdTheWebApp();
    const phone = await RelayClient.connect(relay.ws);
    let retry: RelayClient | null = null;
    try {
      phone.send({ type: 'register', code, role: 'mobile', pairToken: mobileToken });
      await web.arrived;

      vi.setSystemTime(Date.now() + IDLE_MS);
      phone.socket.pong();
      await new Promise((resolve) => setTimeout(resolve, 100));
      vi.advanceTimersByTime(SESSION_CLEANUP_INTERVAL_MS);
      web.release();

      expect(await phone.frame('error')).toMatchObject({ error: 'service_unavailable' });
      expect((await phone.closure()).code).toBe(1013);
      expect(phone.frames.some((frame) => frame['error'] === 'pairing_not_found')).toBe(false);
      expect(store.rows.has(code)).toBe(true);

      gate = null;
      retry = await RelayClient.connect(relay.ws);
      retry.send({ type: 'register', code, role: 'mobile', pairToken: mobileToken });
      expect(await retry.frame('registered')).toMatchObject({ code, role: 'mobile' });
    } finally {
      phone.close();
      retry?.close();
    }
  });
});

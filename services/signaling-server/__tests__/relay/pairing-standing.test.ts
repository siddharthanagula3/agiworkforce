import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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
const MAX_STALE_MS = 1_000;
const MAX_LIFETIME_MS = 600_000;
const DESKTOP = 'd0c50204-7477-43b7-a323-a0d026e23c88';

interface StandingCall {
  authorization: string | undefined;
  pairings: Array<{ code: string; userId: string; deviceIds: string[]; workspace: string | null }>;
}

const store = new FakeStore();
const verdicts = new Map<string, 'active' | 'ended' | 'unknown'>();
const calls: StandingCall[] = [];
let webDown = false;
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
    void readBody(request).then((body) => {
      if (webDown) {
        response.writeHead(503).end();
        return;
      }
      const parsed = JSON.parse(body) as StandingCall;
      calls.push({ authorization: request.headers.authorization, pairings: parsed.pairings });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          results: parsed.pairings.map((pairing) => ({
            code: pairing.code,
            standing: verdicts.get(pairing.code) ?? 'active',
          })),
        }),
      );
    });
  });
  await new Promise<void>((resolve) => web.listen(0, '127.0.0.1', resolve));
  const { port } = web.address() as AddressInfo;
  relay = await startInProcessRelay(store, {
    ...RAISED_LIMITS,
    SIGNALING_STANDING_URL: `http://127.0.0.1:${port}/api/pair/standing`,
    SIGNALING_STANDING_RECHECK_MS: String(RECHECK_MS),
    SIGNALING_STANDING_MAX_STALE_MS: String(MAX_STALE_MS),
    SIGNALING_PAIRING_MAX_LIFETIME_MS: String(MAX_LIFETIME_MS),
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => web.close(() => resolve()));
});

beforeEach(() => {
  webDown = false;
  calls.length = 0;
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function pairing() {
  const account = `standing-account-${++accountSequence}`;
  const created = await createPairing(relay, {
    initiator: 'desktop',
    device: { role: 'desktop', id: DESKTOP },
    metadata: { userId: account, workspaceSelector: 'personal' },
  });
  expect(created.status).toBe(200);
  const code = String(created.json['code']);
  const desktopToken = (created.json['pairTokens'] as { desktop: string }).desktop;
  return { account, code, desktopToken };
}

async function claimMobile(code: string, account: string): Promise<string> {
  const claimed = await fetch(`${relay.http}/pairings/${code}/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${INTERNAL_SECRET}` },
    body: JSON.stringify({ role: 'mobile', accountId: account }),
  });
  expect(claimed.status).toBe(200);
  return String(((await claimed.json()) as { pairToken: string }).pairToken);
}

async function paired() {
  const { account, code, desktopToken } = await pairing();
  const mobileToken = await claimMobile(code, account);
  const desktop = await RelayClient.connect(relay.ws);
  desktop.send({ type: 'register', code, role: 'desktop', pairToken: desktopToken });
  await desktop.frame('registered');
  const mobile = await RelayClient.connect(relay.ws);
  mobile.send({ type: 'register', code, role: 'mobile', pairToken: mobileToken });
  await mobile.frame('peer_ready');
  await desktop.frame('peer_ready');
  return { account, code, desktop, mobile };
}

function control() {
  return {
    type: 'signal',
    kind: 'control',
    payload: { action: 'heartbeat', data: { timestamp: Date.now() } },
  };
}

describe('a live pairing the account may no longer hold', () => {
  it('ends at message time once the web app says the pairing is no longer allowed', async () => {
    const { account, code, desktop, mobile } = await paired();
    try {
      verdicts.set(code, 'ended');
      await sleep(RECHECK_MS + 50);
      desktop.send(control());

      await desktop.frame('terminated');
      await mobile.frame('terminated');
      await desktop.closure();
      await mobile.closure();
      expect(store.rows.has(code)).toBe(false);

      const asked = calls.flatMap((call) => call.pairings).find((entry) => entry.code === code);
      expect(asked).toMatchObject({ userId: account, workspace: 'personal' });
      expect(asked?.deviceIds).toContain(DESKTOP);
      expect(calls.every((call) => call.authorization === `Bearer ${INTERNAL_SECRET}`)).toBe(true);
    } finally {
      desktop.close();
      mobile.close();
    }
  });

  it('refuses a reconnect once the pairing is no longer allowed', async () => {
    const { code, desktopToken } = await pairing();
    verdicts.set(code, 'ended');
    await sleep(RECHECK_MS + 50);
    const desktop = await RelayClient.connect(relay.ws);
    try {
      desktop.send({ type: 'register', code, role: 'desktop', pairToken: desktopToken });
      expect(await desktop.frame('error')).toMatchObject({ error: 'pairing_not_found' });
      expect(desktop.frames.some((frame) => frame['type'] === 'registered')).toBe(false);
      expect(store.rows.has(code)).toBe(false);
    } finally {
      desktop.close();
    }
  });

  it('defers a reconnect, without ending the pairing, while the web app cannot answer', async () => {
    const { code, desktopToken } = await pairing();
    webDown = true;
    await sleep(MAX_STALE_MS + 100);
    const desktop = await RelayClient.connect(relay.ws);
    try {
      desktop.send({ type: 'register', code, role: 'desktop', pairToken: desktopToken });
      expect(await desktop.frame('error')).toMatchObject({ error: 'service_unavailable' });
      expect((await desktop.closure()).code).toBe(1013);
      expect(store.rows.has(code)).toBe(true);
    } finally {
      desktop.close();
    }

    webDown = false;
    const retry = await RelayClient.connect(relay.ws);
    try {
      retry.send({ type: 'register', code, role: 'desktop', pairToken: desktopToken });
      expect(await retry.frame('registered')).toMatchObject({ code, role: 'desktop' });
    } finally {
      retry.close();
    }
  });
});

describe('the lifetime of a pairing', () => {
  it('never extends past the maximum lifetime measured from creation', async () => {
    const { code, desktop, mobile } = await paired();
    try {
      const row = store.rows.get(code);
      expect(row).toBeDefined();
      expect(row!.expires_at).toBeLessThanOrEqual(row!.created_at + MAX_LIFETIME_MS);
      expect(row!.expires_at).toBeGreaterThan(Date.now());
    } finally {
      desktop.close();
      mobile.close();
    }
  });
});

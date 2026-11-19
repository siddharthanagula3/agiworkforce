import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  EXPIRED_PAIRING_PRUNE_GRACE_MS,
  SESSION_CLEANUP_INTERVAL_MS,
} from '../../src/constants.js';
import * as db from '../../src/db.js';
import {
  FakeStore,
  INTERNAL_SECRET,
  RelayClient,
  createPairing,
  startInProcessRelay,
  type InProcessRelay,
} from './in-process.js';

const HOUR_MS = 60 * 60_000;
const STORE_DOWN = { message: 'store unavailable', code: '08006' };

const store = new FakeStore();
let relay: InProcessRelay;
let accountSequence = 0;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  relay = await startInProcessRelay(store);
});

afterAll(() => {
  vi.useRealTimers();
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

async function sweep(): Promise<void> {
  vi.advanceTimersByTime(SESSION_CLEANUP_INTERVAL_MS);
  await settle();
}

async function paired() {
  const account = `7d1e2c40-0000-4000-8000-${String(++accountSequence).padStart(12, '0')}`;
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
  await settle();
  return { code, desktop, mobile, mobileToken };
}

function ended(client: RelayClient): boolean {
  return client.frames.some(
    (frame) => frame['type'] === 'terminated' || frame['type'] === 'session_expired',
  );
}

describe('a live pairing whose expiry the store refused to save', () => {
  it('is neither pruned nor ended once its saved expiry is an hour past', async () => {
    vi.mocked(db.extendSessionExpiry).mockImplementation(() =>
      Promise.resolve({ error: STORE_DOWN }),
    );
    const { code, desktop, mobile } = await paired();
    try {
      const row = store.rows.get(code);
      expect(row).toBeDefined();
      expect(row!.expires_at).toBeLessThan(Date.now() + HOUR_MS);
      row!.expires_at = Date.now() - EXPIRED_PAIRING_PRUNE_GRACE_MS - 60_000;

      await sweep();
      await sweep();

      expect(store.rows.has(code)).toBe(true);
      expect(ended(desktop)).toBe(false);
      expect(ended(mobile)).toBe(false);
      expect(desktop.closed).toBeNull();
      expect(mobile.closed).toBeNull();
    } finally {
      store.install();
      desktop.close();
      mobile.close();
    }
  });

  it('saves the expiry on the next sweep after one failed write', async () => {
    vi.mocked(db.extendSessionExpiry).mockImplementationOnce(() =>
      Promise.resolve({ error: STORE_DOWN }),
    );
    const { code, desktop, mobile } = await paired();
    try {
      const row = store.rows.get(code);
      expect(row!.expires_at).toBeLessThan(Date.now() + HOUR_MS);

      await sweep();

      expect(row!.expires_at).toBeGreaterThan(Date.now() + 23 * HOUR_MS);
      expect(desktop.closed).toBeNull();
      expect(mobile.closed).toBeNull();
    } finally {
      desktop.close();
      mobile.close();
    }
  });

  it('saves a lagging expiry before rotating the credential of a reconnecting phone', async () => {
    vi.mocked(db.extendSessionExpiry).mockImplementationOnce(() =>
      Promise.resolve({ error: STORE_DOWN }),
    );
    const { code, desktop, mobile, mobileToken } = await paired();
    const row = store.rows.get(code);
    row!.expires_at = Date.now() - 1;
    const phone = await RelayClient.connect(relay.ws);
    try {
      phone.send({ type: 'register', code, role: 'mobile', pairToken: mobileToken });
      expect(await phone.frame('registered')).toMatchObject({ code, role: 'mobile' });
      expect(row!.expires_at).toBeGreaterThan(Date.now() + 23 * HOUR_MS);
    } finally {
      phone.close();
      desktop.close();
      mobile.close();
    }
  });

  it('defers a reconnecting phone, without ending the pairing, while the lapsed expiry cannot be saved', async () => {
    vi.mocked(db.extendSessionExpiry).mockImplementation(() =>
      Promise.resolve({ error: STORE_DOWN }),
    );
    const { code, desktop, mobile, mobileToken } = await paired();
    const row = store.rows.get(code);
    row!.expires_at = Date.now() - 1;
    const phone = await RelayClient.connect(relay.ws);
    try {
      phone.send({ type: 'register', code, role: 'mobile', pairToken: mobileToken });
      expect(await phone.frame('error')).toMatchObject({ error: 'service_unavailable' });
      expect((await phone.closure()).code).toBe(1013);
      expect(store.rows.has(code)).toBe(true);

      store.install();
      const retry = await RelayClient.connect(relay.ws);
      try {
        retry.send({ type: 'register', code, role: 'mobile', pairToken: mobileToken });
        expect(await retry.frame('registered')).toMatchObject({ code, role: 'mobile' });
      } finally {
        retry.close();
      }
    } finally {
      store.install();
      phone.close();
      desktop.close();
      mobile.close();
    }
  });
});

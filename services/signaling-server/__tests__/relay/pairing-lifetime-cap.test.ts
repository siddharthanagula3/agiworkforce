import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { PAIRING_MAX_LIFETIME_MS_DEFAULT } from '../../src/constants.js';
import { logger } from '../../src/logger.js';
import {
  FakeStore,
  INTERNAL_SECRET,
  RAISED_LIMITS,
  RelayClient,
  createPairing,
  startInProcessRelay,
  type InProcessRelay,
} from './in-process.js';

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
const REQUESTED_MS = 8 * DAY_MS;

const store = new FakeStore();
let relay: InProcessRelay;
let startupWarnings: unknown[][] = [];

beforeAll(async () => {
  vi.useFakeTimers({
    toFake: ['setInterval', 'clearInterval', 'Date'],
    shouldAdvanceTime: true,
  });
  relay = await startInProcessRelay(store, {
    ...RAISED_LIMITS,
    SIGNALING_PAIRING_MAX_LIFETIME_MS: String(REQUESTED_MS),
  });
  startupWarnings = [...vi.mocked(logger.warn).mock.calls];
});

afterAll(() => {
  vi.useRealTimers();
});

describe('SIGNALING_PAIRING_MAX_LIFETIME_MS above the default maximum', () => {
  it('is ignored with one startup warning that carries no secret', () => {
    const ignored = startupWarnings.filter(
      (call) =>
        typeof call[1] === 'string' && call[1].includes('SIGNALING_PAIRING_MAX_LIFETIME_MS'),
    );
    expect(ignored).toHaveLength(1);
    expect(ignored[0]![0]).toEqual({
      requestedMs: REQUESTED_MS,
      maximumMs: PAIRING_MAX_LIFETIME_MS_DEFAULT,
    });
    expect(JSON.stringify(ignored[0])).not.toContain(INTERNAL_SECRET);
  });

  it('keeps every renewal of a pairing within the default maximum from creation', async () => {
    const account = '8c4a1f70-0000-4000-8000-000000000001';
    const created = await createPairing(relay, { metadata: { userId: account } });
    expect(created.status).toBe(200);
    const code = String(created.json['code']);
    let desktopToken = (created.json['pairTokens'] as { desktop: string }).desktop;
    const claimed = await fetch(`${relay.http}/pairings/${code}/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${INTERNAL_SECRET}` },
      body: JSON.stringify({ role: 'mobile', accountId: account }),
    });
    let mobileToken = String(((await claimed.json()) as { pairToken: string }).pairToken);

    const row = store.rows.get(code);
    expect(row).toBeDefined();
    const createdAt = row!.created_at;

    for (let day = 0; day <= 7; day++) {
      const desktop = await RelayClient.connect(relay.ws);
      desktop.send({ type: 'register', code, role: 'desktop', pairToken: desktopToken });
      desktopToken = String((await desktop.frame('registered'))['pairToken']);
      const mobile = await RelayClient.connect(relay.ws);
      mobile.send({ type: 'register', code, role: 'mobile', pairToken: mobileToken });
      mobileToken = String((await mobile.frame('registered'))['pairToken']);
      await mobile.frame('peer_ready');
      await new Promise((resolve) => setTimeout(resolve, 100));
      desktop.close();
      mobile.close();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(row!.expires_at).toBeLessThanOrEqual(createdAt + PAIRING_MAX_LIFETIME_MS_DEFAULT);
      vi.setSystemTime(Date.now() + 23 * HOUR_MS);
    }

    expect(row!.expires_at).toBe(createdAt + PAIRING_MAX_LIFETIME_MS_DEFAULT);
  });
});

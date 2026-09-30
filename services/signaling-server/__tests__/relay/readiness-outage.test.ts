import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DB_CHECK_TTL_MS } from '../../src/constants.js';
import {
  FakeStore,
  INTERNAL_SECRET,
  RelayClient,
  createPairing,
  startInProcessRelay,
  type InProcessRelay,
} from './in-process.js';

const store = new FakeStore();
let relay: InProcessRelay;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  relay = await startInProcessRelay(store);
});
afterAll(() => {
  store.failing = false;
  vi.useRealTimers();
});

describe('readiness while existing sockets are connected', () => {
  it('refuses new routing during a store outage while existing peers still exchange frames', async () => {
    const created = await createPairing(relay, {
      metadata: { userId: '5b0c1a7e-0000-4000-8000-0000000000aa' },
    });
    expect(created.status).toBe(200);
    const code = String(created.json['code']);
    const tokens = created.json['pairTokens'] as { desktop: string };
    const claim = await fetch(`${relay.http}/pairings/${code}/claim`, {
      method: 'POST',
      headers: { authorization: `Bearer ${INTERNAL_SECRET}`, 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'mobile', accountId: '5b0c1a7e-0000-4000-8000-0000000000aa' }),
    });
    expect(claim.status).toBe(200);
    const mobileToken = (await claim.json()).pairToken;
    const desktop = await RelayClient.connect(relay.ws);
    const mobile = await RelayClient.connect(relay.ws);
    try {
      desktop.send({ type: 'register', code, role: 'desktop', pairToken: tokens.desktop });
      mobile.send({ type: 'register', code, role: 'mobile', pairToken: mobileToken });
      await desktop.frame('registered');
      await mobile.frame('registered');
      const clock = Date.now();
      vi.setSystemTime(clock + DB_CHECK_TTL_MS + 1);
      store.failing = true;
      expect((await fetch(`${relay.http}/ready`)).status).toBe(503);
      const sdp = 'v=0\r\na=outage-continuity-fixture\r\n';
      desktop.send({ type: 'signal', kind: 'offer', payload: { type: 'offer', sdp } });
      expect(await mobile.frame('signal')).toMatchObject({ kind: 'offer', payload: { sdp } });
      expect(desktop.closed).toBeNull();
      expect(mobile.closed).toBeNull();
    } finally {
      desktop.close();
      mobile.close();
    }
  });
});

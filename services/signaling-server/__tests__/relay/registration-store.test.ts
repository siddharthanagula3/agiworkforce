import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  FakeStore,
  RelayClient,
  createPairing,
  startInProcessRelay,
  type InProcessRelay,
} from './in-process.js';

const ACCOUNT = '5b0c1a7e-0000-4000-8000-0000000000aa';

const store = new FakeStore();
let relay: InProcessRelay;

beforeAll(async () => {
  relay = await startInProcessRelay(store);
});

afterEach(() => {
  store.failing = false;
  store.stalled = false;
});

async function pairing(): Promise<{ code: string; desktopToken: string }> {
  const created = await createPairing(relay, { metadata: { userId: ACCOUNT } });
  expect(created.status).toBe(200);
  const tokens = created.json['pairTokens'] as { desktop: string };
  return { code: String(created.json['code']), desktopToken: tokens.desktop };
}

describe('registration while the pairing store is unavailable', () => {
  it('refuses retryably instead of calling a live pairing missing', async () => {
    const { code, desktopToken } = await pairing();
    store.failing = true;

    const client = await RelayClient.connect(relay.ws);
    client.send({ type: 'register', code, role: 'desktop', pairToken: desktopToken });

    expect(await client.frame('error')).toEqual({ type: 'error', error: 'service_unavailable' });
    expect(await client.closure()).toEqual({ code: 1013, reason: 'try_again_later' });
    expect(client.frames.some((frame) => frame['error'] === 'pairing_not_found')).toBe(false);
  });

  it('still registers the same pairing once the store answers again', async () => {
    const { code, desktopToken } = await pairing();
    store.failing = true;
    const refused = await RelayClient.connect(relay.ws);
    refused.send({ type: 'register', code, role: 'desktop', pairToken: desktopToken });
    await refused.closure();

    store.failing = false;
    const client = await RelayClient.connect(relay.ws);
    client.send({ type: 'register', code, role: 'desktop', pairToken: desktopToken });
    expect(await client.frame('registered')).toMatchObject({ type: 'registered', role: 'desktop' });
    client.close();
  });

  it('keeps serving after a lookup fails', async () => {
    const { code, desktopToken } = await pairing();
    store.failing = true;
    const client = await RelayClient.connect(relay.ws);
    client.send({ type: 'register', code, role: 'desktop', pairToken: desktopToken });
    await client.closure();

    const live = await fetch(`${relay.http}/live`);
    expect(live.status).toBe(200);
  });
});

describe('registration against a pairing the store does not hold', () => {
  it('reports a missing pairing as not found', async () => {
    const client = await RelayClient.connect(relay.ws);
    client.send({
      type: 'register',
      code: 'ZZZZ9999YYYY',
      role: 'desktop',
      pairToken: 'ab'.repeat(32),
    });
    expect(await client.frame('error')).toEqual({ type: 'error', error: 'pairing_not_found' });
    await client.closure();
  });

  it('reports an expired pairing as expired', async () => {
    const { code, desktopToken } = await pairing();
    const row = store.rows.get(code);
    if (!row) throw new Error('pairing was not stored');
    row.expires_at = Date.now() - 1_000;

    const client = await RelayClient.connect(relay.ws);
    client.send({ type: 'register', code, role: 'desktop', pairToken: desktopToken });
    expect(await client.frame('error')).toEqual({ type: 'error', error: 'pairing_expired' });
    await client.closure();
  });
});

describe('HTTP pairing lookups while the store is unavailable', () => {
  it('answers 503 rather than a not-found the web would show as a wrong code', async () => {
    const { code } = await pairing();
    store.failing = true;

    const lookup = await fetch(`${relay.http}/pairings/${code}`);
    expect(lookup.status).toBe(503);
    expect(await lookup.json()).toEqual({ error: 'persistence_unavailable' });

    const claim = await fetch(`${relay.http}/pairings/${code}/claim`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env['SIGNALING_INTERNAL_SECRET']}`,
      },
      body: JSON.stringify({ role: 'mobile', accountId: ACCOUNT }),
    });
    expect(claim.status).toBe(503);
    expect(await claim.json()).toEqual({ error: 'persistence_unavailable' });
  });
});

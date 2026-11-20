import { beforeAll, describe, expect, it } from 'vitest';

import { MAX_JSON_NESTING_DEPTH, MAX_METADATA_SIZE_BYTES } from '../../src/constants.js';
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
let accountSequence = 0;

const PAIRING_BODY_LIMIT_BYTES = 16 * 1024;
const DEPTH = 31_000;
const deepArrays = `${'['.repeat(DEPTH)}${']'.repeat(DEPTH)}`;

const DEEPEST_METADATA_DEPTH_UNDER_BODY_LIMIT = Math.floor(
  (PAIRING_BODY_LIMIT_BYTES - 1 - '{"metadata":{"k":}}'.length) / 2,
);
const deepestMetadata = `{"k":${'['.repeat(DEEPEST_METADATA_DEPTH_UNDER_BODY_LIMIT)}${']'.repeat(DEEPEST_METADATA_DEPTH_UNDER_BODY_LIMIT)}}`;
const stringifyOverflowsUnderBodyLimit = ((): boolean => {
  try {
    JSON.stringify(JSON.parse(deepestMetadata));
    return false;
  } catch (error) {
    if (error instanceof RangeError) return true;
    throw error;
  }
})();

beforeAll(async () => {
  relay = await startInProcessRelay(store);
});

async function pair(): Promise<{ code: string; desktop: RelayClient; mobile: RelayClient }> {
  const account = `7d2c1a7e-0000-4000-8000-${String(++accountSequence).padStart(12, '0')}`;
  const created = await createPairing(relay, { metadata: { userId: account } });
  const code = String(created.json['code']);
  const desktopToken = (created.json['pairTokens'] as { desktop: string }).desktop;
  const claimed = await fetch(`${relay.http}/pairings/${code}/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${INTERNAL_SECRET}` },
    body: JSON.stringify({ role: 'mobile', accountId: account }),
  });
  const mobileToken = String(((await claimed.json()) as { pairToken: string }).pairToken);

  const desktop = await RelayClient.connect(relay.ws);
  desktop.send({ type: 'register', code, role: 'desktop', pairToken: desktopToken });
  await desktop.frame('registered');
  const mobile = await RelayClient.connect(relay.ws);
  mobile.send({ type: 'register', code, role: 'mobile', pairToken: mobileToken });
  await mobile.frame('peer_ready');
  await desktop.frame('peer_ready');
  return { code, desktop, mobile };
}

async function relayIsUp(): Promise<boolean> {
  return (await fetch(`${relay.http}/live`)).status === 200;
}

describe('frames nested past what the relay can measure', () => {
  it('answers a pre-registration frame with a deeply nested metadata value and closes only that socket', async () => {
    const bystander = await pair();
    const attacker = await RelayClient.connect(relay.ws);

    attacker.socket.send(
      `{"type":"register","code":"ABCDEFGHJK23","role":"desktop","metadata":{"k":${deepArrays}}}`,
    );

    expect((await attacker.frame('error'))['error']).toBe('invalid_message');
    expect((await attacker.closure()).code).toBe(1008);
    expect(await relayIsUp()).toBe(true);

    bystander.desktop.send({
      type: 'signal',
      kind: 'control',
      payload: { action: 'heartbeat', data: { n: 1 } },
    });
    expect((await bystander.mobile.frame('signal'))['payload']).toEqual({
      action: 'heartbeat',
      data: { n: 1 },
    });
    expect(bystander.desktop.closed).toBeNull();
    expect(bystander.mobile.closed).toBeNull();
    bystander.desktop.close();
    bystander.mobile.close();
    attacker.close();
  });

  it('answers a control signal with a deeply nested data value and closes only the sender', async () => {
    const victim = await pair();
    const bystander = await pair();

    victim.desktop.socket.send(
      `{"type":"signal","kind":"control","payload":{"action":"heartbeat","data":{"k":${deepArrays}}}}`,
    );

    expect((await victim.desktop.frame('error'))['error']).toBe('invalid_message');
    expect((await victim.desktop.closure()).code).toBe(1008);
    expect(await relayIsUp()).toBe(true);

    bystander.mobile.send({
      type: 'signal',
      kind: 'control',
      payload: { action: 'heartbeat', data: { n: 2 } },
    });
    expect((await bystander.desktop.frame('signal'))['payload']).toEqual({
      action: 'heartbeat',
      data: { n: 2 },
    });
    expect(bystander.desktop.closed).toBeNull();
    for (const client of [victim.desktop, victim.mobile, bystander.desktop, bystander.mobile]) {
      client.close();
    }
  });

  it('refuses metadata nested past what JSON.stringify can measure with a validation error', async ({
    skip,
  }) => {
    skip(
      !stringifyOverflowsUnderBodyLimit,
      `JSON.stringify on this runtime serializes ${DEEPEST_METADATA_DEPTH_UNDER_BODY_LIMIT} levels, the deepest metadata under the ${PAIRING_BODY_LIMIT_BYTES}-byte body limit, so the stringify overflow cannot be reached through POST /pairings here; the depth-cap case covers the guard`,
    );
    const body = `{"metadata":${deepestMetadata}}`;
    expect(Buffer.byteLength(body)).toBeLessThan(PAIRING_BODY_LIMIT_BYTES);

    const response = await fetch(`${relay.http}/pairings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${INTERNAL_SECRET}` },
      body,
    });

    expect(response.status).toBe(400);
    const refusal = (await response.json()) as {
      error: { properties?: { metadata?: { errors: string[] } } };
    };
    expect(refusal.error.properties?.metadata?.errors).toContain(
      `Metadata size exceeds ${MAX_METADATA_SIZE_BYTES} bytes`,
    );
    expect(await relayIsUp()).toBe(true);
  });

  it('refuses metadata nested past the depth cap even when it is tiny and serializable', async () => {
    const depth = MAX_JSON_NESTING_DEPTH + 8;
    const account = `7d2c1a7e-0000-4000-8000-${String(++accountSequence).padStart(12, '0')}`;
    const metadata = `{"userId":"${account}","k":${'['.repeat(depth)}${']'.repeat(depth)}}`;
    const body = `{"metadata":${metadata}}`;
    expect(JSON.stringify(JSON.parse(metadata)).length).toBeLessThan(MAX_METADATA_SIZE_BYTES);

    const response = await fetch(`${relay.http}/pairings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${INTERNAL_SECRET}` },
      body,
    });

    expect(response.status).toBe(400);
    const refusal = (await response.json()) as {
      error: { properties?: { metadata?: { errors: string[] } } };
    };
    expect(refusal.error.properties?.metadata?.errors).toContain(
      `Metadata size exceeds ${MAX_METADATA_SIZE_BYTES} bytes`,
    );
  });

  it('still accepts ordinary register and control frames', async () => {
    const { desktop, mobile } = await pair();
    desktop.send({
      type: 'signal',
      kind: 'control',
      payload: {
        action: 'code.session.snapshot',
        data: { v: 3, payload: { a: { b: { c: ['x', { d: 'y'.repeat(20_000) }] } } } },
      },
    });
    const forwarded = await mobile.frame('signal');
    expect((forwarded['payload'] as { action: string }).action).toBe('code.session.snapshot');
    expect(desktop.closed).toBeNull();
    desktop.close();
    mobile.close();
  });
});

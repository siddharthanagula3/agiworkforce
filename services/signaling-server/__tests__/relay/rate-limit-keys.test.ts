import { beforeAll, describe, expect, it } from 'vitest';

import { RATE_LIMIT_PAIRING_CLAIM, RATE_LIMIT_PAIRING_CREATE } from '../../src/constants.js';
import {
  FakeStore,
  INTERNAL_SECRET,
  createPairing,
  startInProcessRelay,
  type InProcessRelay,
} from './in-process.js';

const ACCOUNT_A = '5b0c1a7e-0000-4000-8000-0000000000a1';
const ACCOUNT_B = '5b0c1a7e-0000-4000-8000-0000000000b2';
const ACCOUNT_C = '5b0c1a7e-0000-4000-8000-0000000000c3';

const store = new FakeStore();
let relay: InProcessRelay;

beforeAll(async () => {
  relay = await startInProcessRelay(store);
});

function claim(code: string, accountId: string, bearer = INTERNAL_SECRET): Promise<Response> {
  return fetch(`${relay.http}/pairings/${code}/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
    body: JSON.stringify({ role: 'mobile', accountId }),
  });
}

describe('pairing limits behind the shared web egress', () => {
  it('limits pairing creation per account, not per calling address', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt <= RATE_LIMIT_PAIRING_CREATE; attempt++) {
      statuses.push((await createPairing(relay, { metadata: { userId: ACCOUNT_A } })).status);
    }
    expect(statuses.slice(0, RATE_LIMIT_PAIRING_CREATE).every((status) => status === 200)).toBe(
      true,
    );
    expect(statuses[RATE_LIMIT_PAIRING_CREATE]).toBe(429);

    const other = await createPairing(relay, { metadata: { userId: ACCOUNT_B } });
    expect(other.status).toBe(200);
  });

  it('limits claims per claiming account', async () => {
    const created = await createPairing(relay, { metadata: { userId: ACCOUNT_C } });
    const code = String(created.json['code']);
    const statuses: number[] = [];
    for (let attempt = 0; attempt <= RATE_LIMIT_PAIRING_CLAIM; attempt++) {
      statuses.push((await claim(code, ACCOUNT_C)).status);
    }
    expect(statuses.slice(0, RATE_LIMIT_PAIRING_CLAIM).every((status) => status === 200)).toBe(
      true,
    );
    expect(statuses[RATE_LIMIT_PAIRING_CLAIM]).toBe(429);

    expect((await claim(code, ACCOUNT_B)).status).toBe(403);
  });

  it('keys callers without the internal secret by address, apart from every account', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt <= RATE_LIMIT_PAIRING_CREATE; attempt++) {
      const response = await fetch(`${relay.http}/pairings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer wrong' },
        body: JSON.stringify({ metadata: { userId: ACCOUNT_B } }),
      });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, RATE_LIMIT_PAIRING_CREATE).every((status) => status === 401)).toBe(
      true,
    );
    expect(statuses[RATE_LIMIT_PAIRING_CREATE]).toBe(429);

    const genuine = await createPairing(relay, { metadata: { userId: ACCOUNT_B } });
    expect(genuine.status).toBe(200);
  });
});

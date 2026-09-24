// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createMemoryKeyValueStore } from '@agiworkforce/key-value';

const API_KEY = 'fixture-provider-key';
const OBSERVED_ON = '2026-09-19';
const NOW = Date.UTC(2026, 8, 21);

async function freshInstance() {
  vi.resetModules();
  return import('./free-quota-authorization');
}

describe('free quota state shared between server instances', () => {
  it('shows a spent allowance recorded by one instance to every other instance', async () => {
    const store = createMemoryKeyValueStore();
    const writer = await freshInstance();
    await writer.recordFreeQuotaHold(store, {
      apiKey: API_KEY,
      offeringKey: 'offering-a',
      cause: 'exhausted',
      nowMs: NOW,
    });

    const reader = await freshInstance();
    const state = await reader.readFreeQuotaState(store, {
      apiKey: API_KEY,
      observedOn: OBSERVED_ON,
      offeringKeys: ['offering-a', 'offering-b'],
    });
    expect(state.holds.get('offering-a')).toBe('exhausted');
    expect(state.holds.has('offering-b')).toBe(false);
  });

  it('keeps a billing signal from any instance as a withdrawal of the whole account', async () => {
    const store = createMemoryKeyValueStore();
    const writer = await freshInstance();
    await writer.recordFreeQuotaSuspension(store, {
      apiKey: API_KEY,
      signal: 'Arrearage',
      nowMs: NOW,
    });
    const reader = await freshInstance();
    const state = await reader.readFreeQuotaState(store, {
      apiKey: API_KEY,
      observedOn: OBSERVED_ON,
      offeringKeys: [],
    });
    expect(state.suspendedAtMs).toBe(NOW);
  });

  it('treats unreadable shared records as the stricter answer', async () => {
    const store = createMemoryKeyValueStore();
    const instance = await freshInstance();
    await instance.recordFreeQuotaHold(store, {
      apiKey: API_KEY,
      offeringKey: 'offering-a',
      cause: 'exhausted',
      nowMs: NOW,
    });
    const [holdsKey] = (await store.scan('0', { match: 'agi-fquota:holds:*', count: 10 })).keys;
    await store.hashSet(holdsKey!, { 'offering-b': 'not a record' });
    await store.set(holdsKey!.replace(':holds:', ':suspended:'), 'not a record');
    const state = await instance.readFreeQuotaState(store, {
      apiKey: API_KEY,
      observedOn: OBSERVED_ON,
      offeringKeys: [],
    });
    expect(state.holds.get('offering-b')).toBe('billing');
    expect(state.suspendedAtMs).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('reserves each turn against one allowance counter that every instance draws from', async () => {
    const store = createMemoryKeyValueStore();
    const first = await freshInstance();
    const second = await freshInstance();
    const reservation = {
      apiKey: API_KEY,
      observedOn: OBSERVED_ON,
      offeringKey: 'offering-a',
      expiresOn: '2026-11-01',
      usable: 1_000,
      nowMs: NOW,
    };
    const held = await first.reserveFreeQuotaAllowance(store, { ...reservation, units: 700 });
    expect(held).not.toBeNull();
    expect(
      await second.reserveFreeQuotaAllowance(store, { ...reservation, units: 400 }),
    ).toBeNull();

    await first.settleFreeQuotaAllowance(store, held!, 150);
    const state = await second.readFreeQuotaState(store, {
      apiKey: API_KEY,
      observedOn: OBSERVED_ON,
      offeringKeys: ['offering-a'],
    });
    expect(state.used.get('offering-a')).toBe(150);
    expect(
      await second.reserveFreeQuotaAllowance(store, { ...reservation, units: 400 }),
    ).not.toBeNull();
  });

  it('reads an unreadable allowance counter as spent', async () => {
    const store = createMemoryKeyValueStore();
    const instance = await freshInstance();
    const held = await instance.reserveFreeQuotaAllowance(store, {
      apiKey: API_KEY,
      observedOn: OBSERVED_ON,
      offeringKey: 'offering-a',
      expiresOn: '2026-11-01',
      units: 10,
      usable: 1_000,
      nowMs: NOW,
    });
    await store.set(held!.key, 'not a number');
    const state = await instance.readFreeQuotaState(store, {
      apiKey: API_KEY,
      observedOn: OBSERVED_ON,
      offeringKeys: ['offering-a'],
    });
    expect(state.used.get('offering-a')).toBe(Number.POSITIVE_INFINITY);
  });

  it('keeps the whole reservation when the provider never reported what it used', async () => {
    const store = createMemoryKeyValueStore();
    const instance = await freshInstance();
    const held = await instance.reserveFreeQuotaAllowance(store, {
      apiKey: API_KEY,
      observedOn: OBSERVED_ON,
      offeringKey: 'offering-a',
      expiresOn: '2026-11-01',
      units: 600,
      usable: 1_000,
      nowMs: NOW,
    });
    await instance.settleFreeQuotaAllowance(store, held!, null);
    const state = await instance.readFreeQuotaState(store, {
      apiKey: API_KEY,
      observedOn: OBSERVED_ON,
      offeringKeys: ['offering-a'],
    });
    expect(state.used.get('offering-a')).toBe(600);
  });

  it('refuses a second submission of the same turn from any instance', async () => {
    const store = createMemoryKeyValueStore();
    const first = await freshInstance();
    const second = await freshInstance();
    const turn = { userId: 'fixture-user', requestId: 'turn-1', nowMs: NOW };
    expect(await first.claimFreeQuotaTurn(store, turn)).toBe(true);
    expect(await second.claimFreeQuotaTurn(store, turn)).toBe(false);
    expect(await second.claimFreeQuotaTurn(store, { ...turn, requestId: 'turn-2' })).toBe(true);
  });
});

describe('provider refusals on a free model', () => {
  it.each([
    [
      { status: 403, code: 'AllocationQuota.FreeTierOnly', message: 'free tier exhausted' },
      'exhausted',
    ],
    [{ status: 402, message: 'Payment required' }, 'billing'],
    [
      {
        status: 429,
        code: 'insufficient_quota',
        message: 'You exceeded your current quota, please check your plan and billing details.',
      },
      'billing',
    ],
    [
      { status: 400, code: 'Arrearage', message: 'account not in good standing' },
      'account_billing',
    ],
    [{ status: 429, code: 'BudgetLimitExceeded', message: 'budget exhausted' }, 'account_billing'],
    [{ status: 429, code: 'PostpaidBillOverdue', message: 'bill overdue' }, 'account_billing'],
    [
      { status: 429, code: 'Throttling.RateQuota', message: 'Requests rate limit exceeded' },
      'busy',
    ],
  ] as const)('classifies %o as %s', async (failure, expected) => {
    const { classifyFreeQuotaRefusal } = await freshInstance();
    expect(classifyFreeQuotaRefusal(failure)).toBe(expected);
  });
});

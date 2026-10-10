import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  checkProviderCallReservation,
  dispatchesProviderCall,
  KNOWN_UNRESERVED,
  reservesBeforeDispatch,
} from './check-provider-call-reservation.mjs';

function scan(files, known = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'provider-call-reservation-'));
  try {
    for (const [name, source] of Object.entries(files)) {
      const full = path.join(root, 'apps/web/lib', name);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, source, 'utf8');
    }
    return checkProviderCallReservation(root, ['apps/web/lib'], known);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const UNCHARGED_SIDE_CALL = `
  export async function suggest(input) {
    const response = await drainToLlmResponse(
      buildServerProviderAdapter(provider).stream(request, signal),
    );
    await recordSettledProviderCost({ customerCanonicalMicrousd: 0 });
    return response.content;
  }
`;

const CHARGED_SIDE_CALL = `
  export async function suggest(input) {
    const lease = await reserveBackgroundUsage({ userId: input.userId });
    await lease.providerStarted();
    const response = await drainToLlmResponse(
      buildServerProviderAdapter(provider).stream(request, signal),
    );
    await lease.completed({ usage });
    return response.content;
  }
`;

test('a provider call that only records platform cost is reported', () => {
  const result = scan({ 'follow-ups.ts': UNCHARGED_SIDE_CALL });
  assert.deepEqual(result.unexpected, ['apps/web/lib/follow-ups.ts']);
});

test('a provider call reserved against the account passes', () => {
  const result = scan({ 'follow-ups.ts': CHARGED_SIDE_CALL });
  assert.deepEqual(result.dispatching, ['apps/web/lib/follow-ups.ts']);
  assert.deepEqual(result.unexpected, []);
});

test('every reservation entry point counts, and a mention in a comment does not', () => {
  for (const entry of [
    'reserveManagedUsageRequest',
    'reserveManagedUsageProviderStep',
    'reserveBackgroundUsage',
    'beginFreeTrialRequest',
    'reserveGuestSpend',
  ]) {
    assert.equal(reservesBeforeDispatch(`await ${entry}({});`), true, entry);
  }
  assert.equal(reservesBeforeDispatch('// reserveBackgroundUsage(...) was here'), false);
  assert.equal(dispatchesProviderCall('/** see buildServerProviderAdapter(id) */'), false);
  assert.equal(dispatchesProviderCall('const a = buildServerProviderAdapter(id);'), true);
});

test('a known platform-borne module passes, and one that now reserves must leave the list', () => {
  const known = { 'apps/web/lib/follow-ups.ts': 'platform cost' };
  assert.deepEqual(scan({ 'follow-ups.ts': UNCHARGED_SIDE_CALL }, known).unexpected, []);
  assert.deepEqual(scan({ 'follow-ups.ts': CHARGED_SIDE_CALL }, known).stale, [
    'apps/web/lib/follow-ups.ts',
  ]);
});

test('the shipped tree has no unreserved provider call outside the known list', () => {
  const result = checkProviderCallReservation();
  assert.deepEqual(result.unexpected, []);
  assert.deepEqual(result.stale, []);
  for (const reason of Object.values(KNOWN_UNRESERVED)) assert.ok(reason.length > 20);
});

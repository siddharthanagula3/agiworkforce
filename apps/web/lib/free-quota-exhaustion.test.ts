// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { hasExhaustedFreeQuota, markFreeQuotaExhausted } from './free-quota-authorization';

let directory: string;
const verification = {
  localUserId: 'fixture-user',
  sourceUrl: 'https://home.qwencloud.com/benefits' as const,
  checkedAtMs: 1000,
  credentialSha256: 'a'.repeat(64),
  offerings: [],
};

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'quota-exhaustion-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it('persists exhaustion across reads and concurrent reports without affecting other models', async () => {
  expect(await hasExhaustedFreeQuota(verification, 'fixture-model', directory)).toBe(false);
  await Promise.all([
    markFreeQuotaExhausted(verification, 'fixture-model', directory),
    markFreeQuotaExhausted(verification, 'fixture-model', directory),
  ]);
  expect(await hasExhaustedFreeQuota(verification, 'fixture-model', directory)).toBe(true);
  expect(await hasExhaustedFreeQuota(verification, 'another-model', directory)).toBe(false);
});

it('isolates accounts, credentials and fresh account verification', async () => {
  await markFreeQuotaExhausted(verification, 'fixture-model', directory);
  for (const change of [
    { localUserId: 'other-user' },
    { credentialSha256: 'b'.repeat(64) },
    { checkedAtMs: 2000 },
  ]) {
    expect(
      await hasExhaustedFreeQuota({ ...verification, ...change }, 'fixture-model', directory),
    ).toBe(false);
  }
});

it('recognizes verified zero quota without waiting for a provider rejection', async () => {
  expect(
    await hasExhaustedFreeQuota(
      {
        ...verification,
        offerings: [
          {
            offeringKey: 'fixture-model',
            quotaOnly: true,
            unit: 'images',
            remaining: 0,
            expiresAtMs: 9000,
          },
        ],
      },
      'fixture-model',
      directory,
    ),
  ).toBe(true);
});

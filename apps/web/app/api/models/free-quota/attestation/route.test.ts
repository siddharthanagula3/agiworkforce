// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createMemoryKeyValueStore, type MemoryKeyValueStore } from '@agiworkforce/key-value';
import { createError } from '@/lib/errors';
import { credentialSha256, readFreeQuotaState } from '@/lib/free-quota-authorization';
import { loadFreePools } from '@/lib/server/free-pools';

const mocks = vi.hoisted(() => ({
  store: null as unknown as MemoryKeyValueStore,
  admin: vi.fn(),
  audit: vi.fn(),
  csrf: vi.fn(),
}));

vi.mock('@/lib/auth-guards', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth-guards')>()),
  requirePlatformAdmin: mocks.admin,
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/csrf')>()),
  requireCsrfToken: mocks.csrf,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security-audit')>()),
  recordAuditEvent: mocks.audit,
}));
vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/key-value')>()),
  getKeyValueStore: () => mocks.store,
  getKeyValueProvider: () => 'upstash',
}));

const { GET, POST } = await import('./route');

const API_KEY = 'fixture-provider-key';
const inventory = loadFreePools().inventory!;

function attest(body: unknown) {
  return POST(
    new NextRequest('https://agiworkforce.com/api/models/free-quota/attestation', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

async function stored() {
  return (
    await readFreeQuotaState(mocks.store, {
      apiKey: API_KEY,
      observedOn: inventory.observedOn,
      offeringKeys: [],
    })
  ).attestation;
}

beforeEach(() => {
  vi.stubEnv('QWEN_API_KEY', API_KEY);
  mocks.store = createMemoryKeyValueStore();
  mocks.admin.mockResolvedValue({ userId: 'fixture-operator' });
  mocks.csrf.mockResolvedValue(null);
  mocks.audit.mockResolvedValue(undefined);
});

afterEach(() => vi.unstubAllEnvs());

it('binds a recent console check to the server key and records who made it', async () => {
  const checkedAtMs = Date.now() - 60_000;
  const response = await attest({ checkedAtMs, quotaOnlyOfferings: 'all' });
  expect(response.status).toBe(200);
  expect(await stored()).toEqual({
    sourceUrl: 'https://home.qwencloud.com/benefits',
    checkedAtMs,
    credentialSha256: credentialSha256(API_KEY),
    quotaOnlyOfferings: 'all',
    attestedBy: 'fixture-operator',
  });
  expect(mocks.audit).toHaveBeenCalledWith(
    expect.objectContaining({ eventType: 'admin_policy_changed', userId: 'fixture-operator' }),
  );
  const status = await (
    await GET(new NextRequest('https://agiworkforce.com/api/models/free-quota/attestation'))
  ).json();
  expect(status.attestation).toMatchObject({ checkedAtMs, boundToCurrentKey: true });
});

it.each([
  [
    'an old check',
    { checkedAtMs: Date.now() - 7 * 24 * 60 * 60 * 1000, quotaOnlyOfferings: 'all' },
  ],
  ['a future check', { checkedAtMs: Date.now() + 60_000, quotaOnlyOfferings: 'all' }],
  ['an unknown offering', { checkedAtMs: Date.now(), quotaOnlyOfferings: ['not-an-offering'] }],
  ['a malformed body', { quotaOnlyOfferings: 'all' }],
])('stores nothing for %s', async (_label, body) => {
  expect((await attest(body)).status).toBe(400);
  expect(await stored()).toBeNull();
  expect(mocks.audit).not.toHaveBeenCalled();
});

it('stores nothing when the deployment holds no provider key', async () => {
  vi.stubEnv('QWEN_API_KEY', '');
  expect((await attest({ checkedAtMs: Date.now(), quotaOnlyOfferings: 'all' })).status).toBe(503);
  expect(mocks.audit).not.toHaveBeenCalled();
});

it('is closed to anyone who is not a platform operator', async () => {
  mocks.admin.mockRejectedValue(createError.notFound('Not found.'));
  expect((await attest({ checkedAtMs: Date.now(), quotaOnlyOfferings: 'all' })).status).toBe(404);
  expect(await stored()).toBeNull();
});

it('refuses a write without a CSRF token', async () => {
  mocks.csrf.mockResolvedValue(new Response(null, { status: 403 }));
  expect((await attest({ checkedAtMs: Date.now(), quotaOnlyOfferings: 'all' })).status).toBe(403);
  expect(await stored()).toBeNull();
});

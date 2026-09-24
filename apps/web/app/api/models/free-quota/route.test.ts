// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createMemoryKeyValueStore, type MemoryKeyValueStore } from '@agiworkforce/key-value';
import {
  credentialSha256,
  recordFreeQuotaHold,
  writeQuotaAttestation,
} from '@/lib/free-quota-authorization';
import type { FreeQuotaCatalogue } from '@/features/models/lib/free-quota-types';

const mocks = vi.hoisted(() => ({
  store: null as unknown as MemoryKeyValueStore | null,
  plan: vi.fn(),
}));

vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-auth')>()),
  assertAccountActive: vi.fn(async () => undefined),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/rls-db')>()),
  getUserScopedDb: vi.fn(async () => ({ userId: 'fixture-user', organizationId: null, db: {} })),
}));
vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/key-value')>()),
  getKeyValueStore: () => mocks.store,
  getKeyValueProvider: () => 'upstash',
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/entitlement-resolution')>()),
  resolveEntitledPlanTier: mocks.plan,
}));

const { GET } = await import('./route');

const API_KEY = 'fixture-provider-key';

async function catalogue(): Promise<{ status: number; body: FreeQuotaCatalogue }> {
  const response = await GET(new NextRequest('https://agiworkforce.com/api/models/free-quota'));
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  return { status: response.status, body: await response.json() };
}

function ready(body: FreeQuotaCatalogue): string[] {
  return body.models.filter((model) => model.status === 'ready').map((model) => model.key);
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('QWEN_API_KEY', API_KEY);
  mocks.store = createMemoryKeyValueStore();
  mocks.plan.mockResolvedValue('free');
});

afterEach(() => vi.unstubAllEnvs());

it('answers a Free account in production, offering nothing until the setting is attested', async () => {
  const { status, body } = await catalogue();
  expect(status).toBe(200);
  expect(body.issuer).toBe('QwenCloud');
  expect(body.models.length).toBeGreaterThan(0);
  expect(body.models.every((model) => model.category === 'chat')).toBe(true);
  expect(ready(body)).toEqual([]);
});

it('does not advertise promotional image or video generation to a Free account', async () => {
  await writeQuotaAttestation(mocks.store!, {
    sourceUrl: 'https://home.qwencloud.com/benefits',
    checkedAtMs: Date.now() - 60_000,
    credentialSha256: credentialSha256(API_KEY),
    quotaOnlyOfferings: 'all',
    attestedBy: 'fixture-operator',
  });
  const { body } = await catalogue();

  expect(body.models.length).toBeGreaterThan(0);
  expect(body.models.every((model) => model.category === 'chat')).toBe(true);
});

it('lists attested models as ready and a spent one as exhausted for every account', async () => {
  await writeQuotaAttestation(mocks.store!, {
    sourceUrl: 'https://home.qwencloud.com/benefits',
    checkedAtMs: Date.now() - 60_000,
    credentialSha256: credentialSha256(API_KEY),
    quotaOnlyOfferings: 'all',
    attestedBy: 'fixture-operator',
  });
  const [spent, ...others] = ready((await catalogue()).body);
  expect(others.length).toBeGreaterThan(0);
  await recordFreeQuotaHold(mocks.store!, {
    apiKey: API_KEY,
    offeringKey: spent!,
    cause: 'exhausted',
    nowMs: Date.now(),
  });
  const { body } = await catalogue();
  expect(body.models.find((model) => model.key === spent)!.status).toBe('exhausted');
  expect(ready(body)).toEqual(others);
});

it('offers nothing when the deployment has no shared state store', async () => {
  mocks.store = null;
  const { body } = await catalogue();
  expect(ready(body)).toEqual([]);
});

it('keeps promotional chat offerings exclusive to Free accounts', async () => {
  mocks.plan.mockResolvedValue('pro');
  const { status, body } = await catalogue();
  expect(status).toBe(200);
  expect(body.models.length).toBeGreaterThan(0);
  expect(body.models.every((model) => model.category === 'image')).toBe(true);
});

it('lists eligible image and video offerings for a video-entitled paid tier', async () => {
  mocks.plan.mockResolvedValue('max_15x');
  const { status, body } = await catalogue();
  expect(status).toBe(200);
  expect(body.models.some((model) => model.category === 'image')).toBe(true);
  expect(body.models.some((model) => model.category === 'video')).toBe(true);
  expect(body.models.every((model) => ['image', 'video'].includes(model.category))).toBe(true);
});

it('keeps promotional media unavailable to a paid tier without generation access', async () => {
  mocks.plan.mockResolvedValue('basic');
  const response = await GET(new NextRequest('https://agiworkforce.com/api/models/free-quota'));
  expect(response.status).toBe(403);
});

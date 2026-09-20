// @vitest-environment node
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ verification: vi.fn(), exhausted: vi.fn(), validate: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/error-handler', () => ({ withErrorHandler: <T>(handler: T) => handler }));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'fixture-user' })),
  assertAccountActive: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/server/free-quota-catalogue', () => ({
  isLocalQuotaRequest: () => true,
  buildFreeQuotaCatalogue: () => ({
    models: [
      { key: 'exhausted-model', status: 'account_check_required' },
      { key: 'available-model', status: 'account_check_required' },
    ],
  }),
}));
vi.mock('@/lib/free-quota-authorization', async (original) => ({
  ...(await original<object>()),
  readLocalQuotaVerification: mocks.verification,
  hasExhaustedFreeQuota: mocks.exhausted,
  validateQuotaProbeAuthorization: mocks.validate,
}));

import { GET } from './route';

afterEach(() => vi.unstubAllEnvs());

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('QWEN_API_KEY', 'fixture-key');
  mocks.verification.mockResolvedValue({
    localUserId: 'fixture-user',
    credentialSha256: createHash('sha256').update('fixture-key').digest('hex'),
  });
  mocks.exhausted.mockImplementation(async (_verification, model) => model === 'exhausted-model');
});

it('returns exhausted status across catalogue reloads while other models remain available', async () => {
  for (let reload = 0; reload < 2; reload++) {
    const response = await GET(new NextRequest('http://localhost:3100/api/models/free-quota'));
    expect((await response.json()).models).toEqual([
      { key: 'exhausted-model', status: 'exhausted' },
      { key: 'available-model', status: 'ready' },
    ]);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  }
});

it.each([
  {
    localUserId: 'another-user',
    credentialSha256: createHash('sha256').update('fixture-key').digest('hex'),
  },
  { localUserId: 'fixture-user', credentialSha256: 'b'.repeat(64) },
])('does not reuse another account or credential’s quota state', async (verification) => {
  mocks.verification.mockResolvedValue(verification);
  const response = await GET(new NextRequest('http://localhost:3100/api/models/free-quota'));
  expect(
    (await response.json()).models.every(
      (model: { status: string }) => model.status === 'account_check_required',
    ),
  ).toBe(true);
  expect(mocks.exhausted).not.toHaveBeenCalled();
});

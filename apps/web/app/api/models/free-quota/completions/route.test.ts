// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getProviderOfferings } from '@agiworkforce/types';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  csrf: vi.fn(),
  stream: vi.fn(),
  media: vi.fn(),
  verification: vi.fn(),
  claim: vi.fn(),
  privacy: vi.fn(),
  retention: vi.fn(),
  modelGate: vi.fn(),
  egress: vi.fn(),
  exhausted: vi.fn(),
  markExhausted: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/error-handler', () => ({ withErrorHandler: <T>(handler: T) => handler }));
vi.mock('@/lib/api-auth', () => ({ assertAccountActive: vi.fn() }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    userId: 'local-user',
    organizationId: null,
    db: { query: mocks.query },
  })),
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn() }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.csrf }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/managed-compute-gate', () => ({
  buildModelPolicyGateResponse: mocks.modelGate,
  buildProviderEgressGateResponse: mocks.egress,
}));
vi.mock('@/lib/services/organization-policy-gate', () => ({
  evaluateActiveWorkspacePolicy: mocks.privacy,
  resolveZeroDataRetentionPolicy: mocks.retention,
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/secret-handling-gate', () => ({
  applySecretHandlingToTexts: vi.fn(async (_user: string, texts: string[]) => ({
    action: 'allowed',
    texts,
  })),
}));
vi.mock('@agiworkforce/providers-factory', () => ({
  runQwenQuotaProbe: mocks.media,
  streamQwenQuotaChat: mocks.stream,
}));
vi.mock('@/lib/free-quota-authorization', async (original) => ({
  ...(await original<object>()),
  readLocalQuotaVerification: mocks.verification,
  claimQuotaProbe: mocks.claim,
  hasExhaustedFreeQuota: mocks.exhausted,
  markFreeQuotaExhausted: mocks.markExhausted,
}));
const { POST } = await import('./route');
const model = Object.entries(getProviderOfferings()).find(
  ([, entry]) => entry.quotaProbeProtocol === 'chat',
)![0];
let directory: string;
function record(offeringKey = model, unit = 'tokens') {
  return {
    sourceUrl: 'https://home.qwencloud.com/benefits',
    localUserId: 'local-user',
    checkedAtMs: Date.now(),
    credentialSha256: createHash('sha256').update('fixture-key').digest('hex'),
    offerings: [
      {
        offeringKey,
        quotaOnly: true,
        unit,
        remaining: 10000,
        expiresAtMs: Date.now() + 86400000,
      },
    ],
  };
}
function post(patch: Record<string, unknown> = {}) {
  return POST(
    new NextRequest('http://localhost:3100/api/models/free-quota/completions', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'fixture-turn' },
      body: JSON.stringify({
        model,
        conversation_id: '52d14f7e-0b3d-40c7-952d-987e841033c5',
        assistant_message_id: '62d14f7e-0b3d-40c7-952d-987e841033c5',
        messages: [{ role: 'user', content: 'Hello' }],
        ...patch,
      }),
    }),
  );
}
beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('QWEN_API_KEY', 'fixture-key');
  directory = await mkdtemp(join(tmpdir(), 'quota-route-'));
  mocks.query.mockResolvedValue([{ id: 'conversation', data_region: null }]);
  mocks.privacy.mockResolvedValue({ allowed: true });
  mocks.retention.mockResolvedValue({ required: false });
  mocks.verification.mockResolvedValue(record());
  mocks.claim.mockResolvedValue(join(directory, 'claim.json'));
  mocks.stream.mockResolvedValue(new Response('data: [DONE]\n\n'));
  mocks.exhausted.mockResolvedValue(false);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
describe('local Free selector completion boundary', () => {
  it('streams the exact offering as explicit user-key traffic with no paid media dispatch', async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('[DONE]');
    expect(mocks.stream).toHaveBeenCalledWith(
      model,
      'fixture-key',
      expect.anything(),
      expect.objectContaining({ messages: [{ role: 'user', content: 'Hello' }] }),
    );
    expect(mocks.egress).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'byok', routeKeyAttribution: 'user-key', isFallback: false }),
    );
    expect(mocks.query.mock.calls[0]![1]).toEqual([
      '52d14f7e-0b3d-40c7-952d-987e841033c5',
      'local-user',
      null,
    ]);
    expect(mocks.media).not.toHaveBeenCalled();
  });
  it('rejects production and CSRF failures before dispatch', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect((await post()).status).toBe(404);
    vi.stubEnv('NODE_ENV', 'development');
    mocks.csrf.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await post()).status).toBe(403);
    expect(mocks.stream).not.toHaveBeenCalled();
  });
  it('rejects another account, stale checks, and missing conversation ownership', async () => {
    mocks.verification.mockResolvedValue({ ...record(), localUserId: 'another-user' });
    expect((await post()).status).toBe(409);
    mocks.verification.mockResolvedValue({ ...record(), checkedAtMs: Date.now() - 3600000 });
    expect((await post()).status).toBe(409);
    mocks.query.mockResolvedValue([]);
    expect((await post()).status).toBe(404);
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it('preserves workspace region, retention and BYOK restrictions', async () => {
    mocks.query.mockResolvedValue([{ id: 'conversation', data_region: 'us' }]);
    expect((await post()).status).toBe(403);
    mocks.query.mockResolvedValue([{ id: 'conversation', data_region: null }]);
    mocks.retention.mockResolvedValue({ required: true });
    expect((await post()).status).toBe(403);
    mocks.retention.mockResolvedValue({ required: false });
    mocks.privacy.mockResolvedValue({ allowed: false });
    expect((await post()).status).toBe(403);
    expect(mocks.stream).not.toHaveBeenCalled();
  });
  it('refuses tools, attachments and oversized histories without a provider call', async () => {
    expect((await post({ web_search: true })).status).toBe(400);
    expect((await post({ messages: [{ role: 'user', content: [] }] })).status).toBe(400);
    expect(
      (
        await post({
          messages: [
            { role: 'user', content: 'a'.repeat(100000) },
            { role: 'user', content: 'b' },
          ],
        })
      ).status,
    ).toBe(400);
    expect(mocks.stream).not.toHaveBeenCalled();
  });
  it('prevents duplicate submissions and reports quota exhaustion without retry', async () => {
    mocks.claim.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 'EEXIST' }));
    expect((await post()).status).toBe(409);
    expect(mocks.stream).not.toHaveBeenCalled();
    mocks.stream.mockResolvedValue(
      new Response(JSON.stringify({ code: 'AllocationQuota.FreeTierOnly' }), { status: 400 }),
    );
    const response = await post();
    expect(response.status).toBe(409);
    expect((await response.json()).error).toEqual({
      code: 'free_quota_exhausted',
      message:
        'This model’s free quota has been exhausted. Choose another model in Free to continue.',
    });
    expect(mocks.markExhausted).toHaveBeenCalledWith(
      expect.objectContaining({ localUserId: 'local-user' }),
      model,
    );
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(mocks.media).not.toHaveBeenCalled();
  });
  it('refuses a known exhausted model before making another provider request', async () => {
    mocks.exhausted.mockResolvedValue(true);
    const response = await post();
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('free_quota_exhausted');
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.media).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it.each(['image', 'video'] as const)(
    'reports %s exhaustion and records it without retry',
    async (category) => {
      const offering = Object.entries(getProviderOfferings()).find(
        ([, entry]) => entry.category === category && entry.quotaProbeProtocol,
      )!;
      mocks.verification.mockResolvedValue(
        record(offering[0], category === 'image' ? 'images' : 'seconds'),
      );
      mocks.media.mockResolvedValue({
        status: 'quota_exhausted',
        providerCode: 'AllocationQuota.FreeTierOnly',
      });
      const response = await post({ model: offering[0] });
      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe('free_quota_exhausted');
      expect(mocks.markExhausted).toHaveBeenCalledWith(expect.anything(), offering[0]);
      expect(mocks.media).toHaveBeenCalledTimes(1);
      expect(mocks.stream).not.toHaveBeenCalled();
    },
  );
});

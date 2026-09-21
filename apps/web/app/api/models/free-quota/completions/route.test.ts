// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createMemoryKeyValueStore, type MemoryKeyValueStore } from '@agiworkforce/key-value';
import { getProviderOfferings } from '@agiworkforce/types';
import {
  credentialSha256,
  readFreeQuotaState,
  reserveFreeQuotaAllowance,
  sharesManagedRoute,
  writeQuotaAttestation,
} from '@/lib/free-quota-authorization';
import { loadFreePools } from '@/lib/server/free-pools';
import { loadFreeQuotaPolicy } from '@/lib/server/free-quota-catalogue';

const mocks = vi.hoisted(() => ({
  store: null as unknown as MemoryKeyValueStore,
  query: vi.fn(),
  stream: vi.fn(),
  media: vi.fn(),
  otherProvider: vi.fn(),
  egress: vi.fn(),
  privacy: vi.fn(),
  retention: vi.fn(),
  plan: vi.fn(),
  begin: vi.fn(),
  settle: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/csrf')>()),
  requireCsrfToken: vi.fn(async () => null),
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
  getUserScopedDb: vi.fn(async () => ({
    userId: 'fixture-user',
    organizationId: null,
    db: { query: mocks.query },
  })),
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
vi.mock('@/lib/managed-compute-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/managed-compute-gate')>()),
  buildModelPolicyGateResponse: vi.fn(async () => null),
  buildProviderEgressGateResponse: mocks.egress,
}));
vi.mock('@/lib/services/organization-policy-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/organization-policy-gate')>()),
  evaluateActiveWorkspacePolicy: mocks.privacy,
  resolveZeroDataRetentionPolicy: mocks.retention,
}));
vi.mock('@/lib/services/managed-content-safety-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-content-safety-service')>()),
  enforceManagedContentSafetyPreference: vi.fn(async () => ({ enabled: false, allowed: true })),
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/secret-handling-gate', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/app/api/llm/v1/chat/completions/lib/secret-handling-gate')
  >()),
  applySecretHandlingToTexts: vi.fn(async (_user: string, texts: string[]) => ({
    action: 'clean',
    texts,
  })),
}));
vi.mock('@/lib/services/free-trial-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/free-trial-service')>()),
  beginFreeTrialRequest: mocks.begin,
  settleFreeTrialRequest: mocks.settle,
}));
vi.mock('@agiworkforce/providers-factory', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const guarded = Object.fromEntries(
    Object.entries(actual).map(([name, value]) => [
      name,
      typeof value === 'function'
        ? (...args: unknown[]) => {
            mocks.otherProvider(name, ...args);
            throw new Error(`${name} is not a free quota path`);
          }
        : value,
    ]),
  );
  return { ...guarded, streamQwenQuotaChat: mocks.stream, runQwenQuotaProbe: mocks.media };
});

const { POST } = await import('./route');

const API_KEY = 'fixture-provider-key';
const inventory = loadFreePools().inventory!;
const today = new Date().toISOString().slice(0, 10);
const [model, second] = inventory.entries
  .filter((entry) => {
    const offering = getProviderOfferings()[entry.offeringKey]!;
    return (
      entry.quotaOnlyObserved &&
      entry.providerStatus === 'active' &&
      (entry.expiresOn ?? '9999') > today &&
      offering.quotaProbeProtocol === 'chat' &&
      !offering.quotaThinkingRequired &&
      !sharesManagedRoute(offering)
    );
  })
  .map((entry) => entry.offeringKey);
const modelName = getProviderOfferings()[model!]!.displayName;

function sse(...events: string[]): Response {
  return new Response(events.map((event) => `data: ${event}\n\n`).join(''), {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function post(patch: Record<string, unknown> = {}, idempotencyKey = 'fixture-turn') {
  return POST(
    new NextRequest('https://agiworkforce.com/api/models/free-quota/completions', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
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

async function attest(quotaOnlyOfferings: 'all' | string[] = 'all') {
  await writeQuotaAttestation(mocks.store, {
    sourceUrl: 'https://home.qwencloud.com/benefits',
    checkedAtMs: Date.now() - 60_000,
    credentialSha256: credentialSha256(API_KEY),
    quotaOnlyOfferings,
    attestedBy: 'fixture-operator',
  });
}

async function sharedState() {
  return readFreeQuotaState(mocks.store, {
    apiKey: API_KEY,
    observedOn: inventory.observedOn,
    offeringKeys: [model!, second!],
  });
}

beforeEach(async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('QWEN_API_KEY', API_KEY);
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.store = createMemoryKeyValueStore();
  mocks.query.mockResolvedValue([{ id: 'conversation', data_region: null }]);
  mocks.privacy.mockResolvedValue({ allowed: true });
  mocks.retention.mockResolvedValue({ required: false });
  mocks.plan.mockResolvedValue('free');
  mocks.egress.mockResolvedValue(null);
  mocks.begin.mockImplementation(async ({ userId, requestId }) => ({
    ok: true,
    reservation: { kind: 'free_trial', userId, requestId, reservedMicrousd: 25_000 },
  }));
  mocks.settle.mockResolvedValue(undefined);
  await attest();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Qwen free quota turns on the Free plan', () => {
  it('serves a ready model with the platform key under managed trust, metered at zero cost', async () => {
    mocks.stream.mockResolvedValue(
      sse(
        JSON.stringify({ choices: [{ index: 0, delta: { content: 'Hi' }, finish_reason: null }] }),
        JSON.stringify({
          choices: [],
          usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
        }),
        '[DONE]',
      ),
    );
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"content":"Hi"');
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(mocks.stream.mock.calls[0]![0]).toBe(model);
    expect(mocks.stream.mock.calls[0]![1]).toBe(API_KEY);
    expect(mocks.egress).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'managed', routeKeyAttribution: 'platform-key' }),
    );
    expect(mocks.settle).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'completed', model, measuredCostDollars: 0 }),
    );
    expect((await sharedState()).used.get(model!)).toBe(15);
  });

  it('meters every input and output token the provider reports', async () => {
    mocks.stream.mockResolvedValue(
      sse(
        JSON.stringify({
          choices: [],
          usage: { prompt_tokens: 40, completion_tokens: 2, total_tokens: 5 },
        }),
        '[DONE]',
      ),
    );
    await (await post()).text();
    expect((await sharedState()).used.get(model!)).toBe(42);
  });

  it('offers nothing when the allowance meter cannot be read', async () => {
    vi.spyOn(mocks.store, 'batch').mockImplementation(() => {
      throw new Error('store unreachable');
    });
    const response = await post();
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('free_quota_unavailable');
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it('sends nothing when the allowance meter cannot be written', async () => {
    vi.spyOn(mocks.store, 'increment').mockRejectedValue(new Error('store unreachable'));
    const response = await post();
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('free_quota_unavailable');
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.settle).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed' }));
  });

  it('refuses every model without a provider call until the setting is attested', async () => {
    mocks.store = createMemoryKeyValueStore();
    const response = await post();
    expect(response.status).toBe(503);
    const { error } = await response.json();
    expect(error.code).toBe('free_quota_unavailable');
    expect(error.message).toContain(`${modelName} from ${inventory.issuer}`);
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.begin).not.toHaveBeenCalled();
  });

  it('keeps the Free plan usage limit in force', async () => {
    mocks.begin.mockResolvedValue({ ok: false, code: 'budget_reached' });
    const response = await post();
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe('free_trial_token_budget_reached');
    expect(mocks.stream).not.toHaveBeenCalled();
    expect((await sharedState()).used.get(model!)).toBe(0);
  });

  it('refuses a plan the free models are not mapped to', async () => {
    mocks.plan.mockResolvedValue('pro');
    const response = await post();
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('model_not_available');
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it('names the provider and the model, not the account, when the free allowance is spent', async () => {
    mocks.stream.mockResolvedValue(
      Response.json(
        { error: { code: 'AllocationQuota.FreeTierOnly', message: 'raw provider sentence' } },
        { status: 403 },
      ),
    );
    const response = await post();
    expect(response.status).toBe(409);
    const { error } = await response.json();
    expect(error.code).toBe('free_quota_exhausted');
    expect(error.message).toContain(`${inventory.issuer}'s free allowance for ${modelName}`);
    expect(error.message).toContain('not a limit on your account');
    expect(error.message).not.toContain('raw provider sentence');
    expect((await sharedState()).holds.get(model!)).toBe('exhausted');
  });

  it('withdraws a model for every account on a billing signal and never calls it again', async () => {
    mocks.stream.mockResolvedValue(
      Response.json({ error: { message: 'Payment required' } }, { status: 402 }),
    );
    expect((await post()).status).toBe(409);
    expect((await sharedState()).holds.get(model!)).toBe('billing');

    const again = await post(
      { assistant_message_id: '72d14f7e-0b3d-40c7-952d-987e841033c5' },
      'another-turn',
    );
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe('free_quota_exhausted');
    expect(mocks.stream).toHaveBeenCalledTimes(1);
  });

  it('withdraws every model when the provider reports an account billing state', async () => {
    mocks.stream.mockResolvedValue(
      Response.json(
        { code: 'Arrearage', message: 'account not in good standing' },
        { status: 400 },
      ),
    );
    expect((await post()).status).toBe(503);
    const other = await post(
      { model: second, assistant_message_id: '82d14f7e-0b3d-40c7-952d-987e841033c5' },
      'second-model',
    );
    expect(other.status).toBe(503);
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect((await sharedState()).suspendedAtMs).not.toBeNull();
  });

  it('refuses the same turn twice without a second provider call', async () => {
    mocks.stream.mockResolvedValue(sse('[DONE]'));
    await (await post()).text();
    const duplicate = await post();
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).error.code).toBe('free_quota_duplicate');
    expect(mocks.stream).toHaveBeenCalledTimes(1);
  });

  it('replaces a provider error inside the stream with its own words and records it', async () => {
    mocks.stream.mockResolvedValue(
      sse(
        JSON.stringify({ choices: [{ index: 0, delta: { content: 'Par' }, finish_reason: null }] }),
        JSON.stringify({
          error: { code: 'AllocationQuota.FreeTierOnly', message: 'raw provider sentence' },
        }),
        '[DONE]',
      ),
    );
    const text = await (await post()).text();
    expect(text).toContain('x_stream_error');
    expect(text).toContain('free_quota_exhausted');
    expect(text).not.toContain('raw provider sentence');
    expect((await sharedState()).holds.get(model!)).toBe('exhausted');
    expect(mocks.settle).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed' }));
  });

  it('says the reply stopped when the provider stream ends early, and keeps the reservation', async () => {
    mocks.stream.mockResolvedValue(
      sse(
        JSON.stringify({ choices: [{ index: 0, delta: { content: 'Par' }, finish_reason: null }] }),
      ),
    );
    const text = await (await post()).text();
    expect(text).toContain('stream_interrupted');
    expect(mocks.settle).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed' }));
    expect((await sharedState()).used.get(model!)).toBeGreaterThan(0);
  });

  it('fits the reply to what is left of the shared allowance and refuses a turn that cannot fit', async () => {
    const entry = inventory.entries.find((row) => row.offeringKey === model)!;
    const usable = Math.floor(
      ((entry.limit! - (entry.consumedApproximate ?? 0)) *
        loadFreeQuotaPolicy().allowanceUsablePercent) /
        100,
    );
    await reserveFreeQuotaAllowance(mocks.store, {
      apiKey: API_KEY,
      observedOn: inventory.observedOn,
      offeringKey: model!,
      expiresOn: entry.expiresOn,
      units: usable - 1_000,
      usable,
      nowMs: Date.now(),
    });
    const tooLong = await post({ messages: [{ role: 'user', content: 'x'.repeat(2_000) }] });
    expect(tooLong.status).toBe(400);
    expect((await tooLong.json()).error.code).toBe('context_length_exceeded');
    expect(mocks.stream).not.toHaveBeenCalled();

    mocks.stream.mockResolvedValue(sse('[DONE]'));
    await (await post({}, 'short-turn')).text();
    expect(mocks.stream.mock.calls[0]![2].maxOutputTokens).toBeLessThanOrEqual(1_000);
  });

  it('refuses tools and attachments before any provider call', async () => {
    expect((await post({ web_search: true })).status).toBe(400);
    expect((await post({ messages: [{ role: 'user', content: [] }] })).status).toBe(400);
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it('respects a workspace data region', async () => {
    mocks.query.mockResolvedValue([{ id: 'conversation', data_region: 'us' }]);
    const response = await post();
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('organization_policy');
    expect(mocks.stream).not.toHaveBeenCalled();
  });
});

describe('no paid route is reachable from a free quota turn', () => {
  it.each([
    ['a spent allowance', 403, { error: { code: 'AllocationQuota.FreeTierOnly' } }],
    ['a billing refusal', 402, { error: { message: 'Payment required' } }],
    ['an account billing state', 400, { code: 'Arrearage' }],
    ['a rate limit', 429, { code: 'Throttling.RateQuota' }],
    ['a provider fault', 500, { code: 'InternalError' }],
    ['a context overflow', 400, { error: { message: 'maximum context length exceeded' } }],
  ])('answers %s with a refusal and no second dispatch', async (_label, status, body) => {
    mocks.stream.mockResolvedValue(Response.json(body, { status }));
    const response = await post();
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(mocks.media).not.toHaveBeenCalled();
    expect(mocks.otherProvider).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('answers a network failure with a refusal and no second dispatch', async () => {
    mocks.stream.mockRejectedValue(new TypeError('fetch failed'));
    const response = await post();
    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe('stream_interrupted');
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(mocks.otherProvider).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

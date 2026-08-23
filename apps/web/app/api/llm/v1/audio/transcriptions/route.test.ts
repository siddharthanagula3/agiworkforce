// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getModelMetadataById, getRoutingSlotModel } from '@agiworkforce/types';

const TRANSCRIPTION_MODEL = getModelMetadataById(getRoutingSlotModel('voice_transcription'))!;

const mocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  finalize: vi.fn(),
  providerStarted: vi.fn(),
  clientDelivered: vi.fn(),
  getSubscription: vi.fn(),
  neonDb: vi.fn(),
  fetch: vi.fn(),
  assertTierUnitAllowance: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn(() => null),
  getCorsHeaders: vi.fn(() => ({})),
  getSecurityHeaders: vi.fn(() => ({})),
}));
vi.mock('@/lib/managed-compute-gate', () => ({
  buildManagedComputeGateResponse: vi.fn(() => null),
  buildOrganizationPolicyGateResponse: vi.fn(async () => null),
  buildModelPolicyGateResponse: vi.fn(async () => null),
  buildSpendLimitGateResponse: vi.fn(async () => null),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@shared/utils/env', () => ({
  requireEnv: vi.fn(() => 'sk-test-openai-key'),
  getOptionalEnv: vi.fn(() => undefined),
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user-1' })),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: (...args: unknown[]) => mocks.neonDb(...args),
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: (...args: unknown[]) => mocks.getSubscription(...args) },
}));
vi.mock('@/lib/services/tier-unit-quota-service', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    assertTierUnitAllowance: (...args: unknown[]) => mocks.assertTierUnitAllowance(...args),
  };
});
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    reserveManagedUsageRequest: (...args: unknown[]) => mocks.reserve(...args),
    finalizeManagedUsageRequest: (...args: unknown[]) => mocks.finalize(...args),
    markManagedUsageProviderStarted: (...args: unknown[]) => mocks.providerStarted(...args),
    markManagedUsageClientDelivered: (...args: unknown[]) => mocks.clientDelivered(...args),
  };
});

const { POST, estimateAudioSeconds, estimateTranscriptionCostCents, settleTranscriptionTokens } =
  await import('./route');

function transcriptionRequest(headers: Record<string, string> = {}): NextRequest {
  const webmMagic = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
  const body = new FormData();
  body.append('file', new Blob([webmMagic, new Uint8Array(32)], { type: 'audio/webm' }), 'a.webm');
  return new NextRequest('http://localhost/api/llm/v1/audio/transcriptions', {
    method: 'POST',
    body,
    headers: { authorization: 'Bearer session-token', ...headers },
  });
}

function providerReturns(payload: unknown) {
  mocks.fetch.mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
    headers: new Headers({ 'content-type': 'application/json' }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.neonDb.mockReturnValue({ query: vi.fn() });
  mocks.getSubscription.mockResolvedValue({ plan_tier: 'pro' });
  mocks.assertTierUnitAllowance.mockResolvedValue({
    unit: 'transcription_seconds',
    hardLimit: null,
    softLimit: null,
    consumed: 0,
    requested: 0,
    softLimitReached: false,
  });
  mocks.reserve.mockImplementation(async (input: { estimatedCostCents: number }) => ({
    db: { query: vi.fn() },
    userId: 'user-1',
    idempotencyKey: 'key-1',
    requestHash: 'hash-1',
    leaseToken: 'lease-1',
    estimatedCostCents: input.estimatedCostCents,
  }));
  mocks.finalize.mockResolvedValue({ requestStatus: 'completed', operationResult: 'finalized' });
  mocks.providerStarted.mockResolvedValue(undefined);
  mocks.clientDelivered.mockResolvedValue(undefined);
  vi.stubGlobal('fetch', mocks.fetch);
});

describe('POST /api/llm/v1/audio/transcriptions — managed usage accounting', () => {
  it('reserves credits before any provider spend', async () => {
    providerReturns({ text: 'hello' });

    const response = await POST(transcriptionRequest());

    expect(response.status).toBe(200);
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
    expect(mocks.reserve.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.fetch.mock.invocationCallOrder[0]!,
    );
    expect(mocks.reserve.mock.calls[0]![0]).toMatchObject({
      userId: 'user-1',
      provider: TRANSCRIPTION_MODEL.provider,
      model: TRANSCRIPTION_MODEL.id,
      planTier: 'pro',
    });
    expect(
      (mocks.reserve.mock.calls[0]![0] as { estimatedCostCents: number }).estimatedCostCents,
    ).toBeGreaterThan(0);
  });

  it('settles the reservation from the provider-reported token usage', async () => {
    providerReturns({
      text: 'hello',
      usage: { type: 'tokens', input_tokens: 400_000, output_tokens: 100_000 },
    });

    await POST(transcriptionRequest());

    expect(mocks.finalize).toHaveBeenCalledTimes(1);
    expect(mocks.finalize.mock.calls[0]![0]).toMatchObject({
      outcome: 'completed',
      actualCostCents: estimateTranscriptionCostCents(TRANSCRIPTION_MODEL, 400_000, 100_000),
      usage: {
        operation: 'transcription',
        model: TRANSCRIPTION_MODEL.id,
        inputTokens: 400_000,
        outputTokens: 100_000,
        usageSource: 'provider_tokens',
      },
    });
    expect(mocks.clientDelivered).toHaveBeenCalledTimes(1);
  });

  it('voids the reservation when the provider rejects the audio', async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Invalid audio format',
      headers: new Headers({ 'content-type': 'application/json' }),
    });

    const response = await POST(transcriptionRequest());

    expect(response.status).toBe(400);
    expect(mocks.finalize).toHaveBeenCalledTimes(1);
    expect(mocks.finalize.mock.calls[0]![0]).toMatchObject({
      outcome: 'failed',
      actualCostCents: 0,
      usage: { operation: 'transcription', reason: 'provider_failed' },
    });
  });

  it('voids the reservation when the provider call throws', async () => {
    mocks.fetch.mockRejectedValue(new Error('socket hang up'));

    await expect(POST(transcriptionRequest())).resolves.toBeDefined();

    expect(mocks.finalize.mock.calls[0]![0]).toMatchObject({
      outcome: 'failed',
      actualCostCents: 0,
      usage: { reason: 'provider_unreachable' },
    });
  });

  it('spends nothing at the provider when the reservation is declined', async () => {
    const { ManagedUsageRequestError } =
      await import('@/lib/services/managed-usage-request-service');
    mocks.reserve.mockRejectedValue(
      new ManagedUsageRequestError('no credits', 402, 'insufficient_credits'),
    );

    const response = await POST(transcriptionRequest());

    expect(response.status).toBe(402);
    expect(mocks.fetch).not.toHaveBeenCalled();
    const body = (await response.json()) as { error: { code: string; type: string } };
    expect(body.error.code).toBe('insufficient_credits');
    expect(body.error.type).toBe('insufficient_quota');
  });

  it('bills and transcribes for a developer API key, not just a session', async () => {
    providerReturns({ text: 'hello' });

    const response = await POST(transcriptionRequest({ authorization: 'Bearer sk_live_abc123' }));

    expect(response.status).toBe(200);
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('honours a caller-supplied Idempotency-Key and rejects a malformed one', async () => {
    providerReturns({ text: 'hello' });

    await POST(transcriptionRequest({ 'Idempotency-Key': 'agi.transcription.web.abc123' }));
    expect(mocks.reserve.mock.calls[0]![0]).toMatchObject({
      idempotencyKey: 'agi.transcription.web.abc123',
    });

    vi.clearAllMocks();
    const response = await POST(transcriptionRequest({ 'Idempotency-Key': 'short' }));
    expect(response.status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe('transcription cost model', () => {
  it('bounds duration by the lowest plausible byte rate for the container', () => {
    expect(estimateAudioSeconds(0, 'audio/webm')).toBe(1);
    expect(estimateAudioSeconds(20_000, 'audio/webm')).toBe(10);
    expect(estimateAudioSeconds(80_000, 'audio/wav')).toBe(10);
  });

  it('grants the uncompressed byte rate only when the magic bytes agree with the declared type', () => {
    const wavHead = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    const mp3Head = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(estimateAudioSeconds(80_000, 'audio/wav', wavHead)).toBe(10);
    expect(estimateAudioSeconds(80_000, 'audio/wav', mp3Head)).toBe(40);
    expect(estimateAudioSeconds(80_000, 'audio/mpeg', wavHead)).toBe(40);
  });

  it('prefers provider tokens, then provider duration, then the size-derived bound', () => {
    expect(
      settleTranscriptionTokens({ usage: { input_tokens: 10, output_tokens: 3 } }, 99),
    ).toEqual({ inputTokens: 10, outputTokens: 3, source: 'provider_tokens' });
    expect(settleTranscriptionTokens({ usage: { type: 'duration', seconds: 2 } }, 99)).toEqual({
      inputTokens: 80,
      outputTokens: 8,
      source: 'provider_duration',
    });
    expect(settleTranscriptionTokens({ text: 'hi' }, 3)).toEqual({
      inputTokens: 120,
      outputTokens: 12,
      source: 'estimated_duration',
    });
  });

  it('never settles a billed request at zero cents', () => {
    expect(estimateTranscriptionCostCents(TRANSCRIPTION_MODEL, 1, 0)).toBe(1);
    expect(estimateTranscriptionCostCents({ inputCost: 0, outputCost: 0 }, 1_000, 1_000)).toBe(0);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { recordSettledProviderCost } = vi.hoisted(() => ({
  recordSettledProviderCost: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/services/cogs-ledger-service', () => ({ recordSettledProviderCost }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: {
    calculateCost: vi.fn(
      (_p: string, _m: string, u: { promptTokens: number; completionTokens: number }) =>
        u.promptTokens + u.completionTokens,
    ),
  },
}));

import { recordLiveVoiceBackendCost } from '../live-voice-backend-cost';

/**
 * `AGI-32`. A live voice session delegates to a backend responses model with
 * web search, which the provider bills separately from the per-minute session
 * rate. Nothing reported it, so every token that model spent on every voice
 * session ever held was missing from `cogs_summary()`.
 *
 * The counts come from the client that held the WebRTC session, so they are
 * untrusted: a hostile or broken client must not be able to write an arbitrary
 * number into the ledger or bill the customer a second time.
 */
const BASE = {
  userId: 'user_1',
  provider: 'openai',
  sessionId: 'sess_1',
  backendModel: 'backend-model-under-test',
};

function rowFor(call = 0): Record<string, unknown> {
  return recordSettledProviderCost.mock.calls[call]![0] as Record<string, unknown>;
}

describe('live voice backend cost', () => {
  beforeEach(() => recordSettledProviderCost.mockClear());

  it('records the backend model spend the session rate never covered', async () => {
    await recordLiveVoiceBackendCost({
      ...BASE,
      reported: { inputTokens: 1_000, outputTokens: 200 },
    });

    expect(recordSettledProviderCost).toHaveBeenCalledTimes(1);
    expect(rowFor()).toMatchObject({ provider: 'openai', model: 'backend-model-under-test' });
  });

  it('never bills the customer twice for a session they already pay per minute', async () => {
    await recordLiveVoiceBackendCost({ ...BASE, reported: { inputTokens: 10, outputTokens: 10 } });

    expect(rowFor()['customerCanonicalCents']).toBe(0);
  });

  it('keys the row on the session so a retried close cannot double count', async () => {
    await recordLiveVoiceBackendCost({ ...BASE, reported: { inputTokens: 10, outputTokens: 10 } });

    expect(rowFor()['sourceRef']).toBe('live_voice_backend:sess_1');
  });

  it('writes nothing when the session delegated nothing', async () => {
    await recordLiveVoiceBackendCost({ ...BASE, reported: {} });

    expect(recordSettledProviderCost).not.toHaveBeenCalled();
  });

  it('clamps a client that claims an impossible number of tokens', async () => {
    await recordLiveVoiceBackendCost({
      ...BASE,
      reported: { inputTokens: 9e15, outputTokens: 0 },
    });

    const usage = rowFor()['usage'] as Record<string, number>;
    expect(usage['promptTokens']).toBe(10_000_000);
  });

  it('ignores negative and non-finite claims rather than trusting them', async () => {
    await recordLiveVoiceBackendCost({
      ...BASE,
      reported: { inputTokens: -500, outputTokens: Number.NaN },
    });

    expect(recordSettledProviderCost).not.toHaveBeenCalled();
  });

  it('never reports more cached tokens than input tokens', async () => {
    await recordLiveVoiceBackendCost({
      ...BASE,
      reported: { inputTokens: 100, outputTokens: 10, cachedTokens: 5_000 },
    });

    const usage = rowFor()['usage'] as Record<string, number>;
    expect(usage['cachedTokens']).toBe(100);
  });

  /**
   * The provider's own web_search has no published unit rate here, and pricing
   * it at Perplexity's or Google's would put a false number in the ledger under
   * a provider that never billed it. The count is kept so the gap is visible.
   */
  it('carries the search count without inventing a price for it', async () => {
    await recordLiveVoiceBackendCost({
      ...BASE,
      reported: { inputTokens: 100, outputTokens: 10, webSearchCalls: 3 },
    });

    const usage = rowFor()['usage'] as Record<string, unknown>;
    expect(usage['webSearchCalls']).toBe(3);
    expect(rowFor()['feature']).toBeUndefined();
  });

  it('prefers the model the provider reported over the configured slot', async () => {
    await recordLiveVoiceBackendCost({
      ...BASE,
      reported: { model: 'reported-model-under-test', inputTokens: 10, outputTokens: 10 },
    });

    expect(rowFor()['model']).toBe('reported-model-under-test');
  });

  it('marks the row as voice spend rather than an ordinary turn', async () => {
    await recordLiveVoiceBackendCost({ ...BASE, reported: { inputTokens: 10, outputTokens: 10 } });

    const usage = rowFor()['usage'] as Record<string, unknown>;
    expect(usage['delegatedFrom']).toBe('voice_live');
    expect(usage['sessionId']).toBe('sess_1');
  });

  it('does not throw when the ledger write fails, so the session still closes', async () => {
    recordSettledProviderCost.mockRejectedValueOnce(new Error('ledger down'));

    await expect(
      recordLiveVoiceBackendCost({ ...BASE, reported: { inputTokens: 10, outputTokens: 10 } }),
    ).resolves.toBeUndefined();
  });
});

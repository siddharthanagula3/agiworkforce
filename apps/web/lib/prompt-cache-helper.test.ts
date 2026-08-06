import { describe, expect, it } from 'vitest';

import { calculateCacheSavings, shouldEnablePromptCache } from './prompt-cache-helper';

const largeSystemRequest = {
  messages: [{ role: 'system', content: 'x'.repeat(5_000) }],
};

describe('shouldEnablePromptCache model ownership', () => {
  it('uses canonical catalog capability metadata for a known caching model', () => {
    expect(shouldEnablePromptCache(largeSystemRequest, 'gpt-5.6-sol')).toBe(true);
  });

  it('does not infer caching from the name of an unregistered model', () => {
    expect(shouldEnablePromptCache(largeSystemRequest, 'claude-future-unknown')).toBe(false);
    expect(shouldEnablePromptCache(largeSystemRequest, 'gpt-future-unknown')).toBe(false);
  });

  it('uses the Opus 5 provider minimum of 512 tokens', () => {
    const exactly512Tokens = {
      messages: [{ role: 'system', content: 'x'.repeat(512 * 4) }],
    };

    expect(shouldEnablePromptCache(exactly512Tokens, 'claude-opus-5')).toBe(true);
  });
});

describe('calculateCacheSavings cache-write reporting', () => {
  const response = { cachedInputTokens: 1_000_000, cacheCreationInputTokens: 1_000_000 };

  it('reports the caller-resolved write price rather than a fixed surcharge', () => {
    // gpt-5.6-terra: $2/M input, $2.5/M declared write → 1M writes = $2.50 = 250 cents.
    const metrics = calculateCacheSavings(response, 2, 2.5);
    expect(metrics.cacheWriteCostCents).toBe(250);
    // Read savings are unchanged: 1M * ($2 - $0.2) = $1.80 = 180 cents.
    expect(metrics.savedCostCents).toBe(180);
    expect(metrics.tokensSavedByCache).toBe(1_000_000);
  });

  it('reports a free write as the plain input cost when no write price is declared', () => {
    // Pre-GPT-5.6 OpenAI: the resolved write rate IS the input rate, so 1M
    // written tokens are reported at $0.75/M = 75 cents, not the 1.25x $0.9375.
    expect(calculateCacheSavings(response, 0.75, 0.75).cacheWriteCostCents).toBe(75);
  });

  it('keeps the Anthropic 1.25x surcharge for callers with no model context', () => {
    // Default parameter: 1M * $3 * 1.25 = $3.75 = 375 cents.
    expect(calculateCacheSavings(response, 3).cacheWriteCostCents).toBe(375);
  });
});

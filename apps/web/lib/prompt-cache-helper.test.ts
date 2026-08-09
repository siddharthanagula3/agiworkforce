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
  const response = {
    model: 'gpt-5.6-terra',
    cachedInputTokens: 1_000_000,
    cacheCreationInputTokens: 1_000_000,
  };

  it('reports the caller-resolved write price rather than a fixed surcharge', () => {
    // gpt-5.6-terra: $2/M input, $2.5/M declared write → 1M writes = $2.50 = 250 cents.
    const metrics = calculateCacheSavings(response, 2, 2.5);
    expect(metrics.cacheWriteCostCents).toBe(250);
    // Read savings come from the model's own $0.2/M read price:
    // 1M * ($2 - $0.2) = $1.80 = 180 cents.
    expect(metrics.savedCostCents).toBe(180);
    expect(metrics.tokensSavedByCache).toBe(1_000_000);
  });

  it('reports a free write as the plain input cost when no write price is declared', () => {
    // Pre-GPT-5.6 OpenAI: the resolved write rate IS the input rate, so 1M
    // written tokens are reported at $0.75/M = 75 cents, not the 1.25x $0.9375.
    expect(
      calculateCacheSavings({ ...response, model: 'gpt-5.4-mini' }, 0.75, 0.75).cacheWriteCostCents,
    ).toBe(75);
  });

  it('keeps the Anthropic 1.25x surcharge for callers with no model context', () => {
    // No model and no resolved write rate: the default parameter applies,
    // 1M * $3 * 1.25 = $3.75 = 375 cents.
    const { model: _model, ...withoutModel } = response;
    expect(calculateCacheSavings(withoutModel, 3).cacheWriteCostCents).toBe(375);
  });

  it('reports no read saving when the caller supplies no model', () => {
    // Without a model there is no published read price to look up, so the read
    // falls back to the input rate and the saving is zero rather than the 90%
    // a flat multiplier used to invent.
    const { model: _model, ...withoutModel } = response;
    expect(calculateCacheSavings(withoutModel, 3).savedCostCents).toBe(0);
  });
});

describe('calculateCacheSavings cache-read savings', () => {
  it("reports the model's published read discount, not a flat 10%", () => {
    // deepseek-v4-flash: $0.14/M input, $0.0028/M read — a 98% discount.
    // 1M reads save $0.1372 = 13.72 cents, which rounds to 14; a flat 0.1x
    // multiplier would report the 12.6-cent saving of a discount DeepSeek
    // does not charge.
    const metrics = calculateCacheSavings(
      { model: 'deepseek-v4-flash', cachedInputTokens: 1_000_000 },
      0.14,
    );
    expect(metrics.savedCostCents).toBe(14);
  });

  it('reports no saving for a caching model that publishes no read price', () => {
    // minimax-m3 declares caching with no cached_input, so its reads bill at
    // the full input rate on every surface — there is nothing to report saved.
    const metrics = calculateCacheSavings(
      { model: 'minimax-m3', cachedInputTokens: 1_000_000 },
      0.3,
    );
    expect(metrics.savedCostCents).toBe(0);
  });
});

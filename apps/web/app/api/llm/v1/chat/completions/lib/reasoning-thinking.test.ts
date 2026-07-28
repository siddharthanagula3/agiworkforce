import { describe, it, expect } from 'vitest';
import {
  anthropicUsesAdaptiveThinking,
  buildThinkingConfig,
  resolveRequestEffort,
} from './request-processor';

/**
 * Reasoning-effort-capability wave (2026-07-10): the Anthropic thinking request
 * path is driven by per-model `reasoning.control`, NOT just capabilities.thinking.
 *   - Opus 5 / Sonnet 5 (effort_levels) → adaptive thinking; classic
 *     enabled+budget is not a valid request shape.
 *   - The classic `thinking_budget` path (enabled+budget, NOT adaptive) has no
 *     test here because it has no model. Haiku 4.5 was its only Anthropic
 *     holder and was retired 2026-07-27; every remaining Anthropic model uses
 *     `effort_levels`. The branch is kept in the code for a future model that
 *     controls thinking by budget, but asserting it now would mean inventing
 *     a model the catalog does not have.
 * See docs/research/reasoning-effort-capability-matrix-2026-07-10.md flags 2 & 3.
 */
describe('anthropicUsesAdaptiveThinking (control-driven)', () => {
  it('returns adaptive for Opus 5', () => {
    expect(anthropicUsesAdaptiveThinking('claude-opus-5')).toBe(true);
  });

  it('returns adaptive for Sonnet 5', () => {
    expect(anthropicUsesAdaptiveThinking('claude-sonnet-5')).toBe(true);
  });
});

describe('buildThinkingConfig (Anthropic)', () => {
  it('sends adaptive thinking when Opus 5 is explicitly enabled', () => {
    const cfg = buildThinkingConfig({
      provider: 'anthropic',
      model: 'claude-opus-5',
      explicitThinking: undefined,
      thinkingMode: true,
      effort: 'high',
    });
    expect(cfg).toEqual({ type: 'adaptive' });
  });

  it('sends an explicit disabled shape when the Opus 5 toggle is off', () => {
    const cfg = buildThinkingConfig({
      provider: 'anthropic',
      model: 'claude-opus-5',
      explicitThinking: undefined,
      thinkingMode: false,
      effort: 'high',
    });
    expect(cfg).toEqual({ type: 'disabled' });
  });

  it.each(['xhigh', 'max'] as const)(
    'rejects disabled Opus 5 thinking at %s effort before the provider call',
    (effort) => {
      expect(() =>
        buildThinkingConfig({
          provider: 'anthropic',
          model: 'claude-opus-5',
          explicitThinking: undefined,
          thinkingMode: false,
          effort,
        }),
      ).toThrow(/thinking.*disabled.*high/i);
    },
  );

  it('preserves an explicit disabled block for Opus 5', () => {
    const cfg = buildThinkingConfig({
      provider: 'anthropic',
      model: 'claude-opus-5',
      explicitThinking: { type: 'disabled' },
      thinkingMode: true,
      effort: 'high',
    });
    expect(cfg).toEqual({ type: 'disabled' });
  });

  it('rewrites an explicit classic thinking block to adaptive for Opus 5', () => {
    const cfg = buildThinkingConfig({
      provider: 'anthropic',
      model: 'claude-opus-5',
      explicitThinking: { type: 'enabled', budget_tokens: 8192 },
      thinkingMode: true,
      effort: 'high',
    });
    expect(cfg).toEqual({ type: 'adaptive' });
  });

  it('returns undefined for a non-Anthropic provider', () => {
    expect(
      buildThinkingConfig({
        provider: 'openai',
        model: 'gpt-5.6-sol',
        explicitThinking: undefined,
        thinkingMode: true,
        effort: 'high',
      }),
    ).toBeUndefined();
  });
});

describe('resolveRequestEffort (catalog-driven)', () => {
  it('preserves max for an OpenAI model whose registry entry supports it', () => {
    expect(resolveRequestEffort('openai', 'gpt-5.6-sol', 'max')).toBe('max');
  });

  it('drops an effort for a model without a registry entry (fail closed)', () => {
    expect(resolveRequestEffort('openai', 'unregistered-openai-model', 'max')).toBeUndefined();
  });

  it('does not attach reasoning effort to a catalog non-reasoning model', () => {
    expect(resolveRequestEffort('openai', 'gpt-image-2', 'high')).toBeUndefined();
  });

  it('preserves provider-supported none and minimal effort values', () => {
    expect(resolveRequestEffort('openai', 'gpt-5.6-luna', 'none')).toBe('none');
    expect(resolveRequestEffort('google', 'gemini-3.5-flash-lite', 'minimal')).toBe('minimal');
  });
});

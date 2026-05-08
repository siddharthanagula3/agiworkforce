/**
 * providerSwitchGuard.test.ts — Unit tests for Pro+ cross-provider switch guard.
 *
 * Tests:
 *   - extractProvider: model ID → normalized provider token
 *   - guardProviderSwitch: allow / upgrade-required decision logic
 *   - tierResolver helpers: tierAtLeast, TIER_ORDER
 */

import { describe, it, expect } from 'vitest';
import { extractProvider, guardProviderSwitch } from '../services/providerSwitchGuard';
import { tierAtLeast, TIER_ORDER } from '../services/tierResolver';

// ─── extractProvider ──────────────────────────────────────────────────────────

describe('extractProvider', () => {
  it('identifies Anthropic models by claude- prefix', () => {
    expect(extractProvider('claude-opus-4-6')).toBe('anthropic');
    expect(extractProvider('claude-sonnet-4.6')).toBe('anthropic');
    expect(extractProvider('claude-haiku-4.5')).toBe('anthropic');
  });

  it('identifies OpenAI models by gpt- prefix', () => {
    expect(extractProvider('gpt-5.5')).toBe('openai');
    expect(extractProvider('gpt-5.5-mini')).toBe('openai');
    expect(extractProvider('gpt-4o')).toBe('openai');
  });

  it('identifies OpenAI o-series by o[1-9]- prefix', () => {
    expect(extractProvider('o1-mini')).toBe('openai');
    expect(extractProvider('o3-mini')).toBe('openai');
    expect(extractProvider('o4-preview')).toBe('openai');
  });

  it('identifies Google models by gemini- prefix', () => {
    expect(extractProvider('gemini-3.1-pro-preview')).toBe('google');
    expect(extractProvider('gemini-3.1-flash-lite')).toBe('google');
  });

  it('identifies xAI models by grok- prefix', () => {
    expect(extractProvider('grok-4')).toBe('xai');
  });

  it('identifies DeepSeek models by deepseek- prefix', () => {
    expect(extractProvider('deepseek-chat')).toBe('deepseek');
    expect(extractProvider('deepseek-reasoner')).toBe('deepseek');
  });

  it('identifies Qwen models by qwen- prefix', () => {
    expect(extractProvider('qwen-max')).toBe('qwen');
  });

  it('identifies Moonshot/Kimi models', () => {
    expect(extractProvider('kimi-k2.5-thinking')).toBe('moonshot');
    expect(extractProvider('moonshot-v1')).toBe('moonshot');
  });

  it('identifies Zhipu models by glm- prefix', () => {
    expect(extractProvider('glm-4.7')).toBe('zhipu');
  });

  it('returns auto for auto-* model IDs', () => {
    expect(extractProvider('auto-balanced')).toBe('auto');
    expect(extractProvider('auto-economy')).toBe('auto');
    expect(extractProvider('auto-premium')).toBe('auto');
    expect(extractProvider('auto')).toBe('auto');
  });

  it('returns unknown for unrecognized model IDs', () => {
    expect(extractProvider('llama3')).toBe('unknown');
    expect(extractProvider('phi3')).toBe('unknown');
    expect(extractProvider('')).toBe('unknown');
  });
});

// ─── guardProviderSwitch ──────────────────────────────────────────────────────

describe('guardProviderSwitch — same-provider switches are always allowed', () => {
  const TIERS = ['local', 'byok', 'hobby', 'pro', 'pro_plus', 'max'] as const;

  for (const tier of TIERS) {
    it(`allows claude→claude on tier=${tier}`, () => {
      expect(guardProviderSwitch('claude-opus-4-6', 'claude-sonnet-4.6', tier)).toBe('allow');
    });

    it(`allows gpt→gpt on tier=${tier}`, () => {
      expect(guardProviderSwitch('gpt-5.5', 'gpt-5.5-mini', tier)).toBe('allow');
    });
  }
});

describe('guardProviderSwitch — auto-mode switches are always allowed', () => {
  const TIERS = ['local', 'byok', 'hobby', 'pro', 'pro_plus', 'max'] as const;

  for (const tier of TIERS) {
    it(`allows claude→auto-balanced on tier=${tier}`, () => {
      expect(guardProviderSwitch('claude-opus-4-6', 'auto-balanced', tier)).toBe('allow');
    });

    it(`allows auto-balanced→gpt on tier=${tier}`, () => {
      expect(guardProviderSwitch('auto-balanced', 'gpt-5.5', tier)).toBe('allow');
    });
  }
});

describe('guardProviderSwitch — cross-provider switch gating', () => {
  const BLOCKED_TIERS = ['local', 'byok', 'hobby', 'pro'] as const;
  const ALLOWED_TIERS = ['pro_plus', 'max'] as const;

  for (const tier of BLOCKED_TIERS) {
    it(`blocks claude→gpt on tier=${tier}`, () => {
      expect(guardProviderSwitch('claude-opus-4-6', 'gpt-5.5', tier)).toBe('upgrade-required');
    });

    it(`blocks gpt→gemini on tier=${tier}`, () => {
      expect(guardProviderSwitch('gpt-5.5', 'gemini-3.1-pro-preview', tier)).toBe(
        'upgrade-required',
      );
    });

    it(`blocks claude→grok on tier=${tier}`, () => {
      expect(guardProviderSwitch('claude-opus-4-6', 'grok-4', tier)).toBe('upgrade-required');
    });
  }

  for (const tier of ALLOWED_TIERS) {
    it(`allows claude→gpt on tier=${tier}`, () => {
      expect(guardProviderSwitch('claude-opus-4-6', 'gpt-5.5', tier)).toBe('allow');
    });

    it(`allows gpt→gemini on tier=${tier}`, () => {
      expect(guardProviderSwitch('gpt-5.5', 'gemini-3.1-pro-preview', tier)).toBe('allow');
    });
  }
});

describe('guardProviderSwitch — unknown provider does not trigger gate', () => {
  it('allows unknown→claude (unknown side is never gated)', () => {
    expect(guardProviderSwitch('llama3', 'claude-opus-4-6', 'byok')).toBe('allow');
  });

  it('allows claude→unknown on byok', () => {
    expect(guardProviderSwitch('claude-opus-4-6', 'llama3', 'byok')).toBe('allow');
  });
});

// ─── tierAtLeast ─────────────────────────────────────────────────────────────

describe('tierAtLeast', () => {
  it('byok is NOT at least pro_plus', () => {
    expect(tierAtLeast('byok', 'pro_plus')).toBe(false);
  });

  it('pro is NOT at least pro_plus', () => {
    expect(tierAtLeast('pro', 'pro_plus')).toBe(false);
  });

  it('pro_plus is at least pro_plus', () => {
    expect(tierAtLeast('pro_plus', 'pro_plus')).toBe(true);
  });

  it('max is at least pro_plus', () => {
    expect(tierAtLeast('max', 'pro_plus')).toBe(true);
  });

  it('any tier is at least itself', () => {
    for (const tier of TIER_ORDER) {
      expect(tierAtLeast(tier, tier)).toBe(true);
    }
  });

  it('TIER_ORDER has the expected sequence', () => {
    expect(TIER_ORDER).toEqual(['local', 'byok', 'hobby', 'pro', 'pro_plus', 'max']);
  });
});

import { getCoreManualModelOptions } from '@agiworkforce/types';
import { describe, it, expect } from 'vitest';
import { extractProvider, guardProviderSwitch } from '../integrations/providerSwitchGuard';
import { tierAtLeast, TIER_ORDER } from '../integrations/tierResolver';
import { requireCatalogModel, SYNTHETIC_LOCAL_MODEL_ID } from './catalogModelFixtures';

const CATALOG_MODELS = getCoreManualModelOptions();
const ANTHROPIC_PRIMARY = requireCatalogModel('anthropic').id;
const ANTHROPIC_SECONDARY = requireCatalogModel('anthropic', 1).id;
const OPENAI_PRIMARY = requireCatalogModel('openai').id;
const OPENAI_SECONDARY = requireCatalogModel('openai', 1).id;
const GOOGLE_PRIMARY = requireCatalogModel('google').id;
const XAI_PRIMARY = requireCatalogModel('xai').id;
const SYNTHETIC_UNKNOWN_MODEL_ID = 'fixture-unknown-model';

describe('extractProvider', () => {
  it('derives every manual model provider from canonical catalog metadata', () => {
    expect(CATALOG_MODELS.length).toBeGreaterThan(0);
    for (const model of CATALOG_MODELS) {
      expect(extractProvider(model.id)).toBe(String(model.provider));
    }
  });

  it('returns auto for auto-* model IDs', () => {
    expect(extractProvider('auto-balanced')).toBe('auto');
    expect(extractProvider('auto-economy')).toBe('auto');
    expect(extractProvider('auto-premium')).toBe('auto');
    expect(extractProvider('auto')).toBe('auto');
  });

  it('returns unknown for unrecognized model IDs', () => {
    expect(extractProvider(SYNTHETIC_LOCAL_MODEL_ID)).toBe('unknown');
    expect(extractProvider(SYNTHETIC_UNKNOWN_MODEL_ID)).toBe('unknown');
    expect(extractProvider('')).toBe('unknown');
  });
});

describe('guardProviderSwitch, same-provider switches are always allowed', () => {
  const TIERS = [
    'local',
    'byok',
    'free',
    'basic',
    'pro',
    'team',
    'max',
    'max_15x',
    'enterprise',
  ] as const;

  for (const tier of TIERS) {
    it(`allows Anthropic→Anthropic on tier=${tier}`, () => {
      expect(guardProviderSwitch(ANTHROPIC_PRIMARY, ANTHROPIC_SECONDARY, tier)).toBe('allow');
    });

    it(`allows OpenAI→OpenAI on tier=${tier}`, () => {
      expect(guardProviderSwitch(OPENAI_PRIMARY, OPENAI_SECONDARY, tier)).toBe('allow');
    });
  }
});

describe('guardProviderSwitch, auto-mode switches are always allowed', () => {
  const TIERS = [
    'local',
    'byok',
    'free',
    'basic',
    'pro',
    'team',
    'max',
    'max_15x',
    'enterprise',
  ] as const;

  for (const tier of TIERS) {
    it(`allows Anthropic→auto-balanced on tier=${tier}`, () => {
      expect(guardProviderSwitch(ANTHROPIC_PRIMARY, 'auto-balanced', tier)).toBe('allow');
    });

    it(`allows auto-balanced→OpenAI on tier=${tier}`, () => {
      expect(guardProviderSwitch('auto-balanced', OPENAI_PRIMARY, tier)).toBe('allow');
    });
  }
});

describe('guardProviderSwitch, cross-provider switch gating', () => {
  const BLOCKED_TIERS = ['local', 'byok', 'free', 'basic', 'pro', 'team'] as const;
  const ALLOWED_TIERS = ['max', 'max_15x', 'enterprise'] as const;

  for (const tier of BLOCKED_TIERS) {
    it(`blocks Anthropic→OpenAI on tier=${tier}`, () => {
      expect(guardProviderSwitch(ANTHROPIC_PRIMARY, OPENAI_PRIMARY, tier)).toBe('upgrade-required');
    });

    it(`blocks OpenAI→Google on tier=${tier}`, () => {
      expect(guardProviderSwitch(OPENAI_PRIMARY, GOOGLE_PRIMARY, tier)).toBe('upgrade-required');
    });

    it(`blocks Anthropic→xAI on tier=${tier}`, () => {
      expect(guardProviderSwitch(ANTHROPIC_PRIMARY, XAI_PRIMARY, tier)).toBe('upgrade-required');
    });
  }

  for (const tier of ALLOWED_TIERS) {
    it(`allows Anthropic→OpenAI on tier=${tier}`, () => {
      expect(guardProviderSwitch(ANTHROPIC_PRIMARY, OPENAI_PRIMARY, tier)).toBe('allow');
    });

    it(`allows OpenAI→Google on tier=${tier}`, () => {
      expect(guardProviderSwitch(OPENAI_PRIMARY, GOOGLE_PRIMARY, tier)).toBe('allow');
    });
  }
});

describe('guardProviderSwitch, unknown provider does not trigger gate', () => {
  it('allows unknown→catalog model (unknown side is never gated)', () => {
    expect(guardProviderSwitch(SYNTHETIC_LOCAL_MODEL_ID, ANTHROPIC_PRIMARY, 'byok')).toBe('allow');
  });

  it('allows catalog model→unknown on byok', () => {
    expect(guardProviderSwitch(ANTHROPIC_PRIMARY, SYNTHETIC_UNKNOWN_MODEL_ID, 'byok')).toBe(
      'allow',
    );
  });
});

describe('tierAtLeast', () => {
  it('byok is NOT at least max', () => {
    expect(tierAtLeast('byok', 'max')).toBe(false);
  });

  it('pro is NOT at least max', () => {
    expect(tierAtLeast('pro', 'max')).toBe(false);
  });

  it('max is at least max', () => {
    expect(tierAtLeast('max', 'max')).toBe(true);
  });

  it('any tier is at least itself', () => {
    for (const tier of TIER_ORDER) {
      expect(tierAtLeast(tier, tier)).toBe(true);
    }
  });

  it('TIER_ORDER has the expected sequence', () => {
    expect(TIER_ORDER).toEqual([
      'local',
      'byok',
      'free',
      'basic',
      'pro',
      'team',
      'max',
      'max_15x',
      'enterprise',
    ]);
  });
});

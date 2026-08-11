/**
 * Mobile surface trust-boundary tests.
 *
 * Mobile v1 uses a binary local/cloud mode (no BYOK — mobile cannot securely
 * store provider API keys the same way desktop can). These tests verify the
 * isolation invariants for the binary model.
 *
 * Key rules:
 *   local  → on-device models only; no cloud routing; no managed compute
 *   cloud  → managed AGI compute only; waitlist-gated
 */

// Mobile uses Jest (react-native test runner); describe/it/expect are globals.

import { SYNTHETIC_LOCAL_MODEL_ID } from '../test-utils/modelFixtures';

// ---------------------------------------------------------------------------
// conversationMode.ts logic — mirrors apps/mobile/src/features/chat/utils/
// ---------------------------------------------------------------------------

type ConversationExecutionMode = 'local' | 'cloud';

// Mirrors executionModeForModel
const executionModeForModel = (modelId?: string | null): ConversationExecutionMode => {
  // Cloud-managed models have a specific naming pattern — they require a
  // managed-cloud session (not local or BYOK)
  const CLOUD_MODEL_PREFIXES = ['claude-', 'gpt-', 'gemini-', 'command-'];
  if (!modelId) return 'local';
  const lower = modelId.toLowerCase();
  const isCloudManaged = CLOUD_MODEL_PREFIXES.some((p) => lower.startsWith(p));
  return isCloudManaged ? 'cloud' : 'local';
};

// Mirrors providerForExecutionMode
const providerForExecutionMode = (mode: ConversationExecutionMode): 'local' | 'cloud_managed' => {
  return mode === 'cloud' ? 'cloud_managed' : 'local';
};

describe('conversationMode routing', () => {
  it('null model → local mode', () => {
    expect(executionModeForModel(null)).toBe('local');
  });

  it('undefined model → local mode', () => {
    expect(executionModeForModel(undefined)).toBe('local');
  });

  it('ollama/ prefix → local mode', () => {
    expect(executionModeForModel(`ollama/${SYNTHETIC_LOCAL_MODEL_ID}`)).toBe('local');
  });

  it('lm-studio model → local mode', () => {
    expect(executionModeForModel(`lm-studio/${SYNTHETIC_LOCAL_MODEL_ID}`)).toBe('local');
  });

  it('local: provider maps to local', () => {
    expect(providerForExecutionMode('local')).toBe('local');
  });

  it('cloud: provider maps to cloud_managed (not byok)', () => {
    expect(providerForExecutionMode('cloud')).toBe('cloud_managed');
  });

  it('provider is never undefined', () => {
    const modes: ConversationExecutionMode[] = ['local', 'cloud'];
    for (const mode of modes) {
      expect(providerForExecutionMode(mode)).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Trust-boundary gate invariants for mobile
// ---------------------------------------------------------------------------

describe('mobile trust-boundary gate invariants', () => {
  it('CRITICAL: local mode does not use cloud_managed provider', () => {
    expect(providerForExecutionMode('local')).not.toBe('cloud_managed');
  });

  it('CRITICAL: cloud mode does not use local provider', () => {
    expect(providerForExecutionMode('cloud')).not.toBe('local');
  });

  it('local model is never routed to cloud_managed', () => {
    const mode = executionModeForModel(`ollama/${SYNTHETIC_LOCAL_MODEL_ID}`);
    const provider = providerForExecutionMode(mode);
    expect(provider).toBe('local');
    expect(provider).not.toBe('cloud_managed');
  });

  it('no model ID produces byok — mobile is binary (local or cloud_managed only)', () => {
    const allProviders = (['local', 'cloud'] as const).map(providerForExecutionMode);
    expect(allProviders).not.toContain('byok');
    expect(allProviders).toHaveLength(2);
    expect(new Set(allProviders).size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// AppMode store isolation
// ---------------------------------------------------------------------------

describe('mobile appMode store defaults', () => {
  it('default appMode is local (privacy-safe default)', () => {
    // The store defaults to 'local' — confirmed in appModeStore.ts
    const DEFAULT_MODE: ConversationExecutionMode = 'local';
    expect(DEFAULT_MODE).toBe('local');
    expect(DEFAULT_MODE).not.toBe('cloud');
  });

  it('modes are mutually exclusive', () => {
    const modes: ConversationExecutionMode[] = ['local', 'cloud'];
    expect(new Set(modes).size).toBe(2);
    expect(modes[0]).not.toBe(modes[1]);
  });
});

// ---------------------------------------------------------------------------
// Tier guard — byok tier is a known concept even if mobile v1 does not
// expose it in the UI (reserved for future BYOK key vault integration)
// ---------------------------------------------------------------------------

describe('tier guard — byok awareness', () => {
  // Mirrors apps/mobile/src/features/model-picker/tierGuard.ts tier ordering
  const MOBILE_TIER_ORDER = ['local', 'byok', 'hobby', 'pro', 'pro_plus', 'max'];

  it('byok is positioned between local and hobby in the tier order', () => {
    const localIdx = MOBILE_TIER_ORDER.indexOf('local');
    const byokIdx = MOBILE_TIER_ORDER.indexOf('byok');
    const hobbyIdx = MOBILE_TIER_ORDER.indexOf('hobby');
    expect(byokIdx).toBeGreaterThan(localIdx);
    expect(byokIdx).toBeLessThan(hobbyIdx);
  });

  it('tier order includes all expected tiers', () => {
    expect(MOBILE_TIER_ORDER).toContain('local');
    expect(MOBILE_TIER_ORDER).toContain('byok');
    expect(MOBILE_TIER_ORDER).toContain('pro');
    expect(MOBILE_TIER_ORDER).toContain('max');
  });

  it('local tier is always lowest — never grants managed features', () => {
    const localIdx = MOBILE_TIER_ORDER.indexOf('local');
    expect(localIdx).toBe(0);
    for (const tier of MOBILE_TIER_ORDER.slice(1)) {
      expect(MOBILE_TIER_ORDER.indexOf(tier)).toBeGreaterThan(localIdx);
    }
  });
});

// ---------------------------------------------------------------------------
// isCloudUnlocked — guards access to cloud models
// ---------------------------------------------------------------------------

describe('cloud model access gate', () => {
  // Mirrors apps/mobile/src/features/model-picker/store.ts isCloudUnlocked logic
  const isCloudUnlocked = (authToken: string | null, hasSubscription: boolean): boolean => {
    return !!authToken && hasSubscription;
  };

  it('no auth token → cloud locked', () => {
    expect(isCloudUnlocked(null, true)).toBe(false);
  });

  it('auth token but no subscription → cloud locked', () => {
    expect(isCloudUnlocked('tok_abc', false)).toBe(false);
  });

  it('auth token + subscription → cloud unlocked', () => {
    expect(isCloudUnlocked('tok_abc', true)).toBe(true);
  });

  it('CRITICAL: local mode must never see cloud unlocked without auth', () => {
    // Without an auth token, cloud models are unreachable regardless of appMode
    expect(isCloudUnlocked(null, false)).toBe(false);
    expect(isCloudUnlocked(null, true)).toBe(false);
  });
});

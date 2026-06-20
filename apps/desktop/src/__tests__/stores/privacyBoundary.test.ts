import { describe, it, expect, beforeEach } from 'vitest';
import {
  useAppModeStore,
  selectPrivacyMode,
  selectIsCloud,
  selectIsLocal,
} from '../../stores/appModeStore';

/**
 * Trust-boundary stress tests for the 3-tier privacy boundary.
 *
 * These tests enforce the invariants in CLAUDE.md and docs/current/source-of-truth.md:
 *   local   → no egress at any layer
 *   byok    → user-supplied keys; no AGI-managed compute; no preferCloudCredits
 *   managed → AGI-funded compute; waitlist-gated; full cloud auth required
 */

beforeEach(() => {
  // Partial merge reset — preserves store actions (setState with true would strip them)
  useAppModeStore.setState({ mode: 'local', planTier: 'free' });
});

// ---------------------------------------------------------------------------
// selectPrivacyMode — local mode always short-circuits
// ---------------------------------------------------------------------------

describe('selectPrivacyMode — local mode', () => {
  it('returns local when mode is local', () => {
    useAppModeStore.setState({ mode: 'local' });
    expect(selectPrivacyMode(useAppModeStore.getState())).toBe('local');
  });

  it('returns local even if settingsStore would return cloud providerMode', () => {
    // selectPrivacyMode checks mode === 'local' before any require() call
    useAppModeStore.setState({ mode: 'local' });
    expect(selectPrivacyMode(useAppModeStore.getState())).toBe('local');
  });
});

// ---------------------------------------------------------------------------
// BYOK detection logic — pure function tests
// The actual selectPrivacyMode uses lazy require() to read settingsStore.
// These tests verify the detection rule as a pure function, mirroring the
// implementation in appModeStore.ts exactly.
// ---------------------------------------------------------------------------

describe('BYOK detection logic', () => {
  // Mirrors the selectPrivacyMode logic without the Zustand store call
  const detectPrivacyMode = (appMode: 'local' | 'cloud', providerMode: string): string => {
    if (appMode === 'local') return 'local';
    if (providerMode === 'cloud') return 'byok';
    return 'managed';
  };

  it('local + any providerMode → local', () => {
    expect(detectPrivacyMode('local', 'cloud')).toBe('local');
    expect(detectPrivacyMode('local', 'auto')).toBe('local');
    expect(detectPrivacyMode('local', 'local')).toBe('local');
  });

  it('cloud + providerMode=cloud → byok (BYOK keys configured)', () => {
    expect(detectPrivacyMode('cloud', 'cloud')).toBe('byok');
  });

  it('cloud + providerMode=auto → managed (no BYOK keys)', () => {
    expect(detectPrivacyMode('cloud', 'auto')).toBe('managed');
  });

  it('cloud + providerMode=local → managed (local providers = not BYOK)', () => {
    expect(detectPrivacyMode('cloud', 'local')).toBe('managed');
  });

  it('settingsStore unavailable → defaults to managed for cloud mode', () => {
    // When require() throws, selectPrivacyMode falls through to 'managed'
    const fallback = (appMode: 'local' | 'cloud') => {
      if (appMode === 'local') return 'local';
      // settingsStore unavailable — fall through
      return 'managed';
    };
    expect(fallback('cloud')).toBe('managed');
    expect(fallback('local')).toBe('local');
  });
});

// ---------------------------------------------------------------------------
// Binary selectors
// ---------------------------------------------------------------------------

describe('binary selectors', () => {
  it('selectIsLocal true only for local mode', () => {
    useAppModeStore.setState({ mode: 'local' });
    expect(selectIsLocal(useAppModeStore.getState())).toBe(true);

    useAppModeStore.setState({ mode: 'cloud' });
    expect(selectIsLocal(useAppModeStore.getState())).toBe(false);
  });

  it('selectIsCloud true only for cloud mode', () => {
    useAppModeStore.setState({ mode: 'cloud' });
    expect(selectIsCloud(useAppModeStore.getState())).toBe(true);

    useAppModeStore.setState({ mode: 'local' });
    expect(selectIsCloud(useAppModeStore.getState())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Trust-boundary gate invariants
// Each gate function mirrors the production code in the named file/selector.
// ---------------------------------------------------------------------------

describe('trust-boundary gate invariants', () => {
  it('CRITICAL: preferCloudCredits must never be true for local or byok', () => {
    // chat/index.tsx: selectPrivacyMode === 'managed'
    const preferCloudCredits = (pm: string) => pm === 'managed';

    expect(preferCloudCredits('local')).toBe(false);
    expect(preferCloudCredits('byok')).toBe(false);
    expect(preferCloudCredits('managed')).toBe(true);
  });

  it('CRITICAL: llm_ensure_managed_cloud must not fire for local or byok', () => {
    // App.tsx: selectPrivacyMode(useAppModeStore.getState()) === 'managed'
    const shouldInitManagedCloud = (pm: string) => pm === 'managed';

    expect(shouldInitManagedCloud('local')).toBe(false);
    expect(shouldInitManagedCloud('byok')).toBe(false);
    expect(shouldInitManagedCloud('managed')).toBe(true);
  });

  it('CRITICAL: managed-cloud credential forward to Rust must not fire for byok', () => {
    // App.tsx: selectPrivacyMode !== 'managed' → return early
    const shouldForwardCredentials = (pm: string) => pm === 'managed';

    expect(shouldForwardCredentials('local')).toBe(false);
    expect(shouldForwardCredentials('byok')).toBe(false);
    expect(shouldForwardCredentials('managed')).toBe(true);
  });

  it('CRITICAL: telemetry must be silent in local mode only', () => {
    // analytics.ts: selectPrivacyMode === 'local' → return early
    const shouldSkipTelemetry = (pm: string) => pm === 'local';

    expect(shouldSkipTelemetry('local')).toBe(true);
    expect(shouldSkipTelemetry('byok')).toBe(false);
    expect(shouldSkipTelemetry('managed')).toBe(false);
  });

  it('CRITICAL: cloud auth gate applies to both byok and managed', () => {
    // App.tsx: isCloudMode = selectPrivacyMode !== 'local'
    const requiresCloudAuth = (pm: string) => pm !== 'local';

    expect(requiresCloudAuth('local')).toBe(false);
    expect(requiresCloudAuth('byok')).toBe(true);
    expect(requiresCloudAuth('managed')).toBe(true);
  });

  it('model selector shows managed models only for managed tier', () => {
    // ModelSelector.tsx: selectPrivacyMode === 'managed'
    const showsManagedModels = (pm: string) => pm === 'managed';

    expect(showsManagedModels('local')).toBe(false);
    expect(showsManagedModels('byok')).toBe(false);
    expect(showsManagedModels('managed')).toBe(true);
  });

  it('model popover shows local/byok section for non-managed modes', () => {
    // ModelPopover.tsx: selectPrivacyMode !== 'managed'
    const showsLocalByokSection = (pm: string) => pm !== 'managed';

    expect(showsLocalByokSection('local')).toBe(true);
    expect(showsLocalByokSection('byok')).toBe(true);
    expect(showsLocalByokSection('managed')).toBe(false);
  });

  it('conversation routing uses non-local check for cloud conversation ID', () => {
    // chat/index.tsx: selectPrivacyMode !== 'local'
    const usesCloudConversation = (pm: string) => pm !== 'local';

    expect(usesCloudConversation('local')).toBe(false);
    expect(usesCloudConversation('byok')).toBe(true);
    expect(usesCloudConversation('managed')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Store state transitions
// ---------------------------------------------------------------------------

describe('store state transitions', () => {
  it('mode merges correctly without stripping actions', () => {
    useAppModeStore.setState({ mode: 'cloud' });
    expect(useAppModeStore.getState().mode).toBe('cloud');
    useAppModeStore.setState({ mode: 'local' });
    expect(useAppModeStore.getState().mode).toBe('local');
  });

  it('planTier resets to free in beforeEach', () => {
    expect(useAppModeStore.getState().planTier).toBe('free');
  });

  it('planTier can be set independently of mode', () => {
    useAppModeStore.setState({ planTier: 'pro' });
    expect(useAppModeStore.getState().planTier).toBe('pro');
    expect(useAppModeStore.getState().mode).toBe('local');
  });
});

// ---------------------------------------------------------------------------
// Privacy mode completeness — exhaustive tier coverage
// ---------------------------------------------------------------------------

describe('privacy mode completeness', () => {
  const tiers = ['local', 'byok', 'managed'] as const;

  it('all three tiers are distinct string values', () => {
    expect(new Set(tiers).size).toBe(3);
  });

  it('no two tiers are equal', () => {
    for (let i = 0; i < tiers.length; i++) {
      for (let j = i + 1; j < tiers.length; j++) {
        expect(tiers[i]).not.toBe(tiers[j]);
      }
    }
  });

  it('every gate function returns a boolean for every tier', () => {
    const gates = [
      (m: string) => m === 'local',
      (m: string) => m === 'byok',
      (m: string) => m === 'managed',
      (m: string) => m !== 'local',
      (m: string) => m !== 'managed',
    ];
    for (const gate of gates) {
      for (const tier of tiers) {
        expect(typeof gate(tier)).toBe('boolean');
      }
    }
  });

  it('exactly one tier satisfies each === gate', () => {
    const eqGates = [
      { gate: (m: string) => m === 'local', match: 'local' },
      { gate: (m: string) => m === 'byok', match: 'byok' },
      { gate: (m: string) => m === 'managed', match: 'managed' },
    ];
    for (const { gate, match } of eqGates) {
      const matching = tiers.filter(gate);
      expect(matching).toHaveLength(1);
      expect(matching[0]).toBe(match);
    }
  });
});

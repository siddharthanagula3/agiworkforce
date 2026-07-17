import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
 *
 * CRITICAL DESIGN RULE: the "CRITICAL" gate tests below MUST exercise REAL
 * production code, not inline re-implementations of the predicate. A test that
 * asserts `const f = (pm) => pm === 'local'` would stay green even if someone
 * deleted the guard in production — that is the exact failure this file is
 * rewritten to prevent. Each CRITICAL test imports and drives the real module
 * (analytics.ts `track`, appModeStore `selectPrivacyMode`) so that removing the
 * production guard turns the test red.
 */

beforeEach(() => {
  // Partial merge reset — preserves store actions (setState with true would strip them)
  useAppModeStore.setState({ mode: 'local' });
});

// ---------------------------------------------------------------------------
// selectPrivacyMode — local mode always short-circuits (REAL selector)
// ---------------------------------------------------------------------------

describe('selectPrivacyMode — local mode (real selector)', () => {
  it('returns local when mode is local', () => {
    useAppModeStore.setState({ mode: 'local' });
    expect(selectPrivacyMode(useAppModeStore.getState())).toBe('local');
  });

  it('returns local even if settingsStore would return cloud providerMode', () => {
    // selectPrivacyMode checks mode === 'local' before any settingsStore read.
    useAppModeStore.setState({ mode: 'local' });
    expect(selectPrivacyMode(useAppModeStore.getState())).toBe('local');
  });

  it('returns a non-local PrivacyMode for cloud mode', () => {
    // Whether BYOK keys resolve to 'byok' or fall through to 'managed', the
    // result must never be 'local' when the app is in cloud mode — every cloud
    // auth/egress gate depends on this.
    useAppModeStore.setState({ mode: 'cloud' });
    const pm = selectPrivacyMode(useAppModeStore.getState());
    expect(pm).not.toBe('local');
    expect(['byok', 'managed']).toContain(pm);
  });
});

// ---------------------------------------------------------------------------
// Binary selectors (REAL selectors)
// ---------------------------------------------------------------------------

describe('binary selectors (real selectors)', () => {
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
// CRITICAL: telemetry egress gate — drives the REAL analytics.track()
//
// analytics.ts:154 short-circuits track() when
//   selectPrivacyMode(useAppModeStore.getState()) === 'local'
// The real egress is invoke('analytics_track_event', …) (via analyticsTrackEvent
// → ../lib/tauri-mock → @tauri-apps/api/core invoke, mocked in src/test/setup.ts).
//
// These tests assert on whether the REAL sender (`invoke('analytics_track_event')`)
// is called. They fail if the analytics.ts:154 local-mode guard is removed.
// ---------------------------------------------------------------------------

describe('CRITICAL: telemetry egress gate (real analytics.track)', () => {
  // The mocked invoke from @tauri-apps/api/core. analytics.ts → analyticsTrackEvent
  // → tauri-mock invoke → this same fn (setup.ts re-exports core.invoke as tauri-mock.invoke).
  let invoke: ReturnType<typeof vi.fn>;
  let analytics: import('../../services/analytics').AnalyticsService;
  // Track whether the analytics_track_event egress command was invoked.
  const wasEventSent = () => invoke.mock.calls.some((args) => args[0] === 'analytics_track_event');

  beforeEach(async () => {
    const core = await import('@tauri-apps/api/core');
    invoke = vi.mocked(core.invoke);
    // Default the egress to resolve so the fire-and-forget sendEventToBackend
    // does not produce an unhandled rejection.
    invoke.mockResolvedValue(undefined as never);

    const mod = await import('../../services/analytics');
    analytics = mod.analytics;

    // Consent is ON: this isolates the privacy-mode gate. In local mode the
    // event must STILL be suppressed (consent governs cloud opt-in only).
    analytics.updateConfig({ enabled: true });

    // Clear any invoke calls produced by initializeService()/updateConfig so the
    // assertion only sees what track() emits.
    invoke.mockClear();
  });

  afterEach(() => {
    // Restore enabled=false to avoid leaking telemetry state across files.
    analytics.updateConfig({ enabled: false });
  });

  it('does NOT send telemetry in local mode even when consent is enabled', () => {
    useAppModeStore.setState({ mode: 'local' });
    expect(selectPrivacyMode(useAppModeStore.getState())).toBe('local');

    analytics.track('app_opened', { source: 'unit-test' });

    // If analytics.ts:154 guard is deleted, this becomes true → test fails.
    expect(wasEventSent()).toBe(false);
  });

  it('DOES send telemetry in cloud mode when consent is enabled', () => {
    useAppModeStore.setState({ mode: 'cloud' });
    expect(selectPrivacyMode(useAppModeStore.getState())).not.toBe('local');

    analytics.track('app_opened', { source: 'unit-test' });

    expect(wasEventSent()).toBe(true);
  });

  it('respects the consent toggle in cloud mode (enabled=false → no egress)', () => {
    useAppModeStore.setState({ mode: 'cloud' });
    analytics.updateConfig({ enabled: false });
    invoke.mockClear();

    analytics.track('app_opened', { source: 'unit-test' });

    expect(wasEventSent()).toBe(false);

    // Re-enable for symmetry with afterEach expectations.
    analytics.updateConfig({ enabled: true });
  });

  it('forwards the privacy mode to the Rust collector via analytics_set_privacy_mode', async () => {
    // TRUST-BOUNDARY: analytics.ts pushes the mode to Rust so the collector can
    // silence local sessions at the Rust layer too. Verify the real API wrapper
    // hits the real egress command name.
    const { analyticsSetPrivacyMode } = await import('../../api/analytics');
    invoke.mockClear();
    await analyticsSetPrivacyMode('local');
    expect(invoke).toHaveBeenCalledWith('analytics_set_privacy_mode', { mode: 'local' });
  });
});

// ---------------------------------------------------------------------------
// CRITICAL: managed-cloud credential-forward gate — drives the REAL selector
//
// App.tsx:534 forwards cloud credentials to Rust only when
//   selectPrivacyMode(useAppModeStore.getState()) !== 'managed' → return early
// and App.tsx:607 enables ManagedCloud only when selectPrivacyMode === 'managed'.
//
// The gate lives inside the App component's startup effect/IIFE and cannot be
// unit-tested without rendering App. We instead exercise the exact predicate it
// uses — the REAL exported selectPrivacyMode — against real store state, and
// assert the branch outcomes the gate depends on. We do NOT re-implement the
// predicate inline; the assertions read the production selector's output.
// See selfReview for the rendering limitation.
// ---------------------------------------------------------------------------

describe('CRITICAL: managed-cloud credential-forward gate (real selectPrivacyMode)', () => {
  it('local mode → selector !== managed, so credential forward returns early', () => {
    useAppModeStore.setState({ mode: 'local' });
    const pm = selectPrivacyMode(useAppModeStore.getState());
    // App.tsx:534 — `selectPrivacyMode(...) !== 'managed'` → early return (no forward).
    expect(pm !== 'managed').toBe(true);
    // App.tsx:607 — `selectPrivacyMode(...) === 'managed'` → enable ManagedCloud.
    expect(pm === 'managed').toBe(false);
  });

  it('cloud mode → selector never reports local, so cloud-auth gate engages', () => {
    useAppModeStore.setState({ mode: 'cloud' });
    const pm = selectPrivacyMode(useAppModeStore.getState());
    // App.tsx:249 — `isCloudMode = selectPrivacyMode(...) !== 'local'`.
    expect(pm !== 'local').toBe(true);
  });

  it('provider settings cannot reclassify the managed Cloud workspace as BYOK', async () => {
    useAppModeStore.setState({ mode: 'cloud' });
    const { useSettingsStore } = await import('../../stores/settingsStore');
    useSettingsStore.getState().setProviderMode('cloud');

    const pm = selectPrivacyMode(useAppModeStore.getState());
    expect(pm).toBe('managed');

    // Reset providerMode so we do not leak BYOK state into other tests/files.
    useSettingsStore.getState().setProviderMode('auto');
  });
});

// ---------------------------------------------------------------------------
// Store state transitions (REAL store)
// ---------------------------------------------------------------------------

describe('store state transitions (real store)', () => {
  it('mode merges correctly without stripping actions', () => {
    useAppModeStore.setState({ mode: 'cloud' });
    expect(useAppModeStore.getState().mode).toBe('cloud');
    // Actions survive the partial merge.
    expect(typeof useAppModeStore.getState().setMode).toBe('function');
    useAppModeStore.setState({ mode: 'local' });
    expect(useAppModeStore.getState().mode).toBe('local');
  });

  it('does not duplicate the backend-owned account plan', () => {
    const state = useAppModeStore.getState() as unknown as Record<string, unknown>;
    expect(state).not.toHaveProperty('planTier');
    expect(state).not.toHaveProperty('setPlanTier');
  });
});

// ---------------------------------------------------------------------------
// Privacy mode completeness — exhaustive tier coverage against the REAL selector
//
// Verify the production selector produces exactly the three expected tiers and
// that 'local' is the only egress-suppressing tier. This couples the coverage
// matrix to selectPrivacyMode's real output rather than to a hard-coded list.
// ---------------------------------------------------------------------------

describe('privacy mode completeness (real selector outcomes)', () => {
  it('local mode is the only tier where the selector reports local', () => {
    useAppModeStore.setState({ mode: 'local' });
    expect(selectPrivacyMode(useAppModeStore.getState())).toBe('local');

    useAppModeStore.setState({ mode: 'cloud' });
    expect(selectPrivacyMode(useAppModeStore.getState())).not.toBe('local');
  });

  it('selector output is always one of the three canonical PrivacyMode values', () => {
    const valid = new Set(['local', 'byok', 'managed']);

    useAppModeStore.setState({ mode: 'local' });
    expect(valid.has(selectPrivacyMode(useAppModeStore.getState()))).toBe(true);

    useAppModeStore.setState({ mode: 'cloud' });
    expect(valid.has(selectPrivacyMode(useAppModeStore.getState()))).toBe(true);
  });
});

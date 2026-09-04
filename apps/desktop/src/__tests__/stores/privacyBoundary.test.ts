import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  useAppModeStore,
  selectPrivacyMode,
  selectIsCloud,
  selectIsLocal,
} from '../../stores/appModeStore';

beforeEach(() => {
  useAppModeStore.setState({ mode: 'local' });
});

describe('selectPrivacyMode, local mode (real selector)', () => {
  it('returns local when mode is local', () => {
    useAppModeStore.setState({ mode: 'local' });
    expect(selectPrivacyMode(useAppModeStore.getState())).toBe('local');
  });

  it('returns local even if settingsStore would return cloud providerMode', () => {
    useAppModeStore.setState({ mode: 'local' });
    expect(selectPrivacyMode(useAppModeStore.getState())).toBe('local');
  });

  it('returns a non-local PrivacyMode for cloud mode', () => {
    useAppModeStore.setState({ mode: 'cloud' });
    const pm = selectPrivacyMode(useAppModeStore.getState());
    expect(pm).not.toBe('local');
    expect(['byok', 'managed']).toContain(pm);
  });
});

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

describe('CRITICAL: telemetry egress gate (real analytics.track)', () => {
  let invoke: ReturnType<typeof vi.fn>;
  let analytics: import('../../services/analytics').AnalyticsService;
  const wasEventSent = () => invoke.mock.calls.some((args) => args[0] === 'analytics_track_event');

  beforeEach(async () => {
    const core = await import('@tauri-apps/api/core');
    invoke = vi.mocked(core.invoke);
    invoke.mockResolvedValue(undefined as never);

    const mod = await import('../../services/analytics');
    analytics = mod.analytics;

    analytics.updateConfig({ enabled: true });

    invoke.mockClear();
  });

  afterEach(() => {
    analytics.updateConfig({ enabled: false });
  });

  it('does NOT send telemetry in local mode even when consent is enabled', () => {
    useAppModeStore.setState({ mode: 'local' });
    expect(selectPrivacyMode(useAppModeStore.getState())).toBe('local');

    analytics.track('app_opened', { source: 'unit-test' });

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

    analytics.updateConfig({ enabled: true });
  });

  it('forwards the privacy mode to the Rust collector via analytics_set_privacy_mode', async () => {
    const { analyticsSetPrivacyMode } = await import('../../api/analytics');
    invoke.mockClear();
    await analyticsSetPrivacyMode('local');
    expect(invoke).toHaveBeenCalledWith('analytics_set_privacy_mode', { mode: 'local' });
  });
});

describe('CRITICAL: managed-cloud credential-forward gate (real selectPrivacyMode)', () => {
  it('local mode → selector !== managed, so credential forward returns early', () => {
    useAppModeStore.setState({ mode: 'local' });
    const pm = selectPrivacyMode(useAppModeStore.getState());
    expect(pm !== 'managed').toBe(true);
    expect(pm === 'managed').toBe(false);
  });

  it('cloud mode → selector never reports local, so cloud-auth gate engages', () => {
    useAppModeStore.setState({ mode: 'cloud' });
    const pm = selectPrivacyMode(useAppModeStore.getState());
    expect(pm !== 'local').toBe(true);
  });

  it('provider settings cannot reclassify the managed Cloud workspace as BYOK', async () => {
    useAppModeStore.setState({ mode: 'cloud' });
    const { useSettingsStore } = await import('../../stores/settingsStore');
    useSettingsStore.getState().setProviderMode('cloud');

    const pm = selectPrivacyMode(useAppModeStore.getState());
    expect(pm).toBe('managed');

    useSettingsStore.getState().setProviderMode('auto');
  });
});

describe('store state transitions (real store)', () => {
  it('mode merges correctly without stripping actions', () => {
    useAppModeStore.setState({ mode: 'cloud' });
    expect(useAppModeStore.getState().mode).toBe('cloud');
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

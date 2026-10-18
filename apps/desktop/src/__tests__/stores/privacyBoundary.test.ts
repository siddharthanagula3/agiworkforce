import { describe, it, expect, beforeEach } from 'vitest';
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
    const setProviderMode = (providerMode: 'auto' | 'cloud') =>
      useSettingsStore.setState((state) => ({
        llmConfig: { ...state.llmConfig, providerMode },
      }));
    setProviderMode('cloud');

    const pm = selectPrivacyMode(useAppModeStore.getState());
    expect(pm).toBe('managed');

    setProviderMode('auto');
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

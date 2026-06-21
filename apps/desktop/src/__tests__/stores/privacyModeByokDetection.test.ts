/**
 * Regression test for the BYOK trust-boundary detection in selectPrivacyMode.
 *
 * BYOK (mode='cloud' + persisted llmConfig.providerMode='cloud') MUST resolve to
 * 'byok' so the egress guard and telemetry gate block our-cloud egress for BYOK
 * users. A prior `require('./settingsStore')` threw under ESM and fell through to
 * 'managed', making the guard fail OPEN for BYOK. selectPrivacyMode now reads the
 * persisted settings from localStorage; these cases lock that behaviour in.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { selectPrivacyMode, useAppModeStore } from '../../stores/appModeStore';

const KEY = 'agiworkforce-settings';
const setProviderMode = (pm: string) =>
  globalThis.localStorage.setItem(
    KEY,
    JSON.stringify({ state: { llmConfig: { providerMode: pm } }, version: 0 }),
  );

describe('selectPrivacyMode — BYOK detection (persisted storage)', () => {
  beforeEach(() => globalThis.localStorage.removeItem(KEY));

  it('cloud + providerMode=cloud => byok (must NOT be managed; guard would fail open)', () => {
    useAppModeStore.setState({ mode: 'cloud' });
    setProviderMode('cloud');
    expect(selectPrivacyMode(useAppModeStore.getState())).toBe('byok');
  });

  it('cloud + providerMode=auto => managed', () => {
    useAppModeStore.setState({ mode: 'cloud' });
    setProviderMode('auto');
    expect(selectPrivacyMode(useAppModeStore.getState())).toBe('managed');
  });

  it('cloud + no persisted settings => managed (BYOK requires configured keys)', () => {
    useAppModeStore.setState({ mode: 'cloud' });
    expect(selectPrivacyMode(useAppModeStore.getState())).toBe('managed');
  });

  it('local => local (never reads storage)', () => {
    useAppModeStore.setState({ mode: 'local' });
    setProviderMode('cloud');
    expect(selectPrivacyMode(useAppModeStore.getState())).toBe('local');
  });
});

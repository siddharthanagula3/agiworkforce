import { describe, it, expect, beforeEach } from 'vitest';
import { selectPrivacyMode, useAppModeStore } from '../../stores/appModeStore';

const KEY = 'agiworkforce-settings';
const setProviderMode = (pm: string) =>
  globalThis.localStorage.setItem(
    KEY,
    JSON.stringify({ state: { llmConfig: { providerMode: pm } }, version: 0 }),
  );

describe('selectPrivacyMode, workspace boundary', () => {
  beforeEach(() => globalThis.localStorage.removeItem(KEY));

  it('cloud + providerMode=cloud remains managed', () => {
    useAppModeStore.setState({ mode: 'cloud' });
    setProviderMode('cloud');
    expect(selectPrivacyMode(useAppModeStore.getState())).toBe('managed');
  });

  it('cloud + providerMode=auto => managed', () => {
    useAppModeStore.setState({ mode: 'cloud' });
    setProviderMode('auto');
    expect(selectPrivacyMode(useAppModeStore.getState())).toBe('managed');
  });

  it('cloud + no persisted settings => managed', () => {
    useAppModeStore.setState({ mode: 'cloud' });
    expect(selectPrivacyMode(useAppModeStore.getState())).toBe('managed');
  });

  it('local => local (never reads storage)', () => {
    useAppModeStore.setState({ mode: 'local' });
    setProviderMode('cloud');
    expect(selectPrivacyMode(useAppModeStore.getState())).toBe('local');
  });
});


jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@agiworkforce/utils', () => ({
  uuidv7: jest.fn(() => `00000000-0000-7000-8000-${Date.now().toString(16).padStart(12, '0')}`),
  isUuidV7: jest.fn(() => true),
  setUuidV7RandomSource: jest.fn(),
}));

import { applyCloudSettings, toCloudSettings } from '../services/cloudSettingsMapping';
import { useCloudSettingsStore } from '../stores/settings/cloudSettingsStore';

function projectionOf(speechLanguage: string) {
  const store = useCloudSettingsStore.getState();
  return toCloudSettings({ ...store, speechLanguage });
}

describe('cloudSettingsMapping — language namespace', () => {
  beforeEach(() => {
    useCloudSettingsStore.setState({ speechLanguage: 'en' });
  });

  it('publishes the speech language as speechLocale, never as locale', () => {
    const projected = projectionOf('fr');

    expect(projected.language?.speechLocale).toBe('fr');
    expect(projected.language?.locale).toBeUndefined();
  });

  it('ignores a pulled interface locale so Desktop cannot retune mobile voices', () => {
    applyCloudSettings({ language: { locale: 'de' } });

    expect(useCloudSettingsStore.getState().speechLanguage).toBe('en');
  });

  it('applies a pulled speechLocale', () => {
    applyCloudSettings({ language: { speechLocale: 'fr' } });

    expect(useCloudSettingsStore.getState().speechLanguage).toBe('fr');
  });

  it('leaves the interface locale untouched when both keys arrive together', () => {
    applyCloudSettings({ language: { locale: 'de', speechLocale: 'ja' } });

    const projected = projectionOf(useCloudSettingsStore.getState().speechLanguage);
    expect(useCloudSettingsStore.getState().speechLanguage).toBe('ja');
    expect(projected.language?.locale).toBeUndefined();
  });
});

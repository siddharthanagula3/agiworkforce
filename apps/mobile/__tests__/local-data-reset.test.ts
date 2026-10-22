jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  storage: {
    getString: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    clearAll: jest.fn(),
  },
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../lib/biometricFlagStore', () => ({
  clearBiometricFlag: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../lib/deviceId', () => ({
  clearDeviceId: jest.fn().mockResolvedValue(undefined),
}));

import { resetLocalInMemoryState } from '../src/features/settings/data-controls/localDataSnapshot';
import { SPEECH_LANGUAGE_AUTO } from '../src/features/voice/speechLanguage';
import { useAuthStore } from '../src/features/auth/store';
import { useCloudSettingsStore } from '../stores/settings/cloudSettingsStore';
import { useLocalSettingsStore } from '../stores/settings/localSettingsStore';

describe('Delete local data', () => {
  beforeEach(() => {
    useAuthStore.setState({ signOut: jest.fn().mockResolvedValue(undefined) });
  });

  it('turns Start with Voice back off', async () => {
    useLocalSettingsStore.getState().setStartWithVoice(true);
    expect(useLocalSettingsStore.getState().startWithVoice).toBe(true);

    await resetLocalInMemoryState();

    expect(useLocalSettingsStore.getState().startWithVoice).toBe(false);
  });

  it('puts the other voice preferences back to their defaults beside it', async () => {
    useLocalSettingsStore.setState({ autoListenEnabled: false, speechLanguage: 'fr' });

    await resetLocalInMemoryState();

    expect(useLocalSettingsStore.getState()).toMatchObject({
      autoListenEnabled: true,
      speechLanguage: SPEECH_LANGUAGE_AUTO,
      startWithVoice: false,
    });
  });

  it('does not give the Cloud settings a device launch preference', async () => {
    await resetLocalInMemoryState();

    expect('startWithVoice' in useCloudSettingsStore.getState()).toBe(false);
  });
});

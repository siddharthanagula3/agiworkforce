/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store?.persist?.rehydrate) store.persist.rehydrate();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('@react-native-community/slider', () => ({
  __esModule: true,
  default: ({ accessibilityLabel }: { accessibilityLabel?: string }) => {
    const { View } = require('react-native') as typeof import('react-native');
    return <View accessibilityLabel={accessibilityLabel} accessibilityRole="adjustable" />;
  },
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy(
    {},
    {
      get: (_target, name) => (name === '__esModule' ? true : icon),
    },
  );
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockGetAvailableLanguages = jest.fn();

jest.mock('@/src/features/voice/services/tts', () => ({
  getAvailableLanguages: (...args: unknown[]) => mockGetAvailableLanguages(...args),
  getVoicesForLanguage: jest.fn().mockResolvedValue([]),
  speak: jest.fn().mockResolvedValue(undefined),
}));

import VoiceSettingsScreen from '@/src/features/settings/voice';
import { useSettingsStore } from '../stores/settingsStore';
import { useLocalSettingsStore } from '../stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '../stores/settings/cloudSettingsStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';

const LANGUAGES = [
  { code: 'en', label: 'English', locale: 'en-US' },
  { code: 'fr', label: 'French', locale: 'fr-FR' },
];

describe('Voice settings, speech language', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAvailableLanguages.mockResolvedValue(LANGUAGES);
    useChatAppModeStore.setState({ appMode: 'local' });
    useSettingsStore.setState({
      voiceEnabled: true,
      selectedPresetId: 'preset-crisp',
      selectedVoiceId: 'com.apple.voice.en',
      speechRate: 1,
      speechPitch: 1,
    });
    useLocalSettingsStore.setState({ speechLanguage: 'en' });
    useCloudSettingsStore.setState({ speechLanguage: 'en' });
  });

  it('shows the current speech language on a reachable row', async () => {
    const { getByLabelText } = render(<VoiceSettingsScreen />);

    await waitFor(() => expect(getByLabelText('Speech language. English')).toBeTruthy());
  });

  it('writes the picked language to the local store and clears the language-specific voice', async () => {
    const { getByLabelText } = render(<VoiceSettingsScreen />);

    fireEvent.press(await waitFor(() => getByLabelText('Speech language. English')));
    fireEvent.press(await waitFor(() => getByLabelText('French speech language')));

    expect(useLocalSettingsStore.getState().speechLanguage).toBe('fr');
    expect(useSettingsStore.getState().selectedVoiceId).toBeNull();
    expect(useSettingsStore.getState().selectedPresetId).toBeNull();
    expect(useCloudSettingsStore.getState().speechLanguage).toBe('en');
  });

  it('writes to the cloud store instead when the app is in cloud mode', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const { getByLabelText } = render(<VoiceSettingsScreen />);

    fireEvent.press(await waitFor(() => getByLabelText('Speech language. English')));
    fireEvent.press(await waitFor(() => getByLabelText('French speech language')));

    expect(useCloudSettingsStore.getState().speechLanguage).toBe('fr');
    expect(useLocalSettingsStore.getState().speechLanguage).toBe('en');
  });
});

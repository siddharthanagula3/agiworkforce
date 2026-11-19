import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
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

jest.mock('@/src/features/voice/hooks/useVoiceOutputOwner', () => ({
  useVoiceOutputOwner: () => null,
}));

const mockGetVoicesForLanguage = jest.fn();
jest.mock('@/src/features/voice/services/tts', () => ({
  ...jest.requireActual('@/src/features/voice/services/tts'),
  getVoicesForLanguage: (...args: unknown[]) => mockGetVoicesForLanguage(...args),
}));

import VoiceLanguageScreen from '@/src/features/settings/voice-language';
import { useSettingsStore } from '../stores/settingsStore';
import { useLocalSettingsStore } from '../stores/settings/localSettingsStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';

const FRENCH_VOICE = {
  identifier: 'com.apple.voice.fr',
  name: 'Thomas',
  quality: 'Default',
  language: 'fr-FR',
};

describe('Voice & Language, installed voice inventory', () => {
  beforeEach(() => {
    mockGetVoicesForLanguage.mockReset();
    useChatAppModeStore.setState({ appMode: 'local' });
    useLocalSettingsStore.setState({ speechLanguage: 'fr' });
    useSettingsStore.setState({
      selectedPresetId: null,
      selectedVoiceId: 'com.apple.voice.fr',
      speechRate: 1,
      speechPitch: 1,
    });
  });

  it('does not claim the device default while a chosen voice is still requested', async () => {
    mockGetVoicesForLanguage.mockRejectedValue(new Error('inventory unavailable'));
    const { findByText, queryByText, getByLabelText } = render(<VoiceLanguageScreen />);

    expect(await findByText("Couldn't load installed voices")).toBeTruthy();
    expect(
      queryByText('Your voice is kept but can’t be checked now. Choose System default to stop.'),
    ).toBeTruthy();
    expect(queryByText('AGI uses the device default.')).toBeNull();
    expect(getByLabelText('System default voice').props.accessibilityState).toEqual({
      selected: false,
    });
    expect(useSettingsStore.getState().selectedVoiceId).toBe('com.apple.voice.fr');
  });

  it('retries a failed inventory and shows the voices it returns', async () => {
    mockGetVoicesForLanguage
      .mockRejectedValueOnce(new Error('inventory unavailable'))
      .mockResolvedValueOnce([FRENCH_VOICE]);
    const { findByLabelText, getByLabelText } = render(<VoiceLanguageScreen />);

    fireEvent.press(await findByLabelText('Try loading installed voices again'));

    await waitFor(() =>
      expect(getByLabelText('Thomas voice').props.accessibilityState).toEqual({ selected: true }),
    );
    expect(mockGetVoicesForLanguage).toHaveBeenCalledTimes(2);
  });

  it('says the device default is used only when no voice is chosen', async () => {
    useSettingsStore.setState({ selectedVoiceId: null });
    mockGetVoicesForLanguage.mockResolvedValue([]);
    const { findByText, queryByLabelText } = render(<VoiceLanguageScreen />);

    expect(await findByText('No installed voices returned')).toBeTruthy();
    expect(await findByText('AGI uses the device default.')).toBeTruthy();
    expect(queryByLabelText('Try loading installed voices again')).toBeNull();
  });
});

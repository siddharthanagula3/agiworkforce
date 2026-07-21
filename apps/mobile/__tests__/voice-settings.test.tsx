/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockNavigate = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    navigate: mockNavigate,
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
  return {
    ArrowLeft: icon,
    Check: icon,
    ChevronRight: icon,
    Headphones: icon,
    Lock: icon,
    Mic: icon,
    Play: icon,
    Volume2: icon,
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import VoiceSettingsScreen from '@/src/features/settings/voice';
import { useSettingsStore } from '../stores/settingsStore';

describe('Voice settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSettingsStore.setState({
      ttsProvider: 'system',
      voiceEnabled: true,
      autoListenEnabled: true,
      selectedPresetId: null,
      selectedVoiceId: null,
      speechRate: 1,
      speechPitch: 1,
    });
  });

  it('keeps Cloud voice visibly locked and non-interactive in Local Mode', () => {
    const { getByLabelText } = render(<VoiceSettingsScreen />);
    const cloudProvider = getByLabelText('Cloud voice provider');

    expect(cloudProvider.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(cloudProvider);

    expect(useSettingsStore.getState().ttsProvider).toBe('system');
  });

  it('labels Cloud voice honestly (not built) rather than implying Cloud access unlocks it', () => {
    const { getByText, queryByText } = render(<VoiceSettingsScreen />);
    // Regression for MOBILE-VOICE-CLOUD-TTS-DISABLED: the old copy "Requires AGI
    // Cloud access." misled cloud users into thinking they could pick it.
    expect(getByText("Cloud voice isn't available on mobile yet.")).toBeTruthy();
    expect(queryByText('Requires AGI Cloud access.')).toBeNull();
  });
});

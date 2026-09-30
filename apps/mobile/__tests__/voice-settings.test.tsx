/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockNavigate = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    navigate: mockNavigate,
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

import VoiceSettingsScreen from '@/src/features/settings/voice';
import { useSettingsStore } from '../stores/settingsStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';

describe('Voice settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useChatAppModeStore.setState({ appMode: 'local' });
    useSettingsStore.setState({
      ttsProvider: 'system',
      voiceEnabled: true,
      autoListenEnabled: true,
      selectedPresetId: null,
      selectedVoiceId: null,
      speechRate: 1,
      speechPitch: 1,
      voicePushToTalk: false,
    });
  });

  it('offers no provider option that can never be selected', () => {
    const { queryByLabelText, queryAllByRole } = render(<VoiceSettingsScreen />);

    expect(queryByLabelText('Cloud voice provider')).toBeNull();
    expect(queryByLabelText('System voice provider')).toBeNull();
    expect(
      queryAllByRole('button').filter((node) => node.props.accessibilityState?.disabled === true),
    ).toHaveLength(0);
  });

  it('explains the reply model and transcript destination', () => {
    const { getByText, queryByText } = render(<VoiceSettingsScreen />);

    expect(
      getByText(
        'Voice replies use the current chat model. Cloud Mode sends your transcript to AGI Cloud. Speech plays through voices installed on this device.',
      ),
    ).toBeTruthy();
    expect(queryByText("Cloud voice isn't available on mobile yet.")).toBeNull();
    expect(queryByText('Requires AGI Cloud access.')).toBeNull();
  });

  it('opens the existing model picker from the Voice answer-model row', () => {
    const { getByLabelText } = render(<VoiceSettingsScreen />);
    fireEvent.press(getByLabelText(/^Answer model\./));
    expect(mockPush).toHaveBeenCalledWith('/(app)/models');
  });

  it('offers the live conversation mode the voice companion reads, on the same preference', () => {
    const { getByLabelText } = render(<VoiceSettingsScreen />);

    expect(getByLabelText('Set voice mode to Hands free').props.accessibilityState.selected).toBe(
      true,
    );

    fireEvent.press(getByLabelText('Set voice mode to Push to talk'));

    expect(useSettingsStore.getState().voicePushToTalk).toBe(true);
    expect(getByLabelText('Set voice mode to Push to talk').props.accessibilityState.selected).toBe(
      true,
    );
  });

  it('explains that voice never keeps the microphone active in the background', () => {
    const { getByText, queryByRole } = render(<VoiceSettingsScreen />);

    expect(getByText('Foreground conversations only')).toBeTruthy();
    expect(
      getByText(
        'Voice listening and speech stop when AGI moves to the background or the device locks. The microphone does not stay active in other apps.',
      ),
    ).toBeTruthy();
    expect(queryByRole('switch', { name: /background conversations/i })).toBeNull();
  });
});

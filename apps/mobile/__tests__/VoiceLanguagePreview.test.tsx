import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

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

const mockStart = jest.fn();
jest.mock('@/src/features/voice/hooks/useVoiceOutputOwner', () => ({
  useVoiceOutputOwner: () => ({ start: (...args: unknown[]) => mockStart(...args) }),
}));

const mockGetVoicesForLanguage = jest.fn();
jest.mock('@/src/features/voice/services/tts', () => ({
  ...jest.requireActual('@/src/features/voice/services/tts'),
  getVoicesForLanguage: (...args: unknown[]) => mockGetVoicesForLanguage(...args),
}));

import VoiceLanguageScreen from '@/src/features/settings/voice-language';
import { VOICE_PREVIEW_TEXT } from '@/src/features/voice/hooks/useVoicePreview';
import { VOICE_PRESETS } from '@/src/features/voice/voicePresets';
import { useSettingsStore } from '../stores/settingsStore';
import { useLocalSettingsStore } from '../stores/settings/localSettingsStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';

const SYSTEM_VOICE = {
  identifier: 'com.apple.voice.thomas',
  name: 'Thomas',
  quality: 'Default',
  language: 'fr-FR',
};

const aurora = VOICE_PRESETS[0]!;

function startedPlayback() {
  let finish!: () => void;
  const done = new Promise<{ status: 'done' }>((resolve) => {
    finish = () => resolve({ status: 'done' });
  });
  const stop = jest.fn(async () => undefined);
  mockStart.mockReturnValueOnce({ done, stop });
  return { finish, stop };
}

describe('Voice & Language, previews', () => {
  beforeEach(() => {
    mockStart.mockReset();
    mockGetVoicesForLanguage.mockReset();
    mockGetVoicesForLanguage.mockResolvedValue([SYSTEM_VOICE]);
    useChatAppModeStore.setState({ appMode: 'local' });
    useLocalSettingsStore.setState({ speechLanguage: 'fr' });
    useSettingsStore.setState({
      selectedPresetId: null,
      selectedVoiceId: null,
      speechRate: 1.25,
      speechPitch: 0.9,
    });
  });

  it('shows a system voice as playing, then stops it when pressed again', async () => {
    const playback = startedPlayback();
    const { findByLabelText, getByLabelText, queryByLabelText } = render(<VoiceLanguageScreen />);

    fireEvent.press(await findByLabelText('Preview Thomas'));

    expect(mockStart).toHaveBeenCalledWith(VOICE_PREVIEW_TEXT, {
      voice: SYSTEM_VOICE.identifier,
      rate: 1.25,
      pitch: 0.9,
    });
    expect(queryByLabelText('Preview Thomas')).toBeNull();

    await act(async () => {
      fireEvent.press(getByLabelText('Stop preview of Thomas'));
    });
    expect(playback.stop).toHaveBeenCalledTimes(1);
    expect(getByLabelText('Preview Thomas')).toBeTruthy();
  });

  it('shows the Play control again when the preview ends by itself', async () => {
    const playback = startedPlayback();
    const { findByLabelText, getByLabelText } = render(<VoiceLanguageScreen />);

    fireEvent.press(await findByLabelText('Preview Thomas'));
    expect(getByLabelText('Stop preview of Thomas')).toBeTruthy();

    await act(async () => {
      playback.finish();
    });
    expect(getByLabelText('Preview Thomas')).toBeTruthy();
  });

  it('lets each of the five presets be heard with its own speed and pitch', async () => {
    const { findByLabelText } = render(<VoiceLanguageScreen />);
    await findByLabelText('Preview Thomas');

    for (const preset of VOICE_PRESETS) {
      startedPlayback();
      fireEvent.press(await findByLabelText(`Preview ${preset.name}`));
      expect(mockStart).toHaveBeenLastCalledWith(
        VOICE_PREVIEW_TEXT,
        expect.objectContaining({ rate: preset.rate, pitch: preset.pitch }),
      );
    }
    expect(VOICE_PRESETS).toHaveLength(5);
  });

  it('previewing a preset does not change the saved speed, pitch or choice', async () => {
    startedPlayback();
    const { findByLabelText } = render(<VoiceLanguageScreen />);

    fireEvent.press(await findByLabelText(`Preview ${aurora.name}`));

    const settings = useSettingsStore.getState();
    expect(settings.speechRate).toBe(1.25);
    expect(settings.speechPitch).toBe(0.9);
    expect(settings.selectedPresetId).toBeNull();
  });

  it('says that choosing a preset sets speed and pitch', async () => {
    const { findByLabelText, getByText, queryByText } = render(<VoiceLanguageScreen />);
    await findByLabelText('Preview Thomas');
    expect(queryByText(/sets speed/)).toBeNull();

    fireEvent.press(await findByLabelText(`${aurora.name} voice preset`));

    expect(
      getByText(
        `${aurora.name} sets speed ${aurora.rate.toFixed(2)}x and pitch ${aurora.pitch.toFixed(2)}x. Change them in Voice settings.`,
      ),
    ).toBeTruthy();
  });
});

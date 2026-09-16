import React from 'react';
import { Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import { useSettingsStore } from '@/stores/settingsStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import * as TTS from '@/src/features/voice/services/tts';
import {
  activeSpeechLanguage,
  autoListenEnabled,
} from '@/src/features/voice/services/speechSettings';
import * as VoiceInput from '@/src/features/voice/services/voiceInput';
import {
  useVoiceConversation,
  VOICE_INPUT_DISABLED_MESSAGE,
} from '@/src/features/voice/hooks/useVoiceConversation';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success' },
}));

describe('speech settings reach every speaking surface', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      selectedVoiceId: 'com.apple.voice.enhanced.en-GB.Serena',
      speechRate: 1.35,
      speechPitch: 0.8,
    });
    useChatAppModeStore.setState({ appMode: 'local' });
    useLocalSettingsStore.setState({ speechLanguage: 'fr', autoListenEnabled: false });
    useCloudSettingsStore.setState({ speechLanguage: 'de', autoListenEnabled: true });
  });

  it('carries voice, speed, pitch and language from the Voice screen', () => {
    expect(TTS.speechOptionsFromSettings()).toEqual({
      voice: 'com.apple.voice.enhanced.en-GB.Serena',
      rate: 1.35,
      pitch: 0.8,
      language: 'fr',
    });
  });

  it('reads the speech language of the active trust domain', () => {
    expect(activeSpeechLanguage()).toBe('fr');
    useChatAppModeStore.setState({ appMode: 'cloud' });
    expect(activeSpeechLanguage()).toBe('de');
  });

  it('reads Auto-listen from the active trust domain', () => {
    expect(autoListenEnabled()).toBe(false);
    useChatAppModeStore.setState({ appMode: 'cloud' });
    expect(autoListenEnabled()).toBe(true);
  });

  it('leaves an unset voice undefined rather than sending null to the engine', () => {
    useSettingsStore.setState({ selectedVoiceId: null });
    expect(TTS.speechOptionsFromSettings().voice).toBeUndefined();
  });
});

function Harness({ onCaptureError }: { onCaptureError: (err: unknown) => void }) {
  const conversation = useVoiceConversation({
    enabled: true,
    hapticsEnabled: false,
    sendMessage: async () => 'ok',
    speak: async () => undefined,
    stopSpeaking: () => undefined,
    onCaptureError,
  });
  return (
    <Text testID="orb" onPress={conversation.handleOrbPress}>
      {conversation.phase}
    </Text>
  );
}

describe('the Voice Input toggle gates the microphone', () => {
  const startSpy = jest.spyOn(VoiceInput, 'startCaptureSession');

  beforeEach(() => {
    startSpy.mockReset();
    useChatAppModeStore.setState({ appMode: 'local' });
    useLocalSettingsStore.setState({ speechLanguage: 'en', autoListenEnabled: true });
  });

  afterAll(() => {
    startSpy.mockRestore();
  });

  it('never opens a capture while Voice Input is off, and says why', async () => {
    useSettingsStore.setState({ voiceEnabled: false });
    const onCaptureError = jest.fn();
    const { getByTestId } = render(<Harness onCaptureError={onCaptureError} />);

    await act(async () => {
      getByTestId('orb').props.onPress();
    });

    expect(startSpy).not.toHaveBeenCalled();
    expect(onCaptureError).toHaveBeenCalled();
    const err = onCaptureError.mock.calls[0]?.[0] as VoiceInput.VoiceCaptureError;
    expect(err.code).toBe('voice-input-disabled');
    expect(err.message).toBe(VOICE_INPUT_DISABLED_MESSAGE);
  });

  it('opens a capture in the chosen speech language while Voice Input is on', async () => {
    useSettingsStore.setState({ voiceEnabled: true });
    useLocalSettingsStore.setState({ speechLanguage: 'es' });
    startSpy.mockResolvedValue({ result: new Promise(() => {}) });

    const { getByTestId } = render(<Harness onCaptureError={jest.fn()} />);
    await act(async () => {
      getByTestId('orb').props.onPress();
    });

    await waitFor(() => expect(startSpy).toHaveBeenCalled());
    expect(startSpy.mock.calls[0]?.[2]).toEqual({ lang: 'es' });
  });

  it('surfaces a recognition failure that happens after the capture started', async () => {
    useSettingsStore.setState({ voiceEnabled: true });
    const failure = new VoiceInput.VoiceCaptureError('recognition-error', 'recognizer died');
    startSpy.mockResolvedValue({ result: Promise.reject(failure) });

    const onCaptureError = jest.fn();
    const { getByTestId } = render(<Harness onCaptureError={onCaptureError} />);
    await act(async () => {
      getByTestId('orb').props.onPress();
    });

    await waitFor(() => expect(onCaptureError).toHaveBeenCalledWith(failure));
  });

  it('stays silent when the capture was deliberately aborted', async () => {
    useSettingsStore.setState({ voiceEnabled: true });
    const aborted = new VoiceInput.VoiceCaptureError('aborted', 'Capture cancelled');
    startSpy.mockResolvedValue({ result: Promise.reject(aborted) });

    const onCaptureError = jest.fn();
    const { getByTestId } = render(<Harness onCaptureError={onCaptureError} />);
    await act(async () => {
      getByTestId('orb').props.onPress();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(onCaptureError).not.toHaveBeenCalled();
  });
});

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('expo-speech-recognition', () => {
  const listenersByEvent: Record<string, Array<(...args: unknown[]) => void>> = {};
  const getListeners = (name: string) => (listenersByEvent[name] ||= []);
  return {
    __esModule: true,
    ExpoSpeechRecognitionModule: {
      start: jest.fn(),
      stop: jest.fn(() => {
        for (const fn of getListeners('end')) fn(null);
      }),
      abort: jest.fn(() => {
        for (const fn of getListeners('end')) fn(null);
      }),
      requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
      getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
      supportsOnDeviceRecognition: jest.fn().mockReturnValue(true),
      isRecognitionAvailable: jest.fn().mockReturnValue(true),
      addListener: jest.fn((name: string, fn: (...args: unknown[]) => void) => {
        getListeners(name).push(fn);
        return {
          remove: () => {
            listenersByEvent[name] = getListeners(name).filter((cb) => cb !== fn);
          },
        };
      }),
    },
  };
});

jest.mock('expo-localization', () => ({
  __esModule: true,
  getLocales: jest.fn().mockReturnValue([{ languageTag: 'en-US' }]),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return { Mic: icon, Loader: icon };
});

import { VoiceInputButton } from '@/src/features/voice/components/VoiceInputButton';
import * as VoiceInput from '@/src/features/voice/services/voiceInput';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

describe('VoiceInputButton long-press handoff', () => {
  beforeEach(async () => {
    await VoiceInput.cancelCapture();
    jest.clearAllMocks();
  });

  it('cancels an in-flight PTT recording instead of orphaning it when long-press fires', async () => {
    const onRecordingStart = jest.fn();
    const onRecordingStop = jest.fn();
    const onLongPress = jest.fn();
    const onTranscription = jest.fn();

    const { getByTestId } = render(
      <VoiceInputButton
        onTranscription={onTranscription}
        onRecordingStart={onRecordingStart}
        onRecordingStop={onRecordingStop}
        onLongPress={onLongPress}
      />,
    );

    const button = getByTestId('voice-input-button');

    await act(async () => {
      fireEvent(button, 'pressIn');
    });
    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onRecordingStart).toHaveBeenCalledTimes(1));
    expect(VoiceInput.isCapturing()).toBe(true);

    await act(async () => {
      fireEvent(button, 'longPress');
    });

    expect(VoiceInput.isCapturing()).toBe(false);
    expect(onRecordingStop).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onTranscription).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent(button, 'pressOut');
    });
    expect(onRecordingStop).toHaveBeenCalledTimes(1);
  });
});

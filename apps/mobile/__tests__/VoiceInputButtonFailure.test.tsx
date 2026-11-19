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
import * as VoiceService from '@/src/features/voice/services/voice';
import { VOICE_UNAVAILABLE_MESSAGE } from '@/src/features/voice/services/voiceFailure';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { useSettingsStore } from '@/stores/settingsStore';

describe('VoiceInputButton start failures', () => {
  beforeEach(async () => {
    await VoiceInput.cancelCapture();
    jest.restoreAllMocks();
    jest.clearAllMocks();
    useSettingsStore.setState({ dictationOnboardingSeen: true, voiceEnabled: true });
  });

  async function pressWith(error: unknown) {
    jest.spyOn(VoiceService, 'startRecording').mockRejectedValue(error);
    const onError = jest.fn();
    const onFailure = jest.fn();
    const { getByTestId } = render(
      <VoiceInputButton onTranscription={jest.fn()} onError={onError} onFailure={onFailure} />,
    );
    await act(async () => {
      fireEvent(getByTestId('voice-input-button'), 'pressIn');
    });
    await waitFor(() => expect(onError.mock.calls.length + onFailure.mock.calls.length).toBe(1));
    return { onError, onFailure };
  }

  it('says plainly that recognition is unavailable when the engine cannot start', async () => {
    const { onError, onFailure } = await pressWith(
      new VoiceInput.VoiceCaptureError('recognition-error', 'Failed to initialize recognizer'),
    );

    expect(onError).toHaveBeenCalledWith(VOICE_UNAVAILABLE_MESSAGE);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('turns a plain engine Error thrown while starting into the same plain words', async () => {
    jest.mocked(ExpoSpeechRecognitionModule.start).mockImplementationOnce(() => {
      throw new Error('Failed to initialize recognizer');
    });
    const onError = jest.fn();
    const onFailure = jest.fn();
    const { getByTestId } = render(
      <VoiceInputButton onTranscription={jest.fn()} onError={onError} onFailure={onFailure} />,
    );
    await act(async () => {
      fireEvent(getByTestId('voice-input-button'), 'pressIn');
    });
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));

    expect(onError).toHaveBeenCalledWith(VOICE_UNAVAILABLE_MESSAGE);
    expect(onError.mock.calls[0]![0]).not.toContain('recognizer');
    expect(onFailure).not.toHaveBeenCalled();
  });

  async function pressThenNativeError(event: { error: string; message: string; code?: number }) {
    const onError = jest.fn();
    const onFailure = jest.fn();
    const { getByTestId } = render(
      <VoiceInputButton onTranscription={jest.fn()} onError={onError} onFailure={onFailure} />,
    );
    await act(async () => {
      fireEvent(getByTestId('voice-input-button'), 'pressIn');
    });
    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalled());
    const errorListeners = jest
      .mocked(ExpoSpeechRecognitionModule.addListener)
      .mock.calls.filter(([name]) => name === 'error')
      .map(([, listener]) => listener as (payload: unknown) => void);
    await act(async () => {
      for (const listener of errorListeners) listener(event);
    });
    await waitFor(() => expect(onError.mock.calls.length + onFailure.mock.calls.length).toBe(1));
    return { onError, onFailure };
  }

  it('says recognition is unavailable, with no retry, when the recognizer fails to initialize', async () => {
    const { onError, onFailure } = await pressThenNativeError({
      error: 'audio-capture',
      message: 'Failed to initialize recognizer',
    });

    expect(onError).toHaveBeenCalledWith(VOICE_UNAVAILABLE_MESSAGE);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('treats an Android recognizer that could not be created as unavailable', async () => {
    const { onError, onFailure } = await pressThenNativeError({
      error: 'audio-capture',
      message: 'SpeechRecognizer is not available',
      code: -1,
    });

    expect(onError).toHaveBeenCalledWith(VOICE_UNAVAILABLE_MESSAGE);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('keeps the retry prompt for an audio failure after the recognizer started', async () => {
    const { onError, onFailure } = await pressThenNativeError({
      error: 'audio-capture',
      message: 'Failure occurred during speech recognition.',
    });

    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('keeps the say-it-again prompt for a recording that heard nothing', async () => {
    const { onError, onFailure } = await pressWith(
      new VoiceInput.VoiceCaptureError('recognition-error', 'No speech detected', 'no-speech'),
    );

    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });
});

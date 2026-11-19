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

describe('VoiceInputButton long-press handoff', () => {
  beforeEach(async () => {
    await VoiceInput.cancelCapture();
    jest.clearAllMocks();
    useSettingsStore.setState({ dictationOnboardingSeen: true });
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
    expect(button).toHaveStyle({ width: 44, height: 44 });

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

describe('VoiceInputButton long-press after the hold could not start speech', () => {
  const recognizerError = () =>
    new VoiceInput.VoiceCaptureError('recognition-error', 'Failed to initialize recognizer');

  beforeEach(async () => {
    await VoiceInput.cancelCapture();
    jest.restoreAllMocks();
    jest.clearAllMocks();
    useSettingsStore.setState({ dictationOnboardingSeen: true, voiceEnabled: true });
  });

  function renderComposerButton() {
    const notices: string[] = [];
    const openVoiceMode = jest.fn();
    function ComposerButton() {
      const [resetSignal, setResetSignal] = React.useState(0);
      return (
        <VoiceInputButton
          onTranscription={jest.fn()}
          onLongPress={openVoiceMode}
          onError={(message) => {
            notices.push(message);
            setResetSignal((value) => value + 1);
          }}
          onFailure={() => notices.push('missed')}
          resetSignal={resetSignal}
        />
      );
    }
    const screen = render(<ComposerButton />);
    return { button: screen.getByTestId('voice-input-button'), notices, openVoiceMode };
  }

  async function longPress(button: ReturnType<typeof renderComposerButton>['button']) {
    await act(async () => {
      fireEvent(button, 'longPress');
    });
    await act(async () => {
      fireEvent(button, 'pressOut');
    });
  }

  it('gives one notice and does not open voice mode when the start is refused', async () => {
    jest.spyOn(VoiceService, 'startRecording').mockRejectedValue(recognizerError());
    const { button, notices, openVoiceMode } = renderComposerButton();

    await act(async () => {
      fireEvent(button, 'pressIn');
    });
    await waitFor(() => expect(notices).toEqual([VOICE_UNAVAILABLE_MESSAGE]));
    await longPress(button);

    expect(openVoiceMode).not.toHaveBeenCalled();
    expect(notices).toEqual([VOICE_UNAVAILABLE_MESSAGE]);
  });

  it('gives one notice and does not open voice mode when the recognizer fails right after starting', async () => {
    const { button, notices, openVoiceMode } = renderComposerButton();

    await act(async () => {
      fireEvent(button, 'pressIn');
    });
    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(1));
    const errorListeners = jest
      .mocked(ExpoSpeechRecognitionModule.addListener)
      .mock.calls.filter(([name]) => name === 'error')
      .map(([, listener]) => listener as (payload: unknown) => void);
    await act(async () => {
      for (const listener of errorListeners)
        listener({ error: 'audio-capture', message: 'Failed to initialize recognizer' });
    });
    await waitFor(() => expect(notices).toEqual([VOICE_UNAVAILABLE_MESSAGE]));
    await longPress(button);

    expect(openVoiceMode).not.toHaveBeenCalled();
    expect(notices).toEqual([VOICE_UNAVAILABLE_MESSAGE]);
  });

  it('still opens voice mode when a recording from an earlier tap fails during this press', async () => {
    const { button, notices, openVoiceMode } = renderComposerButton();

    await act(async () => {
      fireEvent(button, 'pressIn');
    });
    await act(async () => {
      fireEvent(button, 'pressOut');
    });
    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(1));
    await act(async () => {
      fireEvent(button, 'pressIn');
    });
    const errorListeners = jest
      .mocked(ExpoSpeechRecognitionModule.addListener)
      .mock.calls.filter(([name]) => name === 'error')
      .map(([, listener]) => listener as (payload: unknown) => void);
    await act(async () => {
      for (const listener of errorListeners)
        listener({ error: 'audio-capture', message: 'Failed to initialize recognizer' });
    });
    await waitFor(() => expect(notices).toEqual([VOICE_UNAVAILABLE_MESSAGE]));
    await longPress(button);

    expect(openVoiceMode).toHaveBeenCalledTimes(1);
    expect(notices).toEqual([VOICE_UNAVAILABLE_MESSAGE]);
  });

  it('opens voice mode on the next long-press once speech starts again', async () => {
    jest.spyOn(VoiceService, 'startRecording').mockRejectedValueOnce(recognizerError());
    const { button, notices, openVoiceMode } = renderComposerButton();

    await act(async () => {
      fireEvent(button, 'pressIn');
    });
    await waitFor(() => expect(notices).toHaveLength(1));
    await longPress(button);

    await act(async () => {
      fireEvent(button, 'pressIn');
    });
    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(1));
    await longPress(button);

    expect(openVoiceMode).toHaveBeenCalledTimes(1);
    expect(VoiceInput.isCapturing()).toBe(false);
    expect(notices).toHaveLength(1);
  });
});

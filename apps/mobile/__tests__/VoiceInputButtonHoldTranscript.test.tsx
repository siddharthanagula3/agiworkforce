import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

const mockSpeechListeners: Record<string, Array<(...args: unknown[]) => void>> = {};

jest.mock('expo-speech-recognition', () => {
  const getListeners = (name: string) => (mockSpeechListeners[name] ||= []);
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
            mockSpeechListeners[name] = getListeners(name).filter((cb) => cb !== fn);
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

jest.mock('@/src/features/voice/components/VoiceOnboardingSheet', () => {
  const mockReact = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    VoiceOnboardingSheet: () => mockReact.createElement(View, { testID: 'dictation-intro' }),
  };
});

import {
  VoiceInputButton,
  type VoiceInputHandle,
} from '@/src/features/voice/components/VoiceInputButton';
import * as VoiceInput from '@/src/features/voice/services/voiceInput';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { useSettingsStore } from '@/stores/settingsStore';

function emitInterim(transcript: string) {
  act(() => {
    for (const listener of mockSpeechListeners.result ?? []) {
      listener({ results: [{ transcript, confidence: 0.4 }], isFinal: false });
    }
  });
}

describe('VoiceInputButton words heard and hold to talk', () => {
  beforeEach(async () => {
    await VoiceInput.cancelCapture();
    jest.clearAllMocks();
    useSettingsStore.setState({ dictationOnboardingSeen: true, voiceEnabled: true });
  });

  it('passes each interim result to the composer while it owns the recording', async () => {
    const controlRef = React.createRef<VoiceInputHandle>();
    const onPartialTranscript = jest.fn();
    const onRecordingStart = jest.fn();
    render(
      <VoiceInputButton
        controlRef={controlRef}
        onTranscription={jest.fn()}
        onPartialTranscript={onPartialTranscript}
        onRecordingStart={onRecordingStart}
      />,
    );

    await act(async () => controlRef.current?.hold());
    await waitFor(() => expect(onRecordingStart).toHaveBeenCalledTimes(1));
    expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(
      expect.objectContaining({ interimResults: true }),
    );

    emitInterim('book the');
    emitInterim('book the meeting room');
    expect(onPartialTranscript.mock.calls).toEqual([['book the'], ['book the meeting room']]);

    await act(async () => controlRef.current?.cancel());
    emitInterim('after cancel');
    expect(onPartialTranscript).toHaveBeenCalledTimes(2);
  });

  it('starts a hold recording from the composer once the dictation intro has been seen', async () => {
    const controlRef = React.createRef<VoiceInputHandle>();
    const onRecordingStart = jest.fn();
    const view = render(
      <VoiceInputButton
        controlRef={controlRef}
        onTranscription={jest.fn()}
        onRecordingStart={onRecordingStart}
      />,
    );

    await act(async () => controlRef.current?.hold());
    await waitFor(() => expect(onRecordingStart).toHaveBeenCalledTimes(1));
    expect(view.getByLabelText('Release to transcribe')).toBeTruthy();
    expect(view.queryByTestId('dictation-intro')).toBeNull();
  });

  it('opens the dictation intro instead of recording on the first hold', async () => {
    useSettingsStore.setState({ dictationOnboardingSeen: false });
    const controlRef = React.createRef<VoiceInputHandle>();
    const view = render(<VoiceInputButton controlRef={controlRef} onTranscription={jest.fn()} />);

    await act(async () => controlRef.current?.hold());

    expect(view.getByTestId('dictation-intro')).toBeTruthy();
    expect(ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();
  });

  it('ignores a hold while answering is in progress', async () => {
    const controlRef = React.createRef<VoiceInputHandle>();
    render(<VoiceInputButton controlRef={controlRef} onTranscription={jest.fn()} disabled />);

    await act(async () => controlRef.current?.hold());

    expect(ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();
  });

  it('tells the composer when a hold can start dictation', () => {
    const onHoldAvailableChange = jest.fn();
    const view = render(
      <VoiceInputButton
        onTranscription={jest.fn()}
        onHoldAvailableChange={onHoldAvailableChange}
      />,
    );
    expect(onHoldAvailableChange).toHaveBeenLastCalledWith(true);

    view.rerender(
      <VoiceInputButton
        onTranscription={jest.fn()}
        onHoldAvailableChange={onHoldAvailableChange}
        disabled
      />,
    );
    expect(onHoldAvailableChange).toHaveBeenLastCalledWith(false);

    view.rerender(
      <VoiceInputButton
        onTranscription={jest.fn()}
        onHoldAvailableChange={onHoldAvailableChange}
      />,
    );
    act(() => useSettingsStore.setState({ voiceEnabled: false }));
    expect(onHoldAvailableChange).toHaveBeenLastCalledWith(false);

    act(() => useSettingsStore.setState({ voiceEnabled: true }));
    expect(onHoldAvailableChange).toHaveBeenLastCalledWith(true);
    view.unmount();
    expect(onHoldAvailableChange).toHaveBeenLastCalledWith(false);
  });
});

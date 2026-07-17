/**
 * Regression test for the mic-button long-press race condition.
 *
 * PTT auto-starts a recording 300ms into a held press; a long press (>=600ms
 * on the SAME held touch) opens voice-conversation mode. Any hold past 600ms
 * therefore always has a PTT recording already running underneath. Before
 * this fix, `handlePressOut` bailed out on `isLongPressRef.current` before
 * ever reaching the stop/cancel branches, so the recording was silently
 * orphaned: no stop affordance was reachable, the parent composer stayed
 * stuck showing a live waveform/timer for a session nothing was watching,
 * and the voice-conversation screen's own "tap to speak" orb no-op'd because
 * the shared capture singleton still reported itself active.
 */
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

    // Press in, then wait past the 300ms PTT auto-start threshold so the
    // recording is genuinely live (matches a real held touch).
    await act(async () => {
      fireEvent(button, 'pressIn');
    });
    await waitFor(() => expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onRecordingStart).toHaveBeenCalledTimes(1));
    expect(VoiceInput.isCapturing()).toBe(true);

    // Long press fires on the same held touch (RNTL invokes onLongPress
    // directly rather than simulating the real 600ms native timer).
    await act(async () => {
      fireEvent(button, 'longPress');
    });

    // The orphaned-recording bug: this used to stay true, leaving the shared
    // capture singleton active so voice-conversation mode's own orb-tap
    // silently no-ops.
    expect(VoiceInput.isCapturing()).toBe(false);
    // The parent composer must be told to drop out of its recording UI --
    // otherwise it's stuck showing a live waveform/timer for nothing.
    expect(onRecordingStop).toHaveBeenCalledTimes(1);
    // Voice mode still opens -- the long press itself is not swallowed.
    expect(onLongPress).toHaveBeenCalledTimes(1);
    // No transcript should surface from the discarded partial recording.
    expect(onTranscription).not.toHaveBeenCalled();

    // Release: must not double-fire a stop/cancel now that the button
    // already tore its own state down when the long press landed.
    await act(async () => {
      fireEvent(button, 'pressOut');
    });
    expect(onRecordingStop).toHaveBeenCalledTimes(1);
  });
});

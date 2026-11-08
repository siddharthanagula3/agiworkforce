import React from 'react';
import { AppState, Text, View } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useVoiceConversation } from '@/src/features/voice/hooks/useVoiceConversation';
import * as VoiceInput from '@/src/features/voice/services/voiceInput';
import type {
  VoiceOutputHandle,
  VoiceOutputOptions,
  VoiceOutputOutcome,
  VoiceOutputOwner,
} from '@/src/features/voice/services/voiceOutput';

jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: { voiceEnabled: boolean }) => unknown) =>
    selector({ voiceEnabled: true }),
}));
jest.mock('@/src/features/voice/services/speechSettings', () => ({
  activeSpeechLanguage: () => 'en',
  autoListenEnabled: () => false,
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('@/src/features/voice/services/voiceInput', () => ({
  VoiceCaptureError: class extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  isCapturing: jest.fn().mockReturnValue(false),
  startCaptureSession: jest.fn(),
  stopCapture: jest.fn(),
  cancelCapture: jest.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

function createOwner() {
  let disposed = false;
  const playback: Array<{
    handle: VoiceOutputHandle;
    resolve: (outcome: VoiceOutputOutcome) => void;
  }> = [];
  const start = jest.fn((_text: string, _options?: VoiceOutputOptions): VoiceOutputHandle => {
    const completion = deferred<VoiceOutputOutcome>();
    const handle = {
      done: completion.promise,
      stop: jest.fn(async () => {
        completion.resolve({ status: 'stopped' });
      }),
    };
    playback.push({ handle, resolve: completion.resolve });
    return handle;
  });
  const owner: VoiceOutputOwner = {
    source: { scope: 'local' },
    isCurrent: () => !disposed,
    start,
    stop: () => playback[playback.length - 1]?.handle.stop() ?? Promise.resolve(),
    dispose: async () => {
      disposed = true;
      await owner.stop();
    },
  };
  return { owner, start, playback };
}

function Harness({
  owner,
  send,
  onCaptureError,
}: {
  owner: VoiceOutputOwner;
  send: (text: string) => Promise<string>;
  onCaptureError?: (error: unknown) => void;
}) {
  const conversation = useVoiceConversation({
    enabled: true,
    hapticsEnabled: false,
    speechOwner: owner,
    sendMessage: send,
    onCaptureError,
  });
  return (
    <View>
      <Text
        testID="submit"
        onPress={() => {
          void conversation.submitText('question');
        }}
      >
        Send
      </Text>
      <Text
        testID="end"
        onPress={() => {
          void conversation.endConversation();
        }}
      >
        End
      </Text>
      <Text testID="orb" onPress={conversation.handleOrbPress}>
        Listen
      </Text>
      <Text testID="phase">{conversation.phase}</Text>
    </View>
  );
}

describe('voice response and capture owner boundaries', () => {
  const startCapture = VoiceInput.startCaptureSession as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    startCapture.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('never hands an old response to a replacement speech owner', async () => {
    const oldSend = deferred<string>();
    const first = createOwner();
    const second = createOwner();
    const sendFirst = jest.fn(() => oldSend.promise);
    const sendSecond = jest.fn(async () => 'New response');
    const view = render(<Harness owner={first.owner} send={sendFirst} />);
    fireEvent.press(view.getByTestId('submit'));
    await waitFor(() => expect(sendFirst).toHaveBeenCalledTimes(1));
    view.rerender(<Harness owner={second.owner} send={sendSecond} />);
    await act(async () => {
      oldSend.resolve('Old response');
    });
    expect(first.start).not.toHaveBeenCalled();
    expect(second.start).not.toHaveBeenCalled();
    expect(view.getByTestId('phase').props.children).toBe('idle');

    fireEvent.press(view.getByTestId('submit'));
    await waitFor(() =>
      expect(second.start).toHaveBeenCalledWith('New response', expect.any(Object)),
    );
    expect(view.getByTestId('phase').props.children).toBe('speaking');
  });

  it('ignores an old reply after background and foreground restore the same owner', async () => {
    let listener!: (state: string) => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
      listener = callback as (state: string) => void;
      return { remove: jest.fn() };
    });
    const pending = deferred<string>();
    const source = createOwner();
    const send = jest.fn(() => pending.promise);
    const view = render(<Harness owner={source.owner} send={send} />);
    fireEvent.press(view.getByTestId('submit'));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    act(() => {
      listener('background');
      listener('active');
    });
    await act(async () => {
      pending.resolve('Old foreground response');
    });
    expect(source.start).not.toHaveBeenCalled();
  });

  it('cannot stop new speech when an older exact capture cleanup finally resolves', async () => {
    const captureCancelled = deferred<void>();
    const capture: VoiceInput.VoiceCaptureSession = {
      result: new Promise(() => {}),
      stop: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn(() => captureCancelled.promise),
    };
    startCapture.mockResolvedValue(capture);
    const first = createOwner();
    const second = createOwner();
    const send = jest.fn(async () => 'Response');
    const view = render(<Harness owner={first.owner} send={send} />);
    fireEvent.press(view.getByTestId('orb'));
    await waitFor(() => expect(view.getByTestId('phase').props.children).toBe('listening'));
    fireEvent.press(view.getByTestId('end'));
    expect(startCapture.mock.calls[0][2].signal.aborted).toBe(true);
    expect(capture.cancel).toHaveBeenCalledTimes(1);

    view.rerender(<Harness owner={second.owner} send={send} />);
    fireEvent.press(view.getByTestId('submit'));
    await waitFor(() => expect(second.start).toHaveBeenCalledTimes(1));
    const replacement = second.playback[0].handle;
    await act(async () => {
      captureCancelled.resolve();
    });
    expect(replacement.stop).not.toHaveBeenCalled();
    expect(view.getByTestId('phase').props.children).toBe('speaking');
    expect(VoiceInput.cancelCapture).not.toHaveBeenCalled();
  });

  it('aborts pending start ownership and ignores its later failure in a replacement session', async () => {
    const pending = deferred<VoiceInput.VoiceCaptureSession>();
    startCapture.mockReturnValue(pending.promise);
    const first = createOwner();
    const second = createOwner();
    const oldError = jest.fn();
    const newError = jest.fn();
    const send = async () => 'Response';
    const view = render(<Harness owner={first.owner} send={send} onCaptureError={oldError} />);
    fireEvent.press(view.getByTestId('orb'));
    await waitFor(() => expect(startCapture).toHaveBeenCalledTimes(1));
    const signal = startCapture.mock.calls[0][2].signal as AbortSignal;
    view.rerender(<Harness owner={second.owner} send={send} onCaptureError={newError} />);
    expect(signal.aborted).toBe(true);
    await act(async () => {
      pending.reject(new Error('Old startup failure'));
    });
    expect(oldError).not.toHaveBeenCalled();
    expect(newError).not.toHaveBeenCalled();
    expect(view.getByTestId('phase').props.children).toBe('idle');
    expect(VoiceInput.cancelCapture).not.toHaveBeenCalled();
  });
});

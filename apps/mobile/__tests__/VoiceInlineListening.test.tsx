import React from 'react';
import { Text, View } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useVoiceConversation } from '@/src/features/voice/hooks/useVoiceConversation';
import * as VoiceInput from '@/src/features/voice/services/voiceInput';
import type {
  VoiceOutputHandle,
  VoiceOutputOutcome,
  VoiceOutputOwner,
} from '@/src/features/voice/services/voiceOutput';

let mockAutoListen = true;

jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: { voiceEnabled: boolean }) => unknown) =>
    selector({ voiceEnabled: true }),
}));
jest.mock('@/src/features/voice/services/speechSettings', () => ({
  activeSpeechLanguage: () => 'en',
  autoListenEnabled: () => mockAutoListen,
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

interface FakeCapture {
  session: VoiceInput.VoiceCaptureSession;
  finish: (text: string) => void;
  cancel: jest.Mock;
}

function fakeCapture(): FakeCapture {
  let finish!: (text: string) => void;
  const result = new Promise<{ text: string }>((resolve) => {
    finish = (text) => resolve({ text });
  });
  const cancel = jest.fn().mockResolvedValue(undefined);
  const session = {
    result,
    stop: jest.fn().mockResolvedValue(undefined),
    cancel,
  } as unknown as VoiceInput.VoiceCaptureSession;
  return { session, finish, cancel };
}

function createOwner() {
  const finishSpeech: Array<(outcome: VoiceOutputOutcome) => void> = [];
  const owner: VoiceOutputOwner = {
    source: { scope: 'local' },
    isCurrent: () => true,
    start: jest.fn((): VoiceOutputHandle => {
      let resolve!: (outcome: VoiceOutputOutcome) => void;
      const done = new Promise<VoiceOutputOutcome>((accept) => {
        resolve = accept;
      });
      finishSpeech.push(resolve);
      return { done, stop: jest.fn().mockResolvedValue(undefined) };
    }),
    stop: () => Promise.resolve(),
    dispose: () => Promise.resolve(),
  };
  return { owner, finishSpeech };
}

function Harness({
  enabled,
  listenOnEnable,
  owner,
}: {
  enabled: boolean;
  listenOnEnable: boolean;
  owner: VoiceOutputOwner;
}) {
  const conversation = useVoiceConversation({
    enabled,
    listenOnEnable,
    hapticsEnabled: false,
    speechOwner: owner,
    sendMessage: async () => 'Reply',
  });
  return (
    <View>
      <Text testID="mic" onPress={conversation.handleMicPress}>
        Mic
      </Text>
      <Text testID="phase">{conversation.phase}</Text>
      <Text testID="muted">{String(conversation.muted)}</Text>
    </View>
  );
}

describe('the voice bar inside a chat starts and resumes the microphone', () => {
  const startCapture = VoiceInput.startCaptureSession as jest.Mock;
  const phaseOf = (view: ReturnType<typeof render>) => view.getByTestId('phase').props.children;

  beforeEach(() => {
    jest.clearAllMocks();
    startCapture.mockReset();
    mockAutoListen = true;
  });

  it('starts listening as soon as the bar opens', async () => {
    startCapture.mockResolvedValue(fakeCapture().session);
    const { owner } = createOwner();
    const view = render(<Harness enabled={false} listenOnEnable owner={owner} />);
    expect(startCapture).not.toHaveBeenCalled();

    view.rerender(<Harness enabled listenOnEnable owner={owner} />);

    await waitFor(() => expect(phaseOf(view)).toBe('listening'));
    expect(startCapture).toHaveBeenCalledTimes(1);
  });

  it('stays idle on open when the caller did not ask for it', async () => {
    const { owner } = createOwner();
    const view = render(<Harness enabled={false} listenOnEnable={false} owner={owner} />);

    view.rerender(<Harness enabled listenOnEnable={false} owner={owner} />);
    await act(async () => {});

    expect(startCapture).not.toHaveBeenCalled();
    expect(phaseOf(view)).toBe('idle');
  });

  it('mutes while listening and listens again on the next press', async () => {
    const first = fakeCapture();
    startCapture.mockResolvedValueOnce(first.session).mockResolvedValue(fakeCapture().session);
    const { owner } = createOwner();
    const view = render(<Harness enabled={false} listenOnEnable owner={owner} />);
    view.rerender(<Harness enabled listenOnEnable owner={owner} />);
    await waitFor(() => expect(phaseOf(view)).toBe('listening'));

    fireEvent.press(view.getByTestId('mic'));
    await waitFor(() => expect(phaseOf(view)).toBe('idle'));
    expect(view.getByTestId('muted').props.children).toBe('true');
    expect(first.cancel).toHaveBeenCalledTimes(1);

    fireEvent.press(view.getByTestId('mic'));
    await waitFor(() => expect(phaseOf(view)).toBe('listening'));
    expect(view.getByTestId('muted').props.children).toBe('false');
    expect(startCapture).toHaveBeenCalledTimes(2);
  });

  it('lets the mic button start a new turn when listening does not resume by itself', async () => {
    mockAutoListen = false;
    const first = fakeCapture();
    startCapture.mockResolvedValueOnce(first.session).mockResolvedValue(fakeCapture().session);
    const { owner, finishSpeech } = createOwner();
    const view = render(<Harness enabled={false} listenOnEnable owner={owner} />);
    view.rerender(<Harness enabled listenOnEnable owner={owner} />);
    await waitFor(() => expect(phaseOf(view)).toBe('listening'));

    await act(async () => {
      first.finish('A question');
    });
    await waitFor(() => expect(phaseOf(view)).toBe('speaking'));
    await act(async () => {
      finishSpeech[0]?.({ status: 'done' });
    });
    await waitFor(() => expect(phaseOf(view)).toBe('idle'));
    expect(startCapture).toHaveBeenCalledTimes(1);

    fireEvent.press(view.getByTestId('mic'));

    await waitFor(() => expect(phaseOf(view)).toBe('listening'));
    expect(view.getByTestId('muted').props.children).toBe('false');
    expect(startCapture).toHaveBeenCalledTimes(2);
  });

  it('returns to idle, not a stuck speaking state, when muted before the reply ends', async () => {
    const first = fakeCapture();
    startCapture.mockResolvedValue(first.session);
    const { owner, finishSpeech } = createOwner();
    const view = render(<Harness enabled={false} listenOnEnable owner={owner} />);
    view.rerender(<Harness enabled listenOnEnable owner={owner} />);
    await waitFor(() => expect(phaseOf(view)).toBe('listening'));
    await act(async () => {
      first.finish('A question');
    });
    await waitFor(() => expect(phaseOf(view)).toBe('speaking'));

    fireEvent.press(view.getByTestId('mic'));
    expect(view.getByTestId('muted').props.children).toBe('true');
    await act(async () => {
      finishSpeech[0]?.({ status: 'done' });
    });

    await waitFor(() => expect(phaseOf(view)).toBe('idle'));
    expect(startCapture).toHaveBeenCalledTimes(1);
  });
});

/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Text, View } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useFocusBoundVisibility } from '@/src/features/voice/hooks/useInlineVoiceBar';
import { useOpeningVoiceTurn } from '@/src/features/voice/hooks/useOpeningVoiceTurn';
import { discardVoiceHandoff, openVoiceHandoff } from '@/src/features/voice/services/voiceHandoff';
import { useVoiceConversation } from '@/src/features/voice/hooks/useVoiceConversation';
import * as VoiceInput from '@/src/features/voice/services/voiceInput';
import type {
  VoiceOutputHandle,
  VoiceOutputOutcome,
  VoiceOutputOwner,
} from '@/src/features/voice/services/voiceOutput';

type FocusListener = () => void;

const mockFocus = {
  focused: true,
  listeners: new Set<FocusListener>(),
  set(next: boolean) {
    this.focused = next;
    this.listeners.forEach((listener) => listener());
  },
  subscribe(listener: FocusListener) {
    mockFocus.listeners.add(listener);
    return () => {
      mockFocus.listeners.delete(listener);
    };
  },
  get() {
    return mockFocus.focused;
  },
};

jest.mock('expo-router', () => {
  const React = require('react');
  const { expoRouterMock } = require('../__mocks__/expo-router.mock');
  return expoRouterMock({
    useFocusEffect: (effect: () => void | (() => void)) => {
      const focused = React.useSyncExternalStore(mockFocus.subscribe, mockFocus.get);
      React.useEffect(() => (focused ? effect() : undefined), [effect, focused]);
    },
  });
});
jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: { voiceEnabled: boolean }) => unknown) =>
    selector({ voiceEnabled: true }),
}));
jest.mock('@/src/features/voice/services/speechSettings', () => ({
  activeSpeechLanguage: () => 'en',
  autoListenEnabled: () => true,
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
  const stopSpeech = jest.fn().mockResolvedValue(undefined);
  const owner: VoiceOutputOwner = {
    source: { scope: 'local' },
    isCurrent: () => true,
    start: jest.fn((): VoiceOutputHandle => {
      let resolve!: (outcome: VoiceOutputOutcome) => void;
      const done = new Promise<VoiceOutputOutcome>((accept) => {
        resolve = accept;
      });
      finishSpeech.push(resolve);
      return { done, stop: stopSpeech };
    }),
    stop: () => Promise.resolve(),
    dispose: () => Promise.resolve(),
  };
  return { owner, finishSpeech, stopSpeech };
}

interface HarnessProps {
  conversationKey: string;
  owner: VoiceOutputOwner;
  sendMessage?: (text: string) => Promise<string>;
  acceptHandoff?: boolean;
}

function Harness({ conversationKey, owner, sendMessage, acceptHandoff }: HarnessProps) {
  const [visible, setVisible] = useFocusBoundVisibility(conversationKey);
  const { openingTurn, onOpeningTurnStarted } = useOpeningVoiceTurn(
    acceptHandoff ? conversationKey : undefined,
    visible,
    setVisible,
  );
  const conversation = useVoiceConversation({
    enabled: visible,
    listenOnEnable: true,
    openingTurn,
    onOpeningTurnStarted,
    hapticsEnabled: false,
    speechOwner: owner,
    sendMessage: sendMessage ?? (async () => 'Reply'),
  });
  return (
    <View>
      <Text testID="open" onPress={() => setVisible(true)}>
        Open
      </Text>
      <Text testID="close" onPress={() => setVisible(false)}>
        Close
      </Text>
      <Text testID="visible">{String(visible)}</Text>
      <Text testID="phase">{conversation.phase}</Text>
    </View>
  );
}

describe('the inline voice bar only listens and speaks while it is on screen', () => {
  const startCapture = VoiceInput.startCaptureSession as jest.Mock;
  const phaseOf = (view: ReturnType<typeof render>) => view.getByTestId('phase').props.children;
  const visibleOf = (view: ReturnType<typeof render>) => view.getByTestId('visible').props.children;

  async function openBar(view: ReturnType<typeof render>) {
    fireEvent.press(view.getByTestId('open'));
    await waitFor(() => expect(phaseOf(view)).toBe('listening'));
  }

  beforeEach(() => {
    jest.clearAllMocks();
    startCapture.mockReset();
    mockFocus.focused = true;
    mockFocus.listeners.clear();
  });

  it('listens as soon as the bar opens on the focused screen', async () => {
    const capture = fakeCapture();
    startCapture.mockResolvedValue(capture.session);
    const { owner } = createOwner();
    const view = render(<Harness conversationKey="chat-x" owner={owner} />);

    await openBar(view);

    expect(visibleOf(view)).toBe('true');
    expect(startCapture).toHaveBeenCalledTimes(1);
  });

  it('closes the bar and stops the microphone when the screen loses focus', async () => {
    const capture = fakeCapture();
    startCapture.mockResolvedValue(capture.session);
    const { owner } = createOwner();
    const view = render(<Harness conversationKey="chat-x" owner={owner} />);
    await openBar(view);

    act(() => mockFocus.set(false));

    await waitFor(() => expect(visibleOf(view)).toBe('false'));
    expect(capture.cancel).toHaveBeenCalledTimes(1);
  });

  it('does not listen again when the screen regains focus', async () => {
    startCapture.mockResolvedValue(fakeCapture().session);
    const { owner } = createOwner();
    const view = render(<Harness conversationKey="chat-x" owner={owner} />);
    await openBar(view);
    act(() => mockFocus.set(false));
    await waitFor(() => expect(visibleOf(view)).toBe('false'));

    act(() => mockFocus.set(true));
    await act(async () => {});

    expect(visibleOf(view)).toBe('false');
    expect(startCapture).toHaveBeenCalledTimes(1);
  });

  it('stops speaking the reply and does not listen again when the screen loses focus', async () => {
    const capture = fakeCapture();
    startCapture.mockResolvedValue(capture.session);
    const { owner, finishSpeech, stopSpeech } = createOwner();
    const view = render(<Harness conversationKey="chat-x" owner={owner} />);
    await openBar(view);
    await act(async () => {
      capture.finish('A question');
    });
    await waitFor(() => expect(phaseOf(view)).toBe('speaking'));

    act(() => mockFocus.set(false));
    await act(async () => {
      finishSpeech[0]?.({ status: 'done' });
    });

    expect(stopSpeech).toHaveBeenCalledTimes(1);
    expect(visibleOf(view)).toBe('false');
    expect(startCapture).toHaveBeenCalledTimes(1);
  });

  it('does not speak or listen after a reply that arrives once the screen lost focus', async () => {
    const capture = fakeCapture();
    startCapture.mockResolvedValue(capture.session);
    const { owner } = createOwner();
    let deliverReply!: (reply: string) => void;
    const sendMessage = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          deliverReply = resolve;
        }),
    );
    const view = render(
      <Harness conversationKey="new-chat" owner={owner} sendMessage={sendMessage} />,
    );
    await openBar(view);
    await act(async () => {
      capture.finish('A question');
    });
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));

    act(() => mockFocus.set(false));
    await act(async () => {
      deliverReply('The answer');
    });

    expect(owner.start).not.toHaveBeenCalled();
    expect(startCapture).toHaveBeenCalledTimes(1);
    expect(visibleOf(view)).toBe('false');
  });

  it('closes the bar and stops the microphone when the chat changes, and does not listen in the new chat', async () => {
    const capture = fakeCapture();
    startCapture.mockResolvedValue(capture.session);
    const chatX = createOwner();
    const chatY = createOwner();
    const view = render(<Harness conversationKey="chat-x" owner={chatX.owner} />);
    await openBar(view);

    view.rerender(<Harness conversationKey="chat-y" owner={chatY.owner} />);
    await act(async () => {});

    expect(visibleOf(view)).toBe('false');
    expect(capture.cancel).toHaveBeenCalled();
    expect(startCapture).toHaveBeenCalledTimes(1);
  });

  it('keeps the bar closed when the user returns to the first chat', async () => {
    startCapture.mockResolvedValue(fakeCapture().session);
    const chatX = createOwner();
    const chatY = createOwner();
    const view = render(<Harness conversationKey="chat-x" owner={chatX.owner} />);
    await openBar(view);
    view.rerender(<Harness conversationKey="chat-y" owner={chatY.owner} />);
    await act(async () => {});

    view.rerender(<Harness conversationKey="chat-x" owner={chatX.owner} />);
    await act(async () => {});

    expect(visibleOf(view)).toBe('false');
    expect(startCapture).toHaveBeenCalledTimes(1);
  });

  it('lets the user open the bar again in the new chat', async () => {
    startCapture.mockResolvedValue(fakeCapture().session);
    const chatX = createOwner();
    const chatY = createOwner();
    const view = render(<Harness conversationKey="chat-x" owner={chatX.owner} />);
    await openBar(view);
    view.rerender(<Harness conversationKey="chat-y" owner={chatY.owner} />);
    await act(async () => {});
    startCapture.mockResolvedValue(fakeCapture().session);

    await openBar(view);

    expect(visibleOf(view)).toBe('true');
    expect(startCapture).toHaveBeenCalledTimes(2);
  });

  it('still closes from the bar itself', async () => {
    const capture = fakeCapture();
    startCapture.mockResolvedValue(capture.session);
    const { owner } = createOwner();
    const view = render(<Harness conversationKey="chat-x" owner={owner} />);
    await openBar(view);

    fireEvent.press(view.getByTestId('close'));

    await waitFor(() => expect(visibleOf(view)).toBe('false'));
    expect(capture.cancel).toHaveBeenCalledTimes(1);
  });

  it('does not open while the screen is not focused, so a late open never starts the microphone', async () => {
    startCapture.mockResolvedValue(fakeCapture().session);
    const { owner } = createOwner();
    const view = render(<Harness conversationKey="new-chat:local" owner={owner} />);
    act(() => mockFocus.set(false));

    fireEvent.press(view.getByTestId('open'));
    await act(async () => {});

    expect(visibleOf(view)).toBe('false');
    expect(startCapture).not.toHaveBeenCalled();
  });

  it('does not open on a screen that regains focus after a late open was refused', async () => {
    startCapture.mockResolvedValue(fakeCapture().session);
    const { owner } = createOwner();
    const view = render(<Harness conversationKey="new-chat:local" owner={owner} />);
    act(() => mockFocus.set(false));
    fireEvent.press(view.getByTestId('open'));

    act(() => mockFocus.set(true));
    await act(async () => {});

    expect(visibleOf(view)).toBe('false');
    expect(startCapture).not.toHaveBeenCalled();
  });

  describe('a voice turn handed from the new-chat tab to the chat it created', () => {
    beforeEach(() => {
      discardVoiceHandoff('chat-1');
    });

    it('opens the bar on the chat, speaks the first reply and listens again after it', async () => {
      const { owner, finishSpeech } = createOwner();
      const sendMessage = jest.fn(async () => 'unused');
      const handoff = openVoiceHandoff('chat-1', 'What is the weather');

      const view = render(
        <Harness conversationKey="chat-1" owner={owner} sendMessage={sendMessage} acceptHandoff />,
      );

      await waitFor(() => expect(visibleOf(view)).toBe('true'));
      await waitFor(() => expect(phaseOf(view)).toBe('thinking'));
      expect(startCapture).not.toHaveBeenCalled();

      startCapture.mockResolvedValue(fakeCapture().session);
      await act(async () => {
        handoff.resolve('It is sunny');
      });
      await waitFor(() => expect(phaseOf(view)).toBe('speaking'));
      expect(owner.start).toHaveBeenCalledWith('It is sunny', expect.anything());
      expect(sendMessage).not.toHaveBeenCalled();

      await act(async () => {
        finishSpeech[0]?.({ status: 'done' });
      });
      await waitFor(() => expect(phaseOf(view)).toBe('listening'));
      expect(startCapture).toHaveBeenCalledTimes(1);
    });

    it('takes the handoff once, so a return to the chat does not replay it', async () => {
      const { owner } = createOwner();
      const handoff = openVoiceHandoff('chat-1', 'Hello');
      const view = render(<Harness conversationKey="chat-1" owner={owner} acceptHandoff />);
      await waitFor(() => expect(visibleOf(view)).toBe('true'));
      await act(async () => {
        handoff.resolve('Hi there');
      });
      await waitFor(() => expect(owner.start).toHaveBeenCalledTimes(1));

      act(() => mockFocus.set(false));
      await waitFor(() => expect(visibleOf(view)).toBe('false'));
      act(() => mockFocus.set(true));
      await act(async () => {});

      expect(visibleOf(view)).toBe('false');
      expect(owner.start).toHaveBeenCalledTimes(1);
    });

    it('leaves a handoff meant for another chat alone', async () => {
      const { owner } = createOwner();
      openVoiceHandoff('chat-2', 'Hello');
      const view = render(<Harness conversationKey="chat-1" owner={owner} acceptHandoff />);
      await act(async () => {});

      expect(visibleOf(view)).toBe('false');
      expect(startCapture).not.toHaveBeenCalled();
      discardVoiceHandoff('chat-2');
    });

    it('does not speak or listen on the chat when the first message failed', async () => {
      const { owner } = createOwner();
      const handoff = openVoiceHandoff('chat-1', 'Hello');
      const view = render(<Harness conversationKey="chat-1" owner={owner} acceptHandoff />);
      await waitFor(() => expect(phaseOf(view)).toBe('thinking'));

      await act(async () => {
        handoff.reject(new Error('Message was not sent.'));
      });

      await waitFor(() => expect(phaseOf(view)).toBe('idle'));
      expect(owner.start).not.toHaveBeenCalled();
      expect(startCapture).not.toHaveBeenCalled();
    });

    it('opens nothing for a chat that no voice turn was handed to', async () => {
      const { owner } = createOwner();
      const view = render(<Harness conversationKey="chat-1" owner={owner} acceptHandoff />);
      await act(async () => {});

      expect(visibleOf(view)).toBe('false');
      expect(startCapture).not.toHaveBeenCalled();
    });
  });
});

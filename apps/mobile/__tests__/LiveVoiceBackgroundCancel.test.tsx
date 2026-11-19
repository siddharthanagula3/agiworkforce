import React from 'react';
import { AppState, Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import {
  endLiveVoiceSessions,
  useLiveVoiceSession,
} from '@/src/features/voice/hooks/useLiveVoiceSession';
import { trackMicPermissionRequest } from '@/src/features/voice/services/micPermissionRequest';

const mockIdentity = { current: true };
const mockSessionIdentity = { id: 'login-1' };
const mockAppendVoiceTurn = jest.fn();
jest.mock('@clerk/expo', () => ({ useSession: () => ({ session: mockSessionIdentity }) }));
jest.mock('@/services/remoteChatGate', () => ({ getRemoteChatDisabledReason: () => null }));
jest.mock('@/stores/chat/conversationRepository', () => ({
  getConversationMessageStore: () => ({
    getState: () => ({
      conversations: [
        { id: 'conv-1', executionMode: 'cloud' },
        { id: 'conv-2', executionMode: 'cloud' },
      ],
    }),
  }),
}));
jest.mock('@/src/features/chat/utils/conversationMode', () => ({
  executionModeForConversation: (conversation: { executionMode: string }) =>
    conversation.executionMode,
}));
jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  subscribeCloudAccountEpochChange: () => () => undefined,
}));
jest.mock('@/src/features/voice/services/liveVoiceAuthority', () => ({
  LIVE_VOICE_SESSION_PATH: '/api/voice/live/sessions',
  captureLiveVoiceAuthority: (isOwner: () => boolean) => {
    const controller = new AbortController();
    const isCurrent = () => !controller.signal.aborted && mockIdentity.current && isOwner();
    return {
      signal: controller.signal,
      isCurrent,
      isIdentityCurrent: () => mockIdentity.current,
      assertCurrent: () => {
        if (!isCurrent()) throw new Error('retired');
      },
      retire: () => controller.abort(),
      fetch: jest.fn(),
      closeCreated: jest.fn(),
    };
  },
}));

const mockStart = jest.fn();
const mockClose = jest.fn();
const mockSettle = jest.fn();

jest.mock('@/src/features/voice/services/liveVoiceModule', () => ({
  loadLiveVoiceModule: async () => ({
    LIVE_VOICE_SESSION_PATH: '/api/voice/live/sessions',
    extendLiveVoiceSession: jest.fn(),
    LiveVoiceSession: { start: (...args: unknown[]) => mockStart(...args) },
    LiveVoiceSessionError: class LiveVoiceSessionError extends Error {},
    settleLiveVoiceSession: (...args: unknown[]) => mockSettle(...args),
  }),
}));

jest.mock('@/src/features/voice/services/liveVoiceAvailability', () => ({
  LIVE_VOICE_MESSAGE: {
    microphoneDenied: 'denied',
    connectionFailed: 'failed',
    sessionEnded: 'ended',
  },
  liveVoiceUnavailableReason: () => null,
}));

const mockMicrophoneRequest = jest.fn<Promise<boolean>, []>();
jest.mock('@/src/features/voice/services/voiceInput', () => ({
  requestMicPermission: async () => true,
  requestMicrophoneOnlyPermission: () => mockMicrophoneRequest(),
}));

jest.mock('@/stores/chatStore', () => ({
  useChatStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ appendVoiceTurn: mockAppendVoiceTurn }),
}));

function Harness({
  onEnded,
  conversationId = 'conv-1',
}: {
  onEnded: (message: string | null) => void;
  conversationId?: string;
}) {
  const controller = useLiveVoiceSession({
    active: true,
    executionMode: 'cloud',
    conversationId,
    model: 'test-model',
    ensureConversation: async () => 'conv-1',
    onEnded,
  });
  return <Text testID="status">{controller.status}</Text>;
}

function changeAppState(state: string) {
  const calls = (AppState.addEventListener as unknown as jest.Mock).mock.calls;
  for (const [event, handler] of calls) {
    if (event === 'change') (handler as (state: string) => void)(state);
  }
}

function backgroundApp() {
  changeAppState('background');
}

function fakeSession(sessionId: string) {
  return {
    sessionId,
    settlement: { ceilingSeconds: 600 },
    close: mockClose,
    settle: mockSettle,
    extend: jest.fn(),
    dispose: jest.fn(),
    setMuted: jest.fn(),
  };
}

describe('live voice session backgrounded mid-connect', () => {
  beforeEach(() => {
    mockIdentity.current = true;
    mockAppendVoiceTurn.mockReset();
    mockStart.mockReset();
    mockSettle.mockReset();
    mockClose.mockReset();
    mockClose.mockResolvedValue({ reason: 'close_requested', seconds: 0 });
    mockMicrophoneRequest.mockReset();
    mockMicrophoneRequest.mockResolvedValue(true);
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ends the original call instead of starting implicitly in a replacement destination', async () => {
    const captured: Array<Record<string, (value?: unknown) => void>> = [];
    mockStart.mockImplementation(
      async (options: { callbacks: Record<string, (value?: unknown) => void> }) => {
        captured.push(options.callbacks);
        return fakeSession(`session-${captured.length}`);
      },
    );
    const onEnded = jest.fn();
    const view = render(<Harness onEnded={onEnded} />);
    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));
    view.rerender(<Harness onEnded={onEnded} conversationId="conv-2" />);
    await waitFor(() => expect(onEnded).toHaveBeenCalledWith('ended'));
    await act(async () => {
      captured[0]?.['onClosed']?.({ reason: 'expired', seconds: 1 });
      captured[0]?.['onError']?.('old failure');
      captured[0]?.['onTranscript']?.({ turnId: 'late', role: 'user', text: 'stale', final: true });
    });
    expect(view.getByTestId('status').props.children).toBe('idle');
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockAppendVoiceTurn).not.toHaveBeenCalled();
  });

  it('suppresses buffered old-account transcript publication', async () => {
    let original!: Record<string, (value?: unknown) => void>;
    mockStart.mockImplementation(async (options: { callbacks: typeof original }) => {
      original = options.callbacks;
      return fakeSession('session-a');
    });
    render(<Harness onEnded={jest.fn()} />);
    await waitFor(() => expect(mockStart).toHaveBeenCalled());
    mockIdentity.current = false;
    await act(async () => {
      original['onTranscript']?.({ turnId: 'private', role: 'user', text: 'private', final: true });
    });
    expect(mockAppendVoiceTurn).not.toHaveBeenCalled();
  });

  it('closes a session that resolves after backgrounding and never attaches it', async () => {
    let resolveStart: (session: unknown) => void = () => undefined;
    mockStart.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStart = resolve;
        }),
    );

    const onEnded = jest.fn();
    const { getByTestId } = render(<Harness onEnded={onEnded} />);

    await waitFor(() => expect(mockStart).toHaveBeenCalled());
    expect(getByTestId('status').props.children).toBe('connecting');

    await act(async () => {
      backgroundApp();
    });
    expect(onEnded).toHaveBeenCalledWith('ended');
    expect(getByTestId('status').props.children).toBe('idle');

    await act(async () => {
      resolveStart(fakeSession('s1'));
    });

    await waitFor(() => expect(mockClose).toHaveBeenCalledTimes(1));
    expect(getByTestId('status').props.children).toBe('idle');
    await waitFor(() => expect(mockSettle).toHaveBeenCalled());
  });

  it('keeps connecting while the system microphone prompt makes the app inactive', async () => {
    mockStart.mockImplementation(async () => fakeSession('s3'));
    const onEnded = jest.fn();
    const { getByTestId } = render(<Harness onEnded={onEnded} />);
    await waitFor(() => expect(mockStart).toHaveBeenCalled());

    await act(async () => {
      changeAppState('inactive');
    });

    expect(onEnded).not.toHaveBeenCalled();
    expect(mockClose).not.toHaveBeenCalled();
    expect(getByTestId('status').props.children).toBe('connecting');
  });

  describe('while this app asks for the microphone', () => {
    let settleRequest: () => void = () => undefined;
    let request: Promise<void> = Promise.resolve();

    function askForMicrophone() {
      request = trackMicPermissionRequest(
        () =>
          new Promise<void>((resolve) => {
            settleRequest = resolve;
          }),
      );
    }

    const originalState = Object.getOwnPropertyDescriptor(AppState, 'currentState');

    afterEach(async () => {
      if (originalState) Object.defineProperty(AppState, 'currentState', originalState);
      settleRequest();
      await request;
    });

    it('keeps connecting when the prompt sends the app to the background', async () => {
      mockStart.mockImplementation(() => new Promise(() => undefined));
      askForMicrophone();
      const onEnded = jest.fn();
      const { getByTestId } = render(<Harness onEnded={onEnded} />);
      await waitFor(() => expect(mockStart).toHaveBeenCalled());

      await act(async () => {
        backgroundApp();
      });

      expect(onEnded).not.toHaveBeenCalled();
      expect(mockClose).not.toHaveBeenCalled();
      expect(getByTestId('status').props.children).toBe('connecting');
    });

    it('ends the call on a background event once the request has settled', async () => {
      mockStart.mockImplementation(() => new Promise(() => undefined));
      askForMicrophone();
      const onEnded = jest.fn();
      const { getByTestId } = render(<Harness onEnded={onEnded} />);
      await waitFor(() => expect(mockStart).toHaveBeenCalled());
      await act(async () => {
        settleRequest();
        await request;
      });

      await act(async () => {
        backgroundApp();
      });

      expect(onEnded).toHaveBeenCalledWith('ended');
      expect(getByTestId('status').props.children).toBe('idle');
    });

    it('does not start a call whose microphone request is granted while the app is in the background', async () => {
      let grant: (granted: boolean) => void = () => undefined;
      mockMicrophoneRequest.mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            grant = resolve;
          }),
      );
      askForMicrophone();
      const onEnded = jest.fn();
      const { getByTestId } = render(<Harness onEnded={onEnded} />);
      await waitFor(() => expect(mockMicrophoneRequest).toHaveBeenCalled());
      await act(async () => {
        backgroundApp();
      });
      expect(getByTestId('status').props.children).toBe('connecting');
      Object.defineProperty(AppState, 'currentState', {
        configurable: true,
        writable: true,
        value: 'background',
      });

      await act(async () => {
        grant(true);
      });

      expect(mockStart).not.toHaveBeenCalled();
      expect(onEnded).toHaveBeenCalledWith('ended');
      expect(getByTestId('status').props.children).toBe('idle');
    });

    it('starts a call whose microphone request is granted after the app returned to the foreground', async () => {
      let grant: (granted: boolean) => void = () => undefined;
      mockMicrophoneRequest.mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            grant = resolve;
          }),
      );
      mockStart.mockImplementation(() => new Promise(() => undefined));
      askForMicrophone();
      const onEnded = jest.fn();
      render(<Harness onEnded={onEnded} />);
      await waitFor(() => expect(mockMicrophoneRequest).toHaveBeenCalled());
      await act(async () => {
        backgroundApp();
      });
      await act(async () => {
        changeAppState('active');
        grant(true);
      });

      await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));
      expect(onEnded).not.toHaveBeenCalled();
    });

    it('ends a call whose audio is running even while a request is pending', async () => {
      let callbacks: Record<string, (value?: unknown) => void> = {};
      mockStart.mockImplementation(async (options: { callbacks: typeof callbacks }) => {
        callbacks = options.callbacks;
        return fakeSession('s-audio');
      });
      const onEnded = jest.fn();
      const { getByTestId } = render(<Harness onEnded={onEnded} />);
      await waitFor(() => expect(mockStart).toHaveBeenCalled());
      await act(async () => {
        callbacks['onStarted']?.();
      });
      expect(getByTestId('status').props.children).toBe('live');
      askForMicrophone();

      await act(async () => {
        backgroundApp();
      });

      expect(onEnded).toHaveBeenCalledWith('ended');
      expect(mockClose).toHaveBeenCalledTimes(1);
      expect(getByTestId('status').props.children).toBe('idle');
    });
  });

  it('ignores session callbacks delivered after backgrounding', async () => {
    let capturedCallbacks: Record<string, (value?: unknown) => void> = {};
    mockStart.mockImplementation(async (options: { callbacks: Record<string, () => void> }) => {
      capturedCallbacks = options.callbacks as Record<string, (value?: unknown) => void>;
      return fakeSession('s2');
    });

    const { getByTestId } = render(<Harness onEnded={jest.fn()} />);
    await waitFor(() => expect(mockStart).toHaveBeenCalled());

    await act(async () => {
      capturedCallbacks['onStarted']?.();
    });
    expect(getByTestId('status').props.children).toBe('live');

    await act(async () => {
      backgroundApp();
    });
    expect(getByTestId('status').props.children).toBe('idle');
    expect(mockClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      capturedCallbacks['onStarted']?.();
      capturedCallbacks['onBackendBusy']?.(true);
      capturedCallbacks['onInterrupted']?.();
    });
    expect(getByTestId('status').props.children).toBe('idle');
  });

  it('hands a mute chosen before the session exists to the session being built', async () => {
    let startOptions!: { isMuted: () => boolean };
    let resolveStart: (session: unknown) => void = () => undefined;
    mockStart.mockImplementation((options: typeof startOptions) => {
      startOptions = options;
      return new Promise((resolve) => {
        resolveStart = resolve;
      });
    });
    let toggle: () => void = () => undefined;
    function MuteHarness() {
      const controller = useLiveVoiceSession({
        active: true,
        executionMode: 'cloud',
        conversationId: 'conv-1',
        model: 'test-model',
        ensureConversation: async () => 'conv-1',
        onEnded: jest.fn(),
      });
      toggle = controller.toggleMute;
      return <Text testID="muted">{String(controller.muted)}</Text>;
    }
    const view = render(<MuteHarness />);
    await waitFor(() => expect(mockStart).toHaveBeenCalled());
    expect(startOptions.isMuted()).toBe(false);

    await act(async () => {
      toggle();
    });
    expect(view.getByTestId('muted').props.children).toBe('true');
    expect(startOptions.isMuted()).toBe(true);

    await act(async () => {
      toggle();
    });
    expect(startOptions.isMuted()).toBe(false);

    await act(async () => {
      toggle();
      resolveStart(fakeSession('s-mute'));
    });
    expect(startOptions.isMuted()).toBe(true);
  });
});

describe('ending live voice from outside the call', () => {
  beforeEach(() => {
    mockIdentity.current = true;
    mockStart.mockReset();
    mockSettle.mockReset();
    mockClose.mockReset();
    mockClose.mockResolvedValue({ reason: 'close_requested', seconds: 0 });
    mockMicrophoneRequest.mockReset();
    mockMicrophoneRequest.mockResolvedValue(true);
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('closes a live call and leaves it idle', async () => {
    let callbacks: Record<string, (value?: unknown) => void> = {};
    mockStart.mockImplementation(async (options: { callbacks: typeof callbacks }) => {
      callbacks = options.callbacks;
      return fakeSession('s-withdrawn');
    });
    const onEnded = jest.fn();
    const { getByTestId } = render(<Harness onEnded={onEnded} />);
    await waitFor(() => expect(mockStart).toHaveBeenCalled());
    await act(async () => {
      callbacks['onStarted']?.();
    });
    expect(getByTestId('status').props.children).toBe('live');

    await act(async () => {
      endLiveVoiceSessions();
    });

    expect(getByTestId('status').props.children).toBe('idle');
    expect(onEnded).toHaveBeenCalledWith('ended');
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('does nothing once the call screen is gone', async () => {
    mockStart.mockImplementation(async () => fakeSession('s-gone'));
    const onEnded = jest.fn();
    const view = render(<Harness onEnded={onEnded} />);
    await waitFor(() => expect(mockStart).toHaveBeenCalled());
    view.unmount();
    onEnded.mockClear();

    endLiveVoiceSessions();

    expect(onEnded).not.toHaveBeenCalled();
  });
});

import React from 'react';
import { AppState, Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import { useLiveVoiceSession } from '@/src/features/voice/hooks/useLiveVoiceSession';

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

jest.mock('@/src/features/voice/services/voiceInput', () => ({
  requestMicPermission: async () => true,
  requestMicrophoneOnlyPermission: async () => true,
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

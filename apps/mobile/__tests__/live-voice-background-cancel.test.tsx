import React from 'react';
import { AppState, Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import { useLiveVoiceSession } from '@/src/features/voice/hooks/useLiveVoiceSession';

const mockStart = jest.fn();
const mockClose = jest.fn();
const mockSettle = jest.fn();

jest.mock('@/src/features/voice/services/liveVoiceModule', () => ({
  loadLiveVoiceModule: async () => ({
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
}));

jest.mock('@/stores/chatStore', () => ({
  useChatStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ appendVoiceTurn: jest.fn() }),
}));

function Harness({ onEnded }: { onEnded: (message: string | null) => void }) {
  const controller = useLiveVoiceSession({
    active: true,
    conversationId: 'conv-1',
    model: 'test-model',
    ensureConversation: async () => 'conv-1',
    onEnded,
  });
  return <Text testID="status">{controller.status}</Text>;
}

function backgroundApp() {
  const calls = (AppState.addEventListener as unknown as jest.Mock).mock.calls;
  for (const [event, handler] of calls) {
    if (event === 'change') (handler as (state: string) => void)('background');
  }
}

function fakeSession(sessionId: string) {
  return {
    sessionId,
    settlement: { idempotencyKey: 'k' },
    close: mockClose,
    setMuted: jest.fn(),
  };
}

describe('live voice session backgrounded mid-connect', () => {
  beforeEach(() => {
    mockStart.mockReset();
    mockSettle.mockReset();
    mockClose.mockReset();
    mockClose.mockResolvedValue({ reason: 'close_requested', seconds: 0 });
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
});

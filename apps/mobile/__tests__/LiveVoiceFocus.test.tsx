/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Text, View } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useFocusBoundVisibility } from '@/src/features/voice/hooks/useInlineVoiceBar';
import { useLiveVoiceSession } from '@/src/features/voice/hooks/useLiveVoiceSession';

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

const mockSessionIdentity = { id: 'login-1' };
jest.mock('@clerk/expo', () => ({ useSession: () => ({ session: mockSessionIdentity }) }));
jest.mock('@/services/remoteChatGate', () => ({ getRemoteChatDisabledReason: () => null }));
jest.mock('@/stores/chat/conversationRepository', () => ({
  getConversationMessageStore: () => ({
    getState: () => ({ conversations: [{ id: 'conv-1', executionMode: 'cloud' }] }),
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
    const isCurrent = () => !controller.signal.aborted && isOwner();
    return {
      signal: controller.signal,
      isCurrent,
      isIdentityCurrent: () => true,
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
const mockAppendVoiceTurn = jest.fn();
jest.mock('@/stores/chatStore', () => ({
  useChatStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ appendVoiceTurn: mockAppendVoiceTurn }),
}));

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

function Harness({ conversationId }: { conversationId: string }) {
  const [visible, setVisible] = useFocusBoundVisibility(conversationId);
  const controller = useLiveVoiceSession({
    active: visible,
    executionMode: 'cloud',
    conversationId,
    model: 'test-model',
    ensureConversation: async () => conversationId,
    onEnded: () => setVisible(false),
  });
  return (
    <View>
      <Text testID="open" onPress={() => setVisible(true)}>
        Open
      </Text>
      <Text testID="status">{controller.status}</Text>
    </View>
  );
}

describe('live voice only runs while its screen is focused', () => {
  const statusOf = (view: ReturnType<typeof render>) => view.getByTestId('status').props.children;

  beforeEach(() => {
    mockStart.mockReset();
    mockClose.mockReset();
    mockSettle.mockReset();
    mockClose.mockResolvedValue({ reason: 'close_requested', seconds: 0 });
    mockStart.mockImplementation(async () => fakeSession('session-1'));
    mockFocus.focused = true;
    mockFocus.listeners.clear();
  });

  it('starts a session when opened on the focused screen', async () => {
    const view = render(<Harness conversationId="conv-1" />);
    fireEvent.press(view.getByTestId('open'));

    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));
  });

  it('closes the session when the screen loses focus', async () => {
    const view = render(<Harness conversationId="conv-1" />);
    fireEvent.press(view.getByTestId('open'));
    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));
    await act(async () => {});

    act(() => mockFocus.set(false));

    await waitFor(() => expect(mockClose).toHaveBeenCalledTimes(1));
    expect(statusOf(view)).toBe('idle');
  });

  it('does not start another session when the screen regains focus', async () => {
    const view = render(<Harness conversationId="conv-1" />);
    fireEvent.press(view.getByTestId('open'));
    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));
    act(() => mockFocus.set(false));
    await waitFor(() => expect(mockClose).toHaveBeenCalledTimes(1));

    act(() => mockFocus.set(true));
    await act(async () => {});

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(statusOf(view)).toBe('idle');
  });

  it('refuses to start a session on a screen that is not focused', async () => {
    const view = render(<Harness conversationId="conv-1" />);
    act(() => mockFocus.set(false));

    fireEvent.press(view.getByTestId('open'));
    await act(async () => {});

    expect(mockStart).not.toHaveBeenCalled();
  });
});

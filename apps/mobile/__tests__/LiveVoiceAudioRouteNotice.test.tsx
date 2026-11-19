import React from 'react';
import { AppState, Text } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import { useLiveVoiceSession } from '@/src/features/voice/hooks/useLiveVoiceSession';
import { audioRouteNotAppliedMessage } from '@/src/features/voice/services/audioRoute';

const mockSessionIdentity = { id: 'login-1' };
const mockApplyAudioRoute = jest.fn();
const mockRouteSwitchingSupported = jest.fn();
const mockStart = jest.fn();
const mockAppendVoiceTurn = jest.fn();
const mockOnEnded = jest.fn();

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
jest.mock('@/src/features/voice/services/liveVoiceModule', () => ({
  loadLiveVoiceModule: async () => ({
    LIVE_VOICE_SESSION_PATH: '/api/voice/live/sessions',
    extendLiveVoiceSession: jest.fn(),
    LiveVoiceSession: { start: (...args: unknown[]) => mockStart(...args) },
    LiveVoiceSessionError: class LiveVoiceSessionError extends Error {},
    settleLiveVoiceSession: jest.fn(),
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
jest.mock('@/src/features/voice/services/audioRoute', () => ({
  ...jest.requireActual('@/src/features/voice/services/audioRoute'),
  applyAudioRoute: (...args: unknown[]) => mockApplyAudioRoute(...args),
  audioRouteSwitchingSupported: () => mockRouteSwitchingSupported(),
}));
jest.mock('@/stores/chatStore', () => ({
  useChatStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ appendVoiceTurn: mockAppendVoiceTurn }),
}));

function Harness() {
  const controller = useLiveVoiceSession({
    active: true,
    executionMode: 'cloud',
    conversationId: 'conv-1',
    model: 'test-model',
    ensureConversation: async () => 'conv-1',
    onEnded: mockOnEnded,
  });
  return <Text testID="notice">{controller.routeNotice ?? 'none'}</Text>;
}

describe('live voice audio route application', () => {
  beforeEach(() => {
    mockApplyAudioRoute.mockReset();
    mockRouteSwitchingSupported.mockReset().mockReturnValue(true);
    mockStart.mockReset().mockResolvedValue({
      sessionId: 'session-1',
      settlement: { ceilingSeconds: 600 },
      close: jest.fn().mockResolvedValue({ reason: 'close_requested', seconds: 0 }),
      settle: jest.fn(),
      extend: jest.fn(),
      dispose: jest.fn(),
      setMuted: jest.fn(),
    });
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('tells the caller when the saved route could not be applied and still starts the call', async () => {
    mockApplyAudioRoute.mockReturnValue(false);
    const screen = render(<Harness />);

    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('notice').props.children).toBe(audioRouteNotAppliedMessage('auto')),
    );
  });

  it('shows no notice when the route was applied', async () => {
    mockApplyAudioRoute.mockReturnValue(true);
    const screen = render(<Harness />);

    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('notice').props.children).toBe('none');
  });

  it('shows no notice on a platform that cannot switch routes', async () => {
    mockApplyAudioRoute.mockReturnValue(false);
    mockRouteSwitchingSupported.mockReturnValue(false);
    const screen = render(<Harness />);

    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('notice').props.children).toBe('none');
  });
});

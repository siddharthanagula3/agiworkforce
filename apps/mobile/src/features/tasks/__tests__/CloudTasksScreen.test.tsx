import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockListRuns = jest.fn();
const mockFollowRun = jest.fn();
const mockResumeRun = jest.fn();
const mockCancelRun = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: jest.fn(() => true),
  }),
}));

// The screen's auth-store import pulls @clerk/clerk-js in, which opens a
// MESSAGEPORT that keeps the jest worker alive after the suite passes.
jest.mock('@clerk/expo', () => ({
  getClerkInstance: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return {
    ArrowLeft: icon,
    BellOff: icon,
    Bot: icon,
    ChevronRight: icon,
    Clock3: icon,
    Cloud: icon,
    RefreshCw: icon,
    X: icon,
  };
});

jest.mock('@/services/streaming', () => ({
  createMobileCloudAgentRunClient: () => ({
    listRuns: mockListRuns,
    followRun: mockFollowRun,
    resumeRun: mockResumeRun,
    cancelRun: mockCancelRun,
  }),
}));

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback: () => void) => callback()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

import { fireEvent } from '@testing-library/react-native';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useChatStore } from '@/stores/chatStore';
import { CloudTasksScreen } from '../CloudTasksScreen';
import { useCloudTaskStore } from '../store';

const RUN = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'user-1',
  requestId: 'request-1',
  conversationId: null,
  originSurface: 'cli',
  workMode: 'research',
  state: 'awaiting_input',
  provider: 'managed',
  model: 'model-1',
  lastEventSequence: 4,
  cancellationRequestedAt: null,
  completedAt: null,
  createdAt: '2026-08-27T10:00:00.000Z',
  updatedAt: '2026-08-27T11:00:00.000Z',
  pendingApproval: {
    requestedAt: '2026-08-27T11:00:00.000Z',
    toolCalls: [{ toolCallId: 'call_1', name: 'shell', argsPreview: 'rm -rf build' }],
  },
};

describe('Cloud tasks screen', () => {
  const removeAppStateListener = jest.fn();

  beforeAll(() => {
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type: string, _listener: (state: AppStateStatus) => void) => ({
        remove: removeAppStateListener,
      }));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useCloudTaskStore.getState().reset();
    useCloudTaskStore.setState({ filter: 'all' });
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'user-1' });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useChatStore.setState({ conversations: [] } as never);
    mockListRuns.mockResolvedValue({ runs: [RUN], nextCursor: null });
    mockFollowRun.mockImplementation(
      async (_runId: string, options: { onSnapshot?: (page: unknown) => void }) => {
        await options.onSnapshot?.({ run: RUN, events: [], nextAfterSequence: -1 });
        return { run: RUN, lastSequence: -1 };
      },
    );
  });

  it('gates Local Mode behind an explicit switch instead of reading Cloud runs', async () => {
    useChatAppModeStore.setState({ appMode: 'local' });

    const { getByText } = render(<CloudTasksScreen />);

    expect(getByText('Tasks run in AGI Cloud')).toBeTruthy();
    expect(mockListRuns).not.toHaveBeenCalled();
  });

  it('lists a run started on another surface and says where it came from', async () => {
    const { getByText } = render(<CloudTasksScreen />);

    await waitFor(() => expect(getByText('Research task')).toBeTruthy());
    expect(getByText('CLI')).toBeTruthy();
    expect(getByText('Waiting for your approval')).toBeTruthy();
  });

  it('opens a run, follows it, and resolves the approval blocking it', async () => {
    const { getByLabelText, getByText } = render(<CloudTasksScreen />);

    await waitFor(() => expect(getByText('Research task')).toBeTruthy());
    fireEvent.press(getByLabelText('Open Research task. Waiting on you. Started on CLI'));

    await waitFor(() => expect(mockFollowRun).toHaveBeenCalledWith(RUN.id, expect.anything()));
    await waitFor(() => expect(getByText('rm -rf build')).toBeTruthy());

    mockResumeRun.mockResolvedValueOnce(undefined);
    fireEvent.press(getByLabelText('Approve this task'));

    await waitFor(() =>
      expect(mockResumeRun).toHaveBeenCalledWith(
        RUN.id,
        [{ toolCallId: 'call_1', decision: 'approved' }],
        expect.anything(),
      ),
    );
  });
});

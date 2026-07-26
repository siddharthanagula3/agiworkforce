import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockListRuns = jest.fn();

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: jest.fn(() => true),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return {
    ArrowLeft: icon,
    Bot: icon,
    CheckCircle2: icon,
    ChevronRight: icon,
    Clock3: icon,
    Cloud: icon,
    PauseCircle: icon,
    RefreshCw: icon,
  };
});

jest.mock('../services/streaming', () => ({
  createMobileCloudAgentRunClient: () => ({ listRuns: mockListRuns }),
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback) => callback()),
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

import TasksScreen, { TASK_POLL_INTERVAL_MS } from '../app/(app)/agents';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../src/features/auth/store';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const RUN = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'user-1',
  requestId: 'request-1',
  conversationId: 'conversation-1',
  originSurface: 'mobile',
  workMode: 'agiwork',
  state: 'awaiting_input',
  provider: 'openai',
  model: 'model-1',
  lastEventSequence: 4,
  cancellationRequestedAt: null,
  completedAt: null,
  createdAt: '2026-07-17T19:00:00.000Z',
  updatedAt: '2026-07-17T20:00:00.000Z',
};

describe('Mobile Cloud tasks screen', () => {
  let appStateListener: ((state: AppStateStatus) => void) | undefined;
  const removeAppStateListener = jest.fn();

  beforeAll(() => {
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: 'active',
    });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener;
      return { remove: removeAppStateListener };
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useAuthStore.setState({
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'user-1',
    });
    appStateListener = undefined;
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useChatStore.setState({
      conversations: [
        {
          id: 'conversation-1',
          title: 'Audit the launch checklist',
          createdAt: RUN.createdAt,
          updatedAt: RUN.updatedAt,
          messageCount: 2,
          executionMode: 'cloud',
        },
      ],
    } as never);
    mockListRuns.mockResolvedValue({ runs: [RUN], nextCursor: null });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('loads real active Cloud runs and opens the owning conversation', async () => {
    const { getByText, getByLabelText } = render(<TasksScreen />);

    await waitFor(() => expect(getByText('Audit the launch checklist')).toBeTruthy());
    expect(getByText('Awaiting input')).toBeTruthy();
    expect(mockListRuns).toHaveBeenCalledWith(
      expect.objectContaining({
        states: ['queued', 'running', 'paused', 'awaiting_input', 'ready_for_review'],
      }),
    );

    fireEvent.press(getByLabelText('Open task: Audit the launch checklist'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/chat/[id]',
      params: { id: 'conversation-1' },
    });
  });

  it('does not render an account-A task response after switching to account B', async () => {
    const accountAResponse = deferred<{ runs: Array<typeof RUN>; nextCursor: null }>();
    mockListRuns
      .mockReturnValueOnce(accountAResponse.promise)
      .mockResolvedValueOnce({ runs: [], nextCursor: null });
    const screen = render(<TasksScreen />);
    await waitFor(() => expect(mockListRuns).toHaveBeenCalledTimes(1));

    act(() => {
      activateCloudAccount('user-2');
      useAuthStore.setState({ clerkUserId: 'user-2' });
    });
    accountAResponse.resolve({ runs: [RUN], nextCursor: null });

    await waitFor(() => expect(mockListRuns).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Audit the launch checklist')).toBeNull();
  });

  it('uses semantic filters backed by the server state query', async () => {
    const { getByLabelText } = render(<TasksScreen />);
    await waitFor(() => expect(mockListRuns).toHaveBeenCalledTimes(1));

    fireEvent.press(getByLabelText('Filter tasks: Needs input'));

    await waitFor(() =>
      expect(mockListRuns).toHaveBeenLastCalledWith(
        expect.objectContaining({ states: ['awaiting_input'] }),
      ),
    );
  });

  it('does not contact Cloud while Local mode is active', () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    const { getByText } = render(<TasksScreen />);

    expect(getByText('Tasks run in AGI Cloud')).toBeTruthy();
    expect(mockListRuns).not.toHaveBeenCalled();
  });

  it('renders an actionable retry state when the run list fails', async () => {
    mockListRuns.mockRejectedValueOnce(new Error('offline'));
    const { getByText, getByLabelText } = render(<TasksScreen />);

    await waitFor(() => expect(getByText('Tasks could not be loaded')).toBeTruthy());
    fireEvent.press(getByLabelText('Retry loading tasks'));

    await waitFor(() => expect(mockListRuns).toHaveBeenCalledTimes(2));
  });

  it('does not contact Cloud when a signed-out session has stale Cloud mode state', () => {
    useWaitlistStore.setState({ cloudUnlocked: false });

    const { getByText } = render(<TasksScreen />);

    expect(getByText('Tasks run in AGI Cloud')).toBeTruthy();
    expect(mockListRuns).not.toHaveBeenCalled();
  });

  it('loads the next cursor page without duplicating runs', async () => {
    const nextRun = {
      ...RUN,
      id: '22222222-2222-4222-8222-222222222222',
      requestId: 'request-2',
      conversationId: null,
      workMode: 'research',
      state: 'running',
    };
    mockListRuns
      .mockResolvedValueOnce({ runs: [RUN], nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({ runs: [RUN, nextRun], nextCursor: null });

    const { getByLabelText, getAllByText } = render(<TasksScreen />);
    await waitFor(() => expect(getByLabelText('Load more tasks')).toBeTruthy());

    fireEvent.press(getByLabelText('Load more tasks'));

    await waitFor(() => expect(mockListRuns).toHaveBeenCalledTimes(2));
    expect(mockListRuns).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'cursor-2', limit: 25 }),
    );
    expect(getAllByText('Awaiting input')).toHaveLength(1);
  });

  it('polls only while mounted in foreground Cloud mode and removes runs that leave Active', async () => {
    jest.useFakeTimers();
    mockListRuns
      .mockResolvedValueOnce({ runs: [RUN], nextCursor: null })
      .mockResolvedValueOnce({ runs: [], nextCursor: null });

    const screen = render(<TasksScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockListRuns).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(TASK_POLL_INTERVAL_MS);
      await Promise.resolve();
    });

    expect(mockListRuns).toHaveBeenCalledTimes(2);
    expect(screen.getByText('No active Cloud tasks')).toBeTruthy();
    const pollingSignal = mockListRuns.mock.calls[1]?.[0]?.signal as AbortSignal;

    act(() => appStateListener?.('background'));
    expect(pollingSignal.aborted).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(TASK_POLL_INTERVAL_MS * 2);
      await Promise.resolve();
    });
    expect(mockListRuns).toHaveBeenCalledTimes(2);

    screen.unmount();
  });
});

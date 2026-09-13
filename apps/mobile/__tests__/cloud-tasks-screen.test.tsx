import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockListRuns = jest.fn();
const mockFollowRun = jest.fn();

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
  return new Proxy({}, { get: () => icon });
});

jest.mock('../services/streaming', () => ({
  createMobileCloudAgentRunClient: () => ({
    listRuns: mockListRuns,
    followRun: mockFollowRun,
  }),
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

import {
  CloudTasksScreen,
  ALL_CLOUD_RUN_STATES,
  DEFAULT_CLOUD_RUN_FILTER,
  CLOUD_TASK_LIST_POLL_INTERVAL_MS,
  useCloudTaskStore,
} from '../src/features/tasks';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useChatStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';
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

const CARD_LABEL = 'Open Audit the launch checklist. Waiting on you. Started on Mobile';

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
    useCloudTaskStore.getState().reset();
    useCloudTaskStore.setState({ filter: DEFAULT_CLOUD_RUN_FILTER });
    useAuthStore.setState({
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'user-1',
    });
    appStateListener = undefined;
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useSettingsStore.setState({ backgroundFetchEnabled: true });
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
    mockFollowRun.mockImplementation(
      async (_runId: string, options: { onSnapshot: (page: unknown) => void }) => {
        options.onSnapshot({ run: RUN, events: [] });
      },
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('loads real active Cloud runs from the server state query', async () => {
    const { getByText } = render(<CloudTasksScreen />);

    await waitFor(() => expect(getByText('Audit the launch checklist')).toBeTruthy());
    expect(mockListRuns).toHaveBeenCalledWith(
      expect.objectContaining({ states: [...ALL_CLOUD_RUN_STATES] }),
    );
  });

  it('opens the conversation a run belongs to from its detail sheet', async () => {
    const { getByLabelText } = render(<CloudTasksScreen />);
    await waitFor(() => expect(getByLabelText(CARD_LABEL)).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByLabelText(CARD_LABEL));
    });

    const openConversation = await waitFor(() =>
      getByLabelText('Open the conversation this task belongs to'),
    );
    fireEvent.press(openConversation);

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/chat/[id]',
      params: { id: 'conversation-1' },
    });
    expect(useCloudTaskStore.getState().detail).toBeNull();
  });

  it('offers no conversation action for a run that has none', async () => {
    const detachedRun = { ...RUN, conversationId: null };
    mockListRuns.mockResolvedValue({ runs: [detachedRun], nextCursor: null });
    mockFollowRun.mockImplementation(
      async (_runId: string, options: { onSnapshot: (page: unknown) => void }) => {
        options.onSnapshot({ run: detachedRun, events: [] });
      },
    );

    const { getByLabelText, queryByLabelText } = render(<CloudTasksScreen />);
    const label = 'Open AGI work task. Waiting on you. Started on Mobile';
    await waitFor(() => expect(getByLabelText(label)).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByLabelText(label));
    });

    await waitFor(() => expect(useCloudTaskStore.getState().detail?.run).toBeTruthy());
    expect(queryByLabelText('Open the conversation this task belongs to')).toBeNull();
  });

  it('does not render an account-A task response after switching to account B', async () => {
    const accountAResponse = deferred<{ runs: Array<typeof RUN>; nextCursor: null }>();
    mockListRuns
      .mockReturnValueOnce(accountAResponse.promise)
      .mockResolvedValueOnce({ runs: [], nextCursor: null });
    const screen = render(<CloudTasksScreen />);
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
    const { getByLabelText } = render(<CloudTasksScreen />);
    await waitFor(() => expect(mockListRuns).toHaveBeenCalledTimes(1));

    fireEvent.press(getByLabelText('Filter Cloud tasks: Needs you'));

    await waitFor(() =>
      expect(mockListRuns).toHaveBeenLastCalledWith(
        expect.objectContaining({ states: ['awaiting_input', 'paused'] }),
      ),
    );
  });

  it('does not contact Cloud while Local mode is active', () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    const { getByText } = render(<CloudTasksScreen />);

    expect(getByText('Tasks run in AGI Cloud')).toBeTruthy();
    expect(mockListRuns).not.toHaveBeenCalled();
  });

  it('does not contact Cloud when a signed-out session has stale Cloud mode state', () => {
    useWaitlistStore.setState({ cloudUnlocked: false });

    const { getByText } = render(<CloudTasksScreen />);

    expect(getByText('Tasks run in AGI Cloud')).toBeTruthy();
    expect(mockListRuns).not.toHaveBeenCalled();
  });

  it('renders an actionable retry state when the run list fails', async () => {
    mockListRuns.mockRejectedValueOnce(new Error('offline'));
    const { getByText } = render(<CloudTasksScreen />);

    await waitFor(() => expect(getByText('Tasks could not be loaded')).toBeTruthy());
    fireEvent.press(getByText('Try again'));

    await waitFor(() => expect(mockListRuns).toHaveBeenCalledTimes(2));
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

    const { getByLabelText, getAllByText } = render(<CloudTasksScreen />);
    await waitFor(() => expect(getByLabelText('Load more Cloud tasks')).toBeTruthy());

    fireEvent.press(getByLabelText('Load more Cloud tasks'));

    await waitFor(() => expect(mockListRuns).toHaveBeenCalledTimes(2));
    expect(mockListRuns).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'cursor-2', limit: 25 }),
    );
    expect(getAllByText('Waiting on you')).toHaveLength(1);
  });

  it('polls only while mounted in foreground Cloud mode', async () => {
    jest.useFakeTimers();
    mockListRuns
      .mockResolvedValueOnce({ runs: [RUN], nextCursor: null })
      .mockResolvedValue({ runs: [], nextCursor: null });

    const screen = render(<CloudTasksScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockListRuns).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(CLOUD_TASK_LIST_POLL_INTERVAL_MS);
      await Promise.resolve();
    });

    expect(mockListRuns).toHaveBeenCalledTimes(2);
    expect(screen.getByText('No Cloud tasks yet')).toBeTruthy();

    act(() => appStateListener?.('background'));
    await act(async () => {
      jest.advanceTimersByTime(CLOUD_TASK_LIST_POLL_INTERVAL_MS * 2);
      await Promise.resolve();
    });
    expect(mockListRuns).toHaveBeenCalledTimes(2);

    screen.unmount();
  });
});

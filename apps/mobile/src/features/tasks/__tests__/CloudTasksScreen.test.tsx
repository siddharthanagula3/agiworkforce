import React from 'react';
import {
  AccessibilityInfo,
  Alert,
  AppState,
  BackHandler,
  Platform,
  ScrollView,
  type AppStateStatus,
} from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockListRuns = jest.fn();
const mockFollowRun = jest.fn();
const mockResumeRun = jest.fn();
const mockCancelRun = jest.fn();
const mockStartCloudWorkRun = jest.fn();
const mockGetConversation = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
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
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return {
    ArrowLeft: icon,
    BellOff: icon,
    Bot: icon,
    ChevronRight: icon,
    Clock3: icon,
    Check: icon,
    Cloud: icon,
    Flag: icon,
    Plus: icon,
    RefreshCw: icon,
    Search: icon,
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

jest.mock('@/services/managedCloudChat', () => ({
  managedCloudChat: { getConversation: (...args: unknown[]) => mockGetConversation(...args) },
}));

jest.mock('../startWork', () => ({
  ...jest.requireActual('../startWork'),
  startCloudWorkRun: (...args: unknown[]) => mockStartCloudWorkRun(...args),
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
import { CLOUD_TASK_SEARCH_DEBOUNCE_MS, CloudTasksScreen } from '../CloudTasksScreen';
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

  it('keeps the filter chip row at its own height so the run list cannot squeeze or stretch it', async () => {
    const { UNSAFE_getAllByType, getByText } = render(<CloudTasksScreen />);

    await waitFor(() => expect(getByText('Research task')).toBeTruthy());
    const row = UNSAFE_getAllByType(ScrollView).find((node) => node.props.horizontal);
    expect(row?.props.style).toMatchObject({ flexGrow: 0, flexShrink: 0 });
  });

  it('lists a run started on another surface and says where it came from', async () => {
    const { getByText } = render(<CloudTasksScreen />);

    await waitFor(() => expect(getByText('Research task')).toBeTruthy());
    expect(getByText('CLI')).toBeTruthy();
    expect(getByText('Waiting for your approval')).toBeTruthy();
  });

  it('states the scope with no Open Remote control while version 1 ships with Remote hidden', async () => {
    const { getByText, queryByLabelText, queryByText } = render(<CloudTasksScreen />);

    await waitFor(() => expect(getByText('Research task')).toBeTruthy());
    expect(getByText('Every agent run on your AGI Cloud account.')).toBeTruthy();
    expect(queryByText(/paired desktops/)).toBeNull();
    expect(queryByLabelText('Open Remote')).toBeNull();
  });

  it('previews the task prompt under the title, and drops it when it repeats the title', async () => {
    mockListRuns.mockResolvedValue({
      runs: [{ ...RUN, conversationPreview: 'Compare the Q4 filings for both vendors' }],
      nextCursor: null,
    });
    const withPreview = render(<CloudTasksScreen />);

    await waitFor(() =>
      expect(withPreview.getByText('Compare the Q4 filings for both vendors')).toBeTruthy(),
    );
    withPreview.unmount();

    mockListRuns.mockResolvedValue({
      runs: [{ ...RUN, conversationPreview: 'Research task' }],
      nextCursor: null,
    });
    const echoed = render(<CloudTasksScreen />);

    await waitFor(() => expect(echoed.getAllByText('Research task')).toHaveLength(1));
  });

  it('opens a run, follows it, and resolves the approval blocking it', async () => {
    const { getByLabelText, getByText } = render(<CloudTasksScreen />);

    await waitFor(() => expect(getByText('Research task')).toBeTruthy());
    fireEvent.press(getByLabelText('Open Research task. Waiting for input. Started on CLI'));

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

  it('asks what stopping a task costs before it stops, and stops only when confirmed', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockCancelRun.mockResolvedValue({ ...RUN, state: 'cancelled', pendingApproval: null });
    const { getByLabelText, getByText } = render(<CloudTasksScreen />);

    await waitFor(() => expect(getByText('Research task')).toBeTruthy());
    fireEvent.press(getByLabelText('Open Research task. Waiting for input. Started on CLI'));
    await waitFor(() => expect(getByLabelText('Stop this task')).toBeTruthy());

    fireEvent.press(getByLabelText('Stop this task'));

    expect(alert).toHaveBeenCalledWith(
      'Stop this task?',
      expect.stringContaining('cannot be resumed'),
      expect.any(Array),
    );
    expect(mockCancelRun).not.toHaveBeenCalled();

    const buttons = alert.mock.calls[0]?.[2] as { text: string; onPress?: () => void }[];
    buttons.find((button) => button.text === 'Stop task')?.onPress?.();

    await waitFor(() => expect(mockCancelRun).toHaveBeenCalledWith(RUN.id, expect.anything()));
    alert.mockRestore();
  });

  it('offers a finished task as a routine and reopens its full original request for review', async () => {
    const FULL_GOAL = `Summarise overnight support tickets. ${'Group them by customer and flag churn risk. '.repeat(8)}`;
    const FINISHED = {
      ...RUN,
      state: 'completed',
      pendingApproval: null,
      conversationId: '22222222-2222-4222-8222-222222222222',
      conversationPreview: FULL_GOAL.slice(0, 200),
    };
    mockListRuns.mockResolvedValue({ runs: [FINISHED], nextCursor: null });
    mockFollowRun.mockImplementation(
      async (_runId: string, options: { onSnapshot?: (page: unknown) => void }) => {
        await options.onSnapshot?.({ run: FINISHED, events: [], nextAfterSequence: -1 });
        return { run: FINISHED, lastSequence: -1 };
      },
    );
    mockGetConversation.mockResolvedValue({
      messages: [
        {
          role: 'user',
          content: 'An unrelated earlier question',
          createdAt: '2026-08-20T09:00:00.000Z',
        },
        { role: 'user', content: FULL_GOAL, createdAt: '2026-08-27T10:00:01.000Z' },
        { role: 'assistant', content: 'Done', createdAt: '2026-08-27T10:30:00.000Z' },
      ],
      hasMore: false,
    });
    mockStartCloudWorkRun.mockResolvedValue({ conversationId: 'conv-new', goal: {} });
    const { findByText, getByText, findByLabelText } = render(<CloudTasksScreen />);

    fireEvent.press(await findByText(FULL_GOAL.slice(0, 200)));
    expect(await findByText('Make it a routine')).toBeTruthy();
    fireEvent.press(getByText('Run again'));

    const objective = await findByLabelText('Task objective');
    expect(objective.props.value).toBe(FULL_GOAL.trim());
    expect(mockStartCloudWorkRun).not.toHaveBeenCalled();

    fireEvent.press(await findByLabelText('Start task'));
    await waitFor(() =>
      expect(mockStartCloudWorkRun).toHaveBeenCalledWith(
        expect.objectContaining({ goal: FULL_GOAL.trim() }),
        expect.any(Function),
      ),
    );
  });

  describe('searching tasks', () => {
    const MATCH = {
      ...RUN,
      id: '22222222-2222-4222-8222-222222222222',
      conversationPreview: 'Invoice sweep for the third quarter',
    };
    const SEARCH_LABEL = 'Search Cloud tasks';

    function serverThatSearches(): void {
      mockListRuns.mockImplementation(async (options: { q?: string }) => ({
        runs: options.q ? (options.q === 'invoice' ? [MATCH] : []) : [RUN],
        nextCursor: null,
        searchSupported: true,
      }));
    }

    function typeSearch(screen: ReturnType<typeof render>, text: string): void {
      fireEvent.changeText(screen.getByLabelText(SEARCH_LABEL), text);
    }

    function pastDebounce(): void {
      act(() => {
        jest.advanceTimersByTime(CLOUD_TASK_SEARCH_DEBOUNCE_MS);
      });
    }

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('offers no search until the server has said it answers one', async () => {
      const { getByText, queryByLabelText } = render(<CloudTasksScreen />);

      await waitFor(() => expect(getByText('Research task')).toBeTruthy());

      expect(queryByLabelText(SEARCH_LABEL)).toBeNull();
    });

    it('offers no search over an empty list', async () => {
      mockListRuns.mockResolvedValue({ runs: [], nextCursor: null, searchSupported: true });
      const { findByText, queryByLabelText } = render(<CloudTasksScreen />);

      await findByText('No Cloud tasks yet');

      expect(queryByLabelText(SEARCH_LABEL)).toBeNull();
    });

    it('opens a focused field with Cancel, waits for a pause in typing, then lists the matches', async () => {
      serverThatSearches();
      const screen = render(<CloudTasksScreen />);
      await waitFor(() => expect(screen.getByText('Research task')).toBeTruthy());

      fireEvent.press(screen.getByLabelText(SEARCH_LABEL));
      expect(screen.getByLabelText('Cancel search')).toBeTruthy();
      expect(screen.getByLabelText(SEARCH_LABEL).props.autoFocus).toBe(true);
      mockListRuns.mockClear();

      typeSearch(screen, 'inv');
      typeSearch(screen, 'invoice');
      act(() => {
        jest.advanceTimersByTime(CLOUD_TASK_SEARCH_DEBOUNCE_MS - 1);
      });
      expect(mockListRuns).not.toHaveBeenCalled();

      pastDebounce();

      await waitFor(() =>
        expect(screen.getByText('Invoice sweep for the third quarter')).toBeTruthy(),
      );
      expect(mockListRuns).toHaveBeenCalledTimes(1);
      expect(mockListRuns).toHaveBeenCalledWith(expect.objectContaining({ q: 'invoice' }));
      expect(screen.getAllByText('Research task')).toHaveLength(1);
    });

    it('says plainly when nothing matches', async () => {
      serverThatSearches();
      const screen = render(<CloudTasksScreen />);
      await waitFor(() => expect(screen.getByText('Research task')).toBeTruthy());

      fireEvent.press(screen.getByLabelText(SEARCH_LABEL));
      typeSearch(screen, 'zzz');
      pastDebounce();

      expect(await screen.findByText('No tasks match "zzz"')).toBeTruthy();
      expect(screen.queryByText('No tasks match this filter')).toBeNull();
    });

    it('shows the loading state while the search runs', async () => {
      serverThatSearches();
      const screen = render(<CloudTasksScreen />);
      await waitFor(() => expect(screen.getByText('Research task')).toBeTruthy());
      let finish: (value: unknown) => void = () => undefined;
      mockListRuns.mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );

      fireEvent.press(screen.getByLabelText(SEARCH_LABEL));
      typeSearch(screen, 'invoice');
      pastDebounce();

      expect(await screen.findByText('Loading Cloud tasks…')).toBeTruthy();
      await act(async () => {
        finish({ runs: [MATCH], nextCursor: null, searchSupported: true });
      });
      expect(await screen.findByText('Invoice sweep for the third quarter')).toBeTruthy();
    });

    it('offers a retry that repeats the search after a network error', async () => {
      serverThatSearches();
      const screen = render(<CloudTasksScreen />);
      await waitFor(() => expect(screen.getByText('Research task')).toBeTruthy());
      mockListRuns.mockRejectedValueOnce(new Error('offline'));

      fireEvent.press(screen.getByLabelText(SEARCH_LABEL));
      typeSearch(screen, 'invoice');
      pastDebounce();
      expect(await screen.findByText('Tasks could not be loaded')).toBeTruthy();

      fireEvent.press(screen.getByText('Try again'));

      expect(await screen.findByText('Invoice sweep for the third quarter')).toBeTruthy();
      expect(mockListRuns).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'invoice' }));
    });

    it('keeps searching instead of saying nothing matches while older runs are still unread', async () => {
      mockListRuns.mockImplementation(async (options: { q?: string; cursor?: string }) => {
        if (!options.q) return { runs: [RUN], nextCursor: null, searchSupported: true };
        if (!options.cursor) return { runs: [], nextCursor: 'cursor-1', searchSupported: true };
        return { runs: [MATCH], nextCursor: null, searchSupported: true };
      });
      const screen = render(<CloudTasksScreen />);
      await waitFor(() => expect(screen.getByText('Research task')).toBeTruthy());

      fireEvent.press(screen.getByLabelText(SEARCH_LABEL));
      typeSearch(screen, 'invoice');
      pastDebounce();

      expect(await screen.findByText('Invoice sweep for the third quarter')).toBeTruthy();
      expect(screen.queryByText('No tasks match "invoice"')).toBeNull();
      expect(mockListRuns).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: 'invoice', cursor: 'cursor-1' }),
      );
    });

    it('says nothing matches only after the last page has been read', async () => {
      mockListRuns.mockImplementation(async (options: { q?: string; cursor?: string }) => {
        if (!options.q) return { runs: [RUN], nextCursor: null, searchSupported: true };
        return {
          runs: [],
          nextCursor: options.cursor ? null : 'cursor-1',
          searchSupported: true,
        };
      });
      const screen = render(<CloudTasksScreen />);
      await waitFor(() => expect(screen.getByText('Research task')).toBeTruthy());

      fireEvent.press(screen.getByLabelText(SEARCH_LABEL));
      typeSearch(screen, 'zzz');
      pastDebounce();

      expect(await screen.findByText('No tasks match "zzz"')).toBeTruthy();
      expect(screen.queryByLabelText('Load more Cloud tasks')).toBeNull();
    });

    describe('announcements and hardware Back', () => {
      const platform = Platform.OS;
      let announce: jest.SpyInstance;

      beforeEach(() => {
        announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation();
      });

      afterEach(() => {
        Platform.OS = platform;
        announce.mockRestore();
      });

      it('tells VoiceOver how many tasks the search found and when none match', async () => {
        Platform.OS = 'ios';
        serverThatSearches();
        const screen = render(<CloudTasksScreen />);
        await waitFor(() => expect(screen.getByText('Research task')).toBeTruthy());
        fireEvent.press(screen.getByLabelText(SEARCH_LABEL));

        typeSearch(screen, 'invoice');
        pastDebounce();
        await screen.findByText('Invoice sweep for the third quarter');
        expect(announce).toHaveBeenLastCalledWith('1 task found');

        typeSearch(screen, 'zzz');
        pastDebounce();
        await screen.findByText('No tasks match "zzz"');
        expect(announce).toHaveBeenLastCalledWith('No tasks match "zzz"');
      });

      it('leaves the announcement to the live region on Android', async () => {
        Platform.OS = 'android';
        serverThatSearches();
        const screen = render(<CloudTasksScreen />);
        await waitFor(() => expect(screen.getByText('Research task')).toBeTruthy());
        fireEvent.press(screen.getByLabelText(SEARCH_LABEL));

        typeSearch(screen, 'zzz');
        pastDebounce();
        await screen.findByText('No tasks match "zzz"');

        expect(announce).not.toHaveBeenCalled();
      });

      it('closes the search field on hardware Back instead of leaving the screen', async () => {
        let onBack: Parameters<typeof BackHandler.addEventListener>[1] | undefined;
        const remove = jest.fn();
        const add = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_, handler) => {
          onBack = handler;
          return { remove };
        });
        serverThatSearches();
        const screen = render(<CloudTasksScreen />);
        await waitFor(() => expect(screen.getByText('Research task')).toBeTruthy());
        expect(onBack).toBeUndefined();

        fireEvent.press(screen.getByLabelText(SEARCH_LABEL));
        expect(onBack).toBeDefined();
        let handled = false;
        act(() => {
          handled = onBack?.({ type: 'hardwareBackPress', timeStamp: 0 }) === true;
        });

        expect(handled).toBe(true);
        expect(screen.queryByLabelText('Cancel search')).toBeNull();
        expect(screen.getByLabelText(SEARCH_LABEL)).toBeTruthy();
        expect(remove).toHaveBeenCalled();
        add.mockRestore();
      });
    });

    it('restores the full list and the search button on Cancel', async () => {
      serverThatSearches();
      const screen = render(<CloudTasksScreen />);
      await waitFor(() => expect(screen.getByText('Research task')).toBeTruthy());
      fireEvent.press(screen.getByLabelText(SEARCH_LABEL));
      typeSearch(screen, 'invoice');
      pastDebounce();
      await screen.findByText('Invoice sweep for the third quarter');

      fireEvent.press(screen.getByLabelText('Cancel search'));

      expect(await screen.findByText('Research task')).toBeTruthy();
      expect(screen.queryByLabelText('Cancel search')).toBeNull();
      expect(screen.getByLabelText(SEARCH_LABEL)).toBeTruthy();
      expect(mockListRuns.mock.calls.at(-1)?.[0]).not.toHaveProperty('q');
    });
  });

  describe('before the app is active', () => {
    afterEach(() => {
      Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    });

    it('loads the list when the app became active between the first render and the subscription', async () => {
      let reads = 0;
      Object.defineProperty(AppState, 'currentState', {
        configurable: true,
        get: () => (reads++ === 0 ? 'inactive' : 'active'),
      });

      const { findByText } = render(<CloudTasksScreen />);

      expect(await findByText('Research task')).toBeTruthy();
      expect(mockListRuns).toHaveBeenCalledTimes(1);
    });

    it('shows loading instead of the empty list while the first load has not started', async () => {
      Object.defineProperty(AppState, 'currentState', {
        configurable: true,
        value: 'inactive',
      });

      const { getByText, queryByText } = render(<CloudTasksScreen />);

      expect(getByText('Loading Cloud tasks…')).toBeTruthy();
      expect(queryByText('No Cloud tasks yet')).toBeNull();
      expect(mockListRuns).not.toHaveBeenCalled();
    });
  });
});

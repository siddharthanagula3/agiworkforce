import type { ReactTestInstance } from 'react-test-renderer';
/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert, RefreshControl } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

function retainedPress(node: ReactTestInstance): () => void {
  for (let current: ReactTestInstance | null = node; current; current = current.parent) {
    const callback: unknown = current.props.onPress;
    if (typeof callback === 'function') return callback as () => void;
  }
  throw new Error('No press callback on the rendered control');
}

const mockFetch = jest.fn();
const mockRestore = jest.fn();
const mockLoadConversations = jest.fn();
let mockFocused = true;
let mockFocus: (() => void) | undefined;
let mockBlur: (() => void) | undefined;

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<ImportedModule0>('react');
    useEffect(() => {
      mockFocus = () => {
        mockFocused = true;
        const cleanup = callback();
        mockBlur = typeof cleanup === 'function' ? cleanup : undefined;
      };
      if (mockFocused) mockFocus();
      return () => {
        mockBlur?.();
        mockBlur = undefined;
      };
    }, [callback]);
  },
  useRouter: () => ({
    canGoBack: () => false,
    back: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
  }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'View' }));
jest.mock('@/components/ui/Card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = () => <View />;
  return { ArrowLeft: Icon, Archive: Icon, Trash2: Icon, AlertCircle: Icon, RotateCcw: Icon };
});
jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('@/src/ui/theme/tokens');
  return { useTheme: () => ({ colors: tokens.lightColors, statusBarStyle: 'dark' }) };
});
jest.mock('@/src/features/auth/store', () => {
  const { create } = jest.requireActual<ImportedModule1>('zustand');
  return {
    useAuthStore: create(() => ({
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'account-a',
    })),
  };
});
jest.mock('@/src/features/chat/store/appModeStore', () => {
  const { create } = jest.requireActual<ImportedModule1>('zustand');
  return { useChatAppModeStore: create(() => ({ appMode: 'cloud', setAppMode: jest.fn() })) };
});
jest.mock('@/stores/chat/chatMessageStore', () => ({
  useChatMessageStore: (selector: (state: { loadConversations: () => Promise<void> }) => unknown) =>
    selector({ loadConversations: mockLoadConversations }),
}));
jest.mock('@/src/features/settings/Common', () => ({
  CloudAccountRequired: () => null,
  CloudSyncBlockedBanner: () => null,
}));
jest.mock('@/src/features/archived-chats', () => ({
  fetchArchivedConversations: (...args: unknown[]) => mockFetch(...args),
  restoreArchivedConversation: (...args: unknown[]) => mockRestore(...args),
  deleteArchivedConversation: jest.fn(),
  deleteAllArchivedConversations: jest.fn(),
}));

import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import ArchivedChatsScreen from '../app/(app)/settings/archived-chats';
import {
  activateCloudAccount,
  captureCloudAccountEpoch,
  __resetCloudAccountSessionForTests,
} from '@/src/features/auth/services/cloudAccountSession';
import {
  deleteArchivedConversation,
  deleteAllArchivedConversations,
} from '@/src/features/archived-chats';

describe('Archived chats failure recovery', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    mockRestore.mockReset();
    mockLoadConversations.mockReset();
    jest.mocked(deleteArchivedConversation).mockReset();
    jest.mocked(deleteAllArchivedConversations).mockReset();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('account-a');
    mockFocused = true;
    mockFocus = undefined;
    mockBlur = undefined;
    useAuthStore.setState({ clerkUserId: 'account-a', isClerkSignedIn: true, isClerkLoaded: true });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockLoadConversations.mockResolvedValue(undefined);
  });

  afterEach(() => alertSpy.mockRestore());

  it('hides server diagnostics and retries a failed list', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('private query at /internal/chat'))
      .mockResolvedValueOnce({ conversations: [], hasMore: false, nextOffset: 0 });

    const screen = render(<ArchivedChatsScreen />);
    await waitFor(() =>
      expect(screen.getByText('Could not load archived chats. Retry.')).toBeTruthy(),
    );
    expect(screen.queryByText(/private query/)).toBeNull();

    fireEvent.press(screen.getByLabelText('Retry loading archived chats'));
    await waitFor(() => expect(screen.getByText('No archived chats')).toBeTruthy());
  });

  it('reports a successful restore truthfully when chat-list refresh fails', async () => {
    mockFetch
      .mockResolvedValueOnce({
        conversations: [
          { id: 'chat-1', title: 'Launch plan', updatedAt: '2026-09-27T00:00:00.000Z' },
        ],
        hasMore: false,
        nextOffset: 1,
      })
      .mockResolvedValue({ conversations: [], hasMore: false, nextOffset: 0 });
    mockRestore.mockResolvedValue(undefined);
    mockLoadConversations.mockRejectedValue(new Error('private refresh detail'));

    const screen = render(<ArchivedChatsScreen />);
    await waitFor(() => expect(screen.getByLabelText('Restore Launch plan')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Restore Launch plan'));

    await waitFor(() =>
      expect(mockRestore).toHaveBeenCalledWith(
        'chat-1',
        expect.objectContaining({ ownerId: 'account-a' }),
        expect.any(AbortSignal),
      ),
    );
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Chat restored', expect.any(String)));
    expect(alertSpy.mock.calls[0]?.[1]).toBe('Refresh your chats to see it in the list.');
    expect(screen.queryByText('Launch plan')).toBeNull();
  });

  it('does not claim the chat remains archived after an uncertain restore response', async () => {
    mockFetch.mockResolvedValue({
      conversations: [
        { id: 'chat-1', title: 'Launch plan', updatedAt: '2026-09-27T00:00:00.000Z' },
      ],
      hasMore: false,
      nextOffset: 1,
    });
    mockRestore.mockRejectedValueOnce(new Error('response lost'));
    const screen = render(<ArchivedChatsScreen />);
    fireEvent.press(await screen.findByLabelText('Restore Launch plan'));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Could not restore',
        'Could not confirm the restore. Refresh archived chats before trying again.',
      ),
    );
    expect(mockLoadConversations).not.toHaveBeenCalled();
  });

  it('hides the old account list and ignores its in-flight response after switching accounts', async () => {
    let resolveFirst!: (result: unknown) => void;
    mockFetch
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ conversations: [], hasMore: false, nextOffset: 0 });
    const screen = render(<ArchivedChatsScreen />);

    activateCloudAccount('account-b');
    useAuthStore.setState({ clerkUserId: 'account-b' });
    screen.rerender(<ArchivedChatsScreen />);
    await waitFor(() => expect(screen.getByText('No archived chats')).toBeTruthy());
    await act(async () => {
      resolveFirst({
        conversations: [
          { id: 'old-chat', title: 'Old account chat', updatedAt: '2026-09-27T00:00:00.000Z' },
        ],
        hasMore: false,
        nextOffset: 1,
      });
    });

    expect(screen.queryByText('Old account chat')).toBeNull();
  });

  it('hides an already loaded account list immediately when its owner changes', async () => {
    mockFetch
      .mockResolvedValueOnce({
        conversations: [
          { id: 'old-chat', title: 'Old account chat', updatedAt: '2026-09-27T00:00:00.000Z' },
        ],
        hasMore: false,
        nextOffset: 1,
      })
      .mockImplementationOnce(() => new Promise(() => undefined));
    const screen = render(<ArchivedChatsScreen />);
    await waitFor(() => expect(screen.getByText('Old account chat')).toBeTruthy());

    activateCloudAccount('account-b');
    useAuthStore.setState({ clerkUserId: 'account-b' });
    screen.rerender(<ArchivedChatsScreen />);

    expect(screen.queryByText('Old account chat')).toBeNull();
  });

  it('does not rebind a saved Restore row callback to a replacement account', async () => {
    mockFetch.mockResolvedValue({
      conversations: [
        { id: 'chat-1', title: 'Launch plan', updatedAt: '2026-09-27T00:00:00.000Z' },
      ],
      hasMore: false,
      nextOffset: 1,
    });
    const screen = render(<ArchivedChatsScreen />);
    const restore = retainedPress(await screen.findByLabelText('Restore Launch plan'));
    activateCloudAccount('account-b');
    useAuthStore.setState({ clerkUserId: 'account-b' });
    act(() => restore());
    expect(mockRestore).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('does not delete after a confirmation outlives its account', async () => {
    mockFetch.mockResolvedValue({
      conversations: [
        { id: 'chat-1', title: 'Launch plan', updatedAt: '2026-09-27T00:00:00.000Z' },
      ],
      hasMore: false,
      nextOffset: 1,
    });
    const screen = render(<ArchivedChatsScreen />);
    await waitFor(() => expect(screen.getByLabelText('Delete Launch plan')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Delete Launch plan'));
    const buttons = alertSpy.mock.calls.at(-1)?.[2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    activateCloudAccount('account-b');
    act(() => buttons.find((button) => button.text === 'Delete')?.onPress?.());

    expect(deleteArchivedConversation).not.toHaveBeenCalled();
  });

  describe.each(['row', 'bulk'] as const)('archived deletion %s confirmation ownership', (kind) => {
    const label = kind === 'row' ? 'Delete Launch plan' : 'Delete all archived chats';
    const confirmLabel = kind === 'row' ? 'Delete' : 'Delete all';
    const mutation = kind === 'row' ? deleteArchivedConversation : deleteAllArchivedConversations;

    async function renderRows() {
      mockFetch.mockResolvedValue({
        conversations: [
          { id: 'chat-1', title: 'Launch plan', updatedAt: '2026-09-27T00:00:00.000Z' },
        ],
        hasMore: false,
        nextOffset: 1,
      });
      const screen = render(<ArchivedChatsScreen />);
      await screen.findByLabelText(label);
      return screen;
    }

    function buttons() {
      const entries = alertSpy.mock.calls.at(-1)?.[2];
      const confirm = entries?.find((button) => button.text === confirmLabel)?.onPress;
      const cancel = entries?.find((button) => button.text === 'Cancel')?.onPress;
      if (!confirm || !cancel) throw new Error('Missing confirmation callbacks');
      return { confirm, cancel };
    }

    it.each([false, true])(
      'rejects saved rendered buttons after replacement, round trip: %s',
      async (roundTrip) => {
        const screen = await renderRows();
        const press = retainedPress(screen.getByLabelText(label));
        activateCloudAccount('account-b');
        if (roundTrip) activateCloudAccount('account-a');
        act(() => press());
        expect(alertSpy).not.toHaveBeenCalled();
        expect(mutation).not.toHaveBeenCalled();
      },
    );

    it.each([false, true])(
      'rejects saved confirmations after replacement, round trip: %s',
      async (roundTrip) => {
        const screen = await renderRows();
        fireEvent.press(screen.getByLabelText(label));
        const { confirm } = buttons();
        activateCloudAccount('account-b');
        if (roundTrip) activateCloudAccount('account-a');
        act(() => confirm());
        expect(mutation).not.toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledTimes(1);
      },
    );

    it('retires the confirmation on Cancel', async () => {
      const screen = await renderRows();
      fireEvent.press(screen.getByLabelText(label));
      const { confirm, cancel } = buttons();
      act(() => {
        cancel();
        confirm();
      });
      expect(mutation).not.toHaveBeenCalled();
    });

    it('dispatches once with the rendered owner and consumes the completed confirmation', async () => {
      let resolve!: () => void;
      const pending = new Promise<void>((yes) => {
        resolve = yes;
      });
      jest.mocked(deleteArchivedConversation).mockReturnValueOnce(pending);
      jest.mocked(deleteAllArchivedConversations).mockReturnValueOnce(pending.then(() => 1));
      const screen = await renderRows();
      const account = captureCloudAccountEpoch();
      fireEvent.press(screen.getByLabelText(label));
      const { confirm } = buttons();
      act(() => {
        confirm();
        confirm();
      });
      expect(mutation).toHaveBeenCalledTimes(1);
      if (kind === 'row')
        expect(mutation).toHaveBeenCalledWith('chat-1', account, expect.any(AbortSignal));
      else expect(mutation).toHaveBeenCalledWith(account, expect.any(AbortSignal));
      mockFetch.mockResolvedValue({ conversations: [], hasMore: false, nextOffset: 0 });
      await act(async () => {
        resolve();
      });
      expect(screen.queryByText('Launch plan')).toBeNull();
      act(() => confirm());
      expect(mutation).toHaveBeenCalledTimes(1);
    });

    it.each(['resolve', 'reject'] as const)(
      'suppresses late %s after replacement',
      async (outcome) => {
        let resolve!: () => void;
        let reject!: (error: Error) => void;
        const pending = new Promise<void>((yes, no) => {
          resolve = yes;
          reject = no;
        });
        if (kind === 'row') jest.mocked(deleteArchivedConversation).mockReturnValueOnce(pending);
        else jest.mocked(deleteAllArchivedConversations).mockReturnValueOnce(pending.then(() => 1));
        const screen = await renderRows();
        fireEvent.press(screen.getByLabelText(label));
        const { confirm } = buttons();
        act(() => confirm());
        mockFetch.mockResolvedValue({
          conversations: [
            {
              id: 'replacement-chat',
              title: 'Replacement chat',
              updatedAt: '2026-09-27T00:00:00.000Z',
            },
          ],
          hasMore: false,
          nextOffset: 1,
        });
        activateCloudAccount('account-b');
        useAuthStore.setState({ clerkUserId: 'account-b' });
        screen.rerender(<ArchivedChatsScreen />);
        await screen.findByText('Replacement chat');
        await act(async () => {
          if (outcome === 'resolve') resolve();
          else reject(new Error('late old failure'));
        });
        expect(screen.getByText('Replacement chat')).toBeTruthy();
        expect(alertSpy).toHaveBeenCalledTimes(1);
      },
    );
  });

  it('does not clear replacement-account busy UI from an old delete finally', async () => {
    let resolveDelete!: () => void;
    jest.mocked(deleteArchivedConversation).mockReturnValueOnce(
      new Promise<void>((yes) => {
        resolveDelete = yes;
      }),
    );
    mockFetch.mockResolvedValue({
      conversations: [{ id: 'old-chat', title: 'Old chat', updatedAt: '2026-09-27T00:00:00.000Z' }],
      hasMore: false,
      nextOffset: 1,
    });
    const screen = render(<ArchivedChatsScreen />);
    fireEvent.press(await screen.findByLabelText('Delete Old chat'));
    const confirm = alertSpy.mock.calls
      .at(-1)?.[2]
      ?.find((button) => button.text === 'Delete')?.onPress;
    if (!confirm) throw new Error('Missing delete confirmation');
    act(() => confirm());
    mockFetch.mockResolvedValue({
      conversations: [{ id: 'new-chat', title: 'New chat', updatedAt: '2026-09-27T00:00:00.000Z' }],
      hasMore: false,
      nextOffset: 1,
    });
    activateCloudAccount('account-b');
    useAuthStore.setState({ clerkUserId: 'account-b' });
    screen.rerender(<ArchivedChatsScreen />);
    let resolveRestore!: () => void;
    mockRestore.mockReturnValueOnce(
      new Promise<void>((yes) => {
        resolveRestore = yes;
      }),
    );
    fireEvent.press(await screen.findByLabelText('Restore New chat'));
    expect(screen.getByText('Working…')).toBeTruthy();
    await act(async () => {
      resolveDelete();
    });
    expect(screen.getByText('Working…')).toBeTruthy();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveRestore();
    });
  });
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    return { promise, resolve, reject };
  }

  const page = (title: string, nextOffset = 1, hasMore = true) => ({
    conversations: [{ id: title, title, updatedAt: '2026-09-27T00:00:00.000Z' }],
    nextOffset,
    hasMore,
  });
  type FixturePage = ReturnType<typeof page>;
  const refresh = (screen: ReturnType<typeof render>) =>
    screen.UNSAFE_getByType(RefreshControl).props.onRefresh();

  it.each(['resolve', 'reject'] as const)(
    'ignores superseded refresh %s and its finally',
    async (outcome) => {
      const old = deferred<FixturePage>();
      const current = deferred<FixturePage>();
      mockFetch
        .mockResolvedValueOnce(page('Initial'))
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(current.promise);
      const screen = render(<ArchivedChatsScreen />);
      await screen.findByText('Initial');
      act(() => refresh(screen));
      const oldSignal = mockFetch.mock.calls[1]?.[2] as AbortSignal;
      act(() => refresh(screen));
      expect(oldSignal.aborted).toBe(true);
      await act(async () => {
        if (outcome === 'resolve') old.resolve(page('Old'));
        else old.reject(new Error('private old failure'));
      });
      expect(screen.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(true);
      expect(screen.queryByText('Old')).toBeNull();
      expect(screen.queryByText('Could not load archived chats. Retry.')).toBeNull();
      await act(async () => current.resolve(page('Current')));
      expect(screen.getByText('Current')).toBeTruthy();
      expect(screen.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false);
    },
  );

  it.each(['resolve', 'reject'] as const)(
    'ignores old page %s after refresh and preserves newer paging UI',
    async (outcome) => {
      const old = deferred<FixturePage>();
      const current = deferred<FixturePage>();
      mockFetch
        .mockResolvedValueOnce(page('Initial'))
        .mockReturnValueOnce(old.promise)
        .mockResolvedValueOnce(page('Refreshed', 7))
        .mockReturnValueOnce(current.promise);
      const screen = render(<ArchivedChatsScreen />);
      await screen.findByText('Initial');
      const savedMore = retainedPress(screen.getByLabelText('Load more archived chats'));
      act(() => {
        savedMore();
        savedMore();
      });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const oldSignal = mockFetch.mock.calls[1]?.[2] as AbortSignal;
      act(() => refresh(screen));
      await screen.findByText('Refreshed');
      act(() => savedMore());
      expect(mockFetch).toHaveBeenCalledTimes(3);
      fireEvent.press(screen.getByLabelText('Load more archived chats'));
      expect(mockFetch.mock.calls[3]?.[0]).toBe(7);
      expect(oldSignal.aborted).toBe(true);
      await act(async () => {
        if (outcome === 'resolve') old.resolve(page('Old page', 99));
        else old.reject(new Error('old page failed'));
      });
      expect(screen.getByText('Loading…')).toBeTruthy();
      expect(screen.queryByText('Old page')).toBeNull();
      expect(alertSpy).not.toHaveBeenCalled();
      await act(async () => current.resolve(page('Current page', 8, false)));
      expect(screen.getByText('Current page')).toBeTruthy();
      expect(screen.queryByLabelText('Load more archived chats')).toBeNull();
    },
  );

  it.each(['resolve', 'reject'] as const)(
    'retires a page at mutation admission and reconciles after mutation %s',
    async (outcome) => {
      const oldPage = deferred<FixturePage>();
      const mutation = deferred<void>();
      const reconciled = deferred<FixturePage>();
      mockFetch
        .mockResolvedValueOnce(page('Initial', 50))
        .mockReturnValueOnce(oldPage.promise)
        .mockReturnValueOnce(reconciled.promise)
        .mockResolvedValueOnce(page('Older', 51, false));
      mockRestore.mockReturnValueOnce(mutation.promise);
      const screen = render(<ArchivedChatsScreen />);
      await screen.findByText('Initial');
      const restore = retainedPress(screen.getByLabelText('Restore Initial'));
      const more = retainedPress(screen.getByLabelText('Load more archived chats'));
      act(() => more());
      const pageSignal = mockFetch.mock.calls[1]?.[2] as AbortSignal;
      act(() => {
        restore();
        restore();
        more();
        refresh(screen);
      });
      expect(mockRestore).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(pageSignal.aborted).toBe(true);
      await act(async () => oldPage.resolve(page('Stale page', 100)));
      expect(screen.queryByText('Stale page')).toBeNull();
      expect(screen.getByText('Working…')).toBeTruthy();
      await act(async () => {
        if (outcome === 'resolve') mutation.resolve();
        else mutation.reject(new Error('receipt lost'));
      });
      expect(mockFetch.mock.calls[2]?.[0]).toBe(0);
      expect(screen.queryByText('Initial')).toBeNull();
      await act(async () => reconciled.resolve(page('Reconciled', 50)));
      fireEvent.press(screen.getByLabelText('Load more archived chats'));
      await screen.findByText('Older');
      expect(mockFetch.mock.calls[3]?.[0]).toBe(50);
      expect(mockLoadConversations).toHaveBeenCalledTimes(outcome === 'resolve' ? 1 : 0);
    },
  );

  it('keeps a saved confirmation through a refresh and invalidates that refresh when confirmed', async () => {
    const old = deferred<FixturePage>();
    const mutation = deferred<void>();
    mockFetch
      .mockResolvedValueOnce(page('Initial'))
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(page('Reconciled'));
    jest.mocked(deleteArchivedConversation).mockReturnValueOnce(mutation.promise);
    const screen = render(<ArchivedChatsScreen />);
    fireEvent.press(await screen.findByLabelText('Delete Initial'));
    const confirm = alertSpy.mock.calls
      .at(-1)?.[2]
      ?.find((button) => button.text === 'Delete')?.onPress;
    if (!confirm) throw new Error('Missing confirmation');
    act(() => refresh(screen));
    act(() => confirm());
    expect(deleteArchivedConversation).toHaveBeenCalledTimes(1);
    expect((mockFetch.mock.calls[1]?.[2] as AbortSignal).aborted).toBe(true);
    await act(async () => mutation.resolve());
    await screen.findByText('Reconciled');
    await act(async () => old.resolve(page('Initial')));
    expect(screen.queryByText('Initial')).toBeNull();
  });

  it('does not repopulate bulk-deleted rows from an older page', async () => {
    const old = deferred<FixturePage>();
    const mutation = deferred<number>();
    mockFetch
      .mockResolvedValueOnce(page('Initial'))
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ conversations: [], hasMore: false, nextOffset: 0 });
    jest.mocked(deleteAllArchivedConversations).mockReturnValueOnce(mutation.promise);
    const screen = render(<ArchivedChatsScreen />);
    await screen.findByText('Initial');
    fireEvent.press(screen.getByLabelText('Load more archived chats'));
    fireEvent.press(screen.getByLabelText('Delete all archived chats'));
    const confirm = alertSpy.mock.calls
      .at(-1)?.[2]
      ?.find((button) => button.text === 'Delete all')?.onPress;
    if (!confirm) throw new Error('Missing confirmation');
    act(() => confirm());
    await act(async () => mutation.resolve(2));
    await screen.findByText('No archived chats');
    await act(async () => old.resolve(page('Removed row')));
    expect(screen.queryByText('Removed row')).toBeNull();
    expect(mockFetch.mock.calls[2]?.[0]).toBe(0);
  });

  it.each(['focus', 'mode', 'account', 'unmount'] as const)(
    'retires reads and confirmations on %s lifetime change',
    async (change) => {
      const old = deferred<FixturePage>();
      mockFetch
        .mockResolvedValueOnce(page('Initial'))
        .mockReturnValueOnce(old.promise)
        .mockResolvedValue(page('Replacement'));
      const screen = render(<ArchivedChatsScreen />);
      fireEvent.press(await screen.findByLabelText('Delete Initial'));
      const confirm = alertSpy.mock.calls
        .at(-1)?.[2]
        ?.find((button) => button.text === 'Delete')?.onPress;
      if (!confirm) throw new Error('Missing confirmation');
      const oldRefresh = screen.UNSAFE_getByType(RefreshControl).props.onRefresh;
      act(() => oldRefresh());
      const signal = mockFetch.mock.calls[1]?.[2] as AbortSignal;
      act(() => {
        if (change === 'focus') {
          mockFocused = false;
          mockBlur?.();
          mockFocus?.();
        } else if (change === 'mode') {
          useChatAppModeStore.setState({ appMode: 'local' });
          useChatAppModeStore.setState({ appMode: 'cloud' });
        } else if (change === 'account') {
          activateCloudAccount('account-b');
          activateCloudAccount('account-a');
        } else screen.unmount();
      });
      expect(signal.aborted).toBe(true);
      if (change !== 'unmount') await screen.findByText('Replacement');
      const count = mockFetch.mock.calls.length;
      act(() => {
        confirm();
        oldRefresh();
      });
      expect(deleteArchivedConversation).not.toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledTimes(count);
      await act(async () => old.reject(new Error('old failure')));
      expect(alertSpy).toHaveBeenCalledTimes(1);
      if (change !== 'unmount') expect(screen.getByText('Replacement')).toBeTruthy();
    },
  );

  it('does not call a confirmed restore a failure when reconciliation fails', async () => {
    mockFetch
      .mockResolvedValueOnce(page('Initial', 50))
      .mockRejectedValueOnce(new Error('list unavailable'));
    mockRestore.mockResolvedValueOnce(undefined);
    const screen = render(<ArchivedChatsScreen />);
    fireEvent.press(await screen.findByLabelText('Restore Initial'));
    await screen.findByText('Could not load archived chats. Retry.');
    expect(mockLoadConversations).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Load more archived chats')).toBeNull();
    mockFetch.mockResolvedValueOnce(page('Refreshed', 50));
    fireEvent.press(screen.getByLabelText('Retry loading archived chats'));
    await screen.findByText('Refreshed');
    expect(mockFetch.mock.calls[2]?.[0]).toBe(0);
  });

  it.each(['focus', 'mode', 'account', 'unmount'] as const)(
    'suppresses a retired restore receipt after %s change',
    async (change) => {
      const old = deferred<void>();
      const current = deferred<void>();
      mockFetch.mockResolvedValueOnce(page('Initial')).mockResolvedValue(page('Replacement'));
      mockRestore.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
      const screen = render(<ArchivedChatsScreen />);
      fireEvent.press(await screen.findByLabelText('Restore Initial'));
      const signal = mockRestore.mock.calls[0]?.[2] as AbortSignal;
      act(() => {
        if (change === 'focus') {
          mockFocused = false;
          mockBlur?.();
          mockFocus?.();
        } else if (change === 'mode') {
          useChatAppModeStore.setState({ appMode: 'local' });
          useChatAppModeStore.setState({ appMode: 'cloud' });
        } else if (change === 'account') {
          activateCloudAccount('account-b');
          activateCloudAccount('account-a');
        } else screen.unmount();
      });
      expect(signal.aborted).toBe(true);
      if (change !== 'unmount') {
        fireEvent.press(await screen.findByLabelText('Restore Replacement'));
        expect(screen.getByText('Working…')).toBeTruthy();
      }
      const count = mockFetch.mock.calls.length;
      await act(async () => old.resolve());
      expect(mockFetch).toHaveBeenCalledTimes(count);
      expect(mockLoadConversations).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
      if (change !== 'unmount') {
        expect(screen.getByText('Working…')).toBeTruthy();
        await act(async () => current.resolve());
      }
    },
  );

  it('does not load while blurred even when the account epoch changes', async () => {
    mockFetch.mockResolvedValue(page('Initial'));
    const screen = render(<ArchivedChatsScreen />);
    await screen.findByText('Initial');
    act(() => {
      mockFocused = false;
      mockBlur?.();
      activateCloudAccount('account-b');
      activateCloudAccount('account-a');
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    act(() => mockFocus?.());
    await screen.findByText('Initial');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

type ImportedModule0 = typeof import('react');
type ImportedModule1 = typeof import('zustand');

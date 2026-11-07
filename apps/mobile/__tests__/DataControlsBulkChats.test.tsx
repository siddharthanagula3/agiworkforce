/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPost = jest.fn();
const mockPush = jest.fn();
const mockLoadConversations = jest.fn().mockResolvedValue(undefined);

let mockAppMode: 'local' | 'cloud' = 'cloud';
let mockCloudUnlocked = true;
let mockConversationLoadError: string | null = null;
const mockAccessListeners = new Set<
  (state: { cloudUnlocked: boolean }, previous: { cloudUnlocked: boolean }) => void
>();
const mockFocusCallbacks = new Map<() => void | (() => void), (() => void) | undefined>();
const mockModeListeners = new Set<
  (state: { appMode: string }, previous: { appMode: string }) => void
>();

jest.mock('@/services/api', () => ({
  api: {
    get: jest.fn(),
    put: jest.fn(),
    post: (...args: unknown[]) => mockPost(...args),
    delete: jest.fn(),
  },
}));

jest.mock('@/services/dsarExport', () => ({ exportAllUserData: jest.fn() }));

jest.mock('@/src/features/settings/data-controls/localDataSnapshot', () => ({
  LocalExportAuthorityError: class LocalExportAuthorityError extends Error {},
  buildLocalDataExportSnapshot: jest.fn(() => ({})),
}));

jest.mock('@/src/features/settings/data-controls/localCloudSyncService', () => ({
  syncLocalConversationsToCloud: jest.fn(),
  prepareLocalCloudSync: jest.fn(() => ({
    account: require('@/src/features/auth/services/cloudAccountSession').captureCloudAccountEpoch(),
    mode: 'cloud',
    conversationLimit: 50,
    messageLimit: 100,
    emptyChatsExcluded: 0,
    conversations: [{ id: 'fixture' }],
    messageCount: 2,
    temporaryChatsExcluded: 0,
    conversationsOmitted: 0,
    messagesOmitted: 0,
  })),
}));

jest.mock('@/stores/chat/chatMessageStore', () => ({
  useChatMessageStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ loadConversations: mockLoadConversations }),
    { getState: () => ({ conversationLoadError: mockConversationLoadError }) },
  ),
}));

jest.mock('@/src/features/auth/store', () => {
  const { create } = jest.requireActual<typeof import('zustand')>('zustand');
  return {
    useAuthStore: create(() => ({
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'account-a',
    })),
  };
});

jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) => selector({ appMode: mockAppMode }),
    {
      getState: () => ({ appMode: mockAppMode }),
      subscribe: (
        listener: (state: { appMode: string }, previous: { appMode: string }) => void,
      ) => {
        mockModeListeners.add(listener);
        return () => mockModeListeners.delete(listener);
      },
    },
  ),
}));

jest.mock('@/src/features/waitlist/store', () => ({
  useWaitlistStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ cloudUnlocked: mockCloudUnlocked }),
    {
      getState: () => ({ cloudUnlocked: mockCloudUnlocked }),
      subscribe: (
        listener: (state: { cloudUnlocked: boolean }, previous: { cloudUnlocked: boolean }) => void,
      ) => {
        mockAccessListeners.add(listener);
        return () => mockAccessListeners.delete(listener);
      },
    },
  ),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(() => {
      const cleanup = callback();
      mockFocusCallbacks.set(callback, typeof cleanup === 'function' ? cleanup : undefined);
      return () => {
        mockFocusCallbacks.get(callback)?.();
        mockFocusCallbacks.delete(callback);
      };
    }, [callback]);
  },
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    navigate: jest.fn(),
    canGoBack: () => true,
  }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('react-native-safe-area-context', () => {
  const RN = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: Record<string, unknown>) => (
      <RN.View {...props}>{children as React.ReactNode}</RN.View>
    ),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const factory = (name: string) => (props: Record<string, unknown>) => (
    <RN.View testID={`icon-${name}`} {...props} />
  );
  return new Proxy(
    {},
    { get: (_t, name: string) => (name === '__esModule' ? true : factory(name)) },
  );
});

const mockThemeColors = {
  textPrimary: '#fff',
  textSecondary: '#aaa',
  textMuted: '#777',
  border: '#333',
  teal: '#2dd4bf',
  accentText: '#000',
  surfaceBase: '#0e0e0e',
  surfaceElevated: '#1a1a1a',
  surfaceHover: '#222',
  neutralSurface: '#222',
  dangerSurface: '#2a0f0f',
  dangerBorder: '#5a1f1f',
  agentError: '#ef4444',
};

jest.mock('@/src/ui/theme', () => ({
  colors: mockThemeColors,
  cardRadius: 14,
  useTheme: () => ({ colors: mockThemeColors, isDark: true, statusBarStyle: 'light' }),
  useThemeColors: () => mockThemeColors,
}));

import { useAuthStore } from '@/src/features/auth/store';
import DataControlsScreen from '@/src/features/settings/data-controls';
import { syncLocalConversationsToCloud } from '@/src/features/settings/data-controls/localCloudSyncService';
import {
  activateCloudAccount,
  captureCloudAccountEpoch,
  invalidateCloudAccount,
  __resetCloudAccountSessionForTests,
} from '@/src/features/auth/services/cloudAccountSession';
import {
  archiveAllConversations,
  deleteAllArchivedConversations,
  deleteAllConversations,
} from '@/src/features/archived-chats';

type AlertButton = { text?: string; style?: string; onPress?: () => void };

const alertCalls: Array<{
  title: string;
  message?: string;
  buttons: AlertButton[];
  onDismiss?: () => void;
}> = [];

function pressAlertButton(text: string) {
  for (let i = alertCalls.length - 1; i >= 0; i -= 1) {
    const button = alertCalls[i].buttons.find((b) => b.text === text);
    if (button) {
      act(() => {
        button.onPress?.();
      });
      return;
    }
  }
  throw new Error(
    `No alert button "${text}". Seen: ${alertCalls
      .map((call) => `${call.title} [${call.buttons.map((b) => b.text).join('|')}]`)
      .join(' ; ')}`,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('account-a');
  alertCalls.length = 0;
  mockModeListeners.clear();
  mockAccessListeners.clear();
  mockFocusCallbacks.clear();
  mockConversationLoadError = null;
  mockLoadConversations.mockReset().mockResolvedValue(undefined);
  useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'account-a' });
  mockAppMode = 'cloud';
  mockCloudUnlocked = true;
  mockPost.mockResolvedValue({ success: true, action: 'archive_all', affectedCount: 3 });
  jest
    .spyOn(Alert, 'alert')
    .mockImplementation(
      (
        title: string,
        message?: string,
        buttons?: AlertButton[],
        options?: { onDismiss?: () => void },
      ) => {
        alertCalls.push({ title, message, buttons: buttons ?? [], onDismiss: options?.onDismiss });
      },
    );
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Data controls, Chat history bulk actions', () => {
  it('keeps Cloud export and deletion discoverable without bypassing the account flow', () => {
    const screen = render(<DataControlsScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Export Cloud data' }));
    fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));

    expect(mockPush).toHaveBeenNthCalledWith(1, '/(app)/settings/cloud-account');
    expect(mockPush).toHaveBeenNthCalledWith(2, '/(app)/settings/cloud-account');
    expect(alertCalls).toHaveLength(0);
  });

  it('announces Delete account as a button that opens the confirmed deletion flow', () => {
    const screen = render(<DataControlsScreen />);

    const row = screen.getByTestId('delete-account-row');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityHint).toBe(
      'Opens account deletion, which asks you to confirm first',
    );
  });

  it('does not show the previous account’s sync result after an account switch', async () => {
    activateCloudAccount('account-a');
    let resolveSync!: (result: {
      conversationsSynced: number;
      messagesSynced: number;
      errors: string[];
    }) => void;
    (syncLocalConversationsToCloud as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSync = resolve;
        }),
    );
    const { getByTestId } = render(<DataControlsScreen />);

    fireEvent.press(getByTestId('sync-to-cloud-button'));
    pressAlertButton('Sync to Cloud');
    activateCloudAccount('account-b');
    await act(async () => {
      resolveSync({ conversationsSynced: 1, messagesSynced: 2, errors: [] });
    });

    expect(alertCalls.some((call) => call.title === 'Selected text copied')).toBe(false);
    expect(alertCalls.some((call) => call.title === 'Copy not fully confirmed')).toBe(false);
  });

  it('does not execute a confirmation opened for the previous account', () => {
    const screen = render(<DataControlsScreen />);
    fireEvent.press(screen.getByTestId('sync-to-cloud-button'));
    act(() => {
      activateCloudAccount('account-b');
      activateCloudAccount('account-a');
    });
    pressAlertButton('Sync to Cloud');
    expect(syncLocalConversationsToCloud).not.toHaveBeenCalled();
  });

  it('does not revive a pending confirmation after Local-to-Cloud ABA', () => {
    const screen = render(<DataControlsScreen />);
    fireEvent.press(screen.getByTestId('sync-to-cloud-button'));
    act(() => {
      mockAppMode = 'local';
      mockModeListeners.forEach((listener) => listener({ appMode: 'local' }, { appMode: 'cloud' }));
      mockAppMode = 'cloud';
      mockModeListeners.forEach((listener) => listener({ appMode: 'cloud' }, { appMode: 'local' }));
    });
    pressAlertButton('Sync to Cloud');
    expect(syncLocalConversationsToCloud).not.toHaveBeenCalled();
  });

  it('does not execute a confirmation after the screen unmounts', () => {
    const screen = render(<DataControlsScreen />);
    fireEvent.press(screen.getByTestId('sync-to-cloud-button'));
    screen.unmount();
    pressAlertButton('Sync to Cloud');
    expect(syncLocalConversationsToCloud).not.toHaveBeenCalled();
  });

  it('requires a manual Cloud-mode selection before opening a copy dialog', () => {
    mockAppMode = 'local';
    const screen = render(<DataControlsScreen />);
    fireEvent.press(screen.getByTestId('sync-to-cloud-button'));
    expect(alertCalls.at(-1)?.title).toBe('Chat is set to Local Mode');
    expect(syncLocalConversationsToCloud).not.toHaveBeenCalled();
    expect(mockAppMode).toBe('local');
  });

  it('posts action "archive_all" only after both confirmation steps', async () => {
    mockPost.mockResolvedValue({ success: true, action: 'archive_all', affectedCount: 3 });
    const { getByTestId } = render(<DataControlsScreen />);

    fireEvent.press(getByTestId('archive-all-chats-button'));
    expect(mockPost).not.toHaveBeenCalled();

    pressAlertButton('Archive all');
    expect(mockPost).not.toHaveBeenCalled();

    pressAlertButton('Yes, archive all');

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost).toHaveBeenCalledWith(
      '/api/chat/conversations/bulk',
      {
        action: 'archive_all',
      },
      { accountEpoch: captureCloudAccountEpoch(), signal: expect.anything() },
    );
  });

  it('posts action "delete_all" only after both confirmation steps', async () => {
    mockPost.mockResolvedValue({ success: true, action: 'delete_all', affectedCount: 7 });
    const { getByTestId } = render(<DataControlsScreen />);

    fireEvent.press(getByTestId('delete-all-chats-button'));
    expect(mockPost).not.toHaveBeenCalled();

    pressAlertButton('Delete all');
    expect(mockPost).not.toHaveBeenCalled();

    pressAlertButton('Yes, delete all chats');

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost).toHaveBeenCalledWith(
      '/api/chat/conversations/bulk',
      { action: 'delete_all' },
      { accountEpoch: captureCloudAccountEpoch(), signal: expect.anything() },
    );
  });

  it('never posts the archived-only action from either bulk button', async () => {
    const { getByTestId } = render(<DataControlsScreen />);

    fireEvent.press(getByTestId('archive-all-chats-button'));
    pressAlertButton('Archive all');
    pressAlertButton('Yes, archive all');
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));

    for (const call of mockPost.mock.calls) {
      expect(call[1]).not.toEqual({ action: 'delete_archived' });
    }
  });

  it('refreshes the chat list and reports the server-reported count on success', async () => {
    mockPost.mockResolvedValue({ success: true, action: 'delete_all', affectedCount: 1 });
    const { getByTestId } = render(<DataControlsScreen />);

    fireEvent.press(getByTestId('delete-all-chats-button'));
    pressAlertButton('Delete all');
    pressAlertButton('Yes, delete all chats');

    await waitFor(() => expect(mockLoadConversations).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(alertCalls.some((call) => call.title === 'Chats deleted')).toBe(true),
    );
    expect(alertCalls.find((call) => call.title === 'Chats deleted')?.message).toBe(
      '1 chat deleted.',
    );
  });

  it('surfaces a user-facing failure and never the transport message', async () => {
    mockPost.mockRejectedValue(
      new Error('egressGuard refused: outbound request to our managed-cloud host is blocked'),
    );
    const { getByTestId } = render(<DataControlsScreen />);

    fireEvent.press(getByTestId('archive-all-chats-button'));
    pressAlertButton('Archive all');
    pressAlertButton('Yes, archive all');

    await waitFor(() =>
      expect(alertCalls.some((call) => call.title === 'Archive outcome unknown')).toBe(true),
    );
    expect(mockLoadConversations).not.toHaveBeenCalled();
    expect(alertCalls.at(-1)?.message).toContain('Check your Cloud chat history');
    expect(alertCalls.at(-1)?.message).not.toContain('try again');
    for (const call of alertCalls) {
      expect(call.message ?? '').not.toContain('egressGuard');
    }
  });

  it('refuses before any request when the account is not signed in to AGI Cloud', () => {
    mockCloudUnlocked = false;
    const { getByTestId, getAllByText } = render(<DataControlsScreen />);

    expect(getAllByText('Requires AGI Cloud sign-in').length).toBe(3);

    fireEvent.press(getByTestId('delete-all-chats-button'));

    expect(mockPost).not.toHaveBeenCalled();
    expect(alertCalls.at(-1)?.title).toBe('AGI Cloud required');
  });

  it('refuses before any request while chat is pinned to Local Mode', () => {
    mockAppMode = 'local';
    const { getByTestId } = render(<DataControlsScreen />);

    fireEvent.press(getByTestId('archive-all-chats-button'));

    expect(mockPost).not.toHaveBeenCalled();
    expect(alertCalls.at(-1)?.title).toBe('Chat is set to Local Mode');
  });

  it('does not run a confirmed action after the cloud account changes', () => {
    const { getByTestId } = render(<DataControlsScreen />);

    fireEvent.press(getByTestId('delete-all-chats-button'));
    pressAlertButton('Delete all');
    activateCloudAccount('account-b');
    pressAlertButton('Yes, delete all chats');

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('does not run a confirmed action after switching to Local Mode', () => {
    const { getByTestId } = render(<DataControlsScreen />);

    fireEvent.press(getByTestId('archive-all-chats-button'));
    pressAlertButton('Archive all');
    mockAppMode = 'local';
    pressAlertButton('Yes, archive all');

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('does not refresh or report an old account action after an account switch', async () => {
    let resolveAction!: (result: unknown) => void;
    mockPost.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );
    const { getByTestId } = render(<DataControlsScreen />);

    fireEvent.press(getByTestId('archive-all-chats-button'));
    pressAlertButton('Archive all');
    pressAlertButton('Yes, archive all');
    activateCloudAccount('account-b');
    await act(async () => {
      resolveAction({ success: true, action: 'archive_all', affectedCount: 3 });
    });

    expect(mockLoadConversations).not.toHaveBeenCalled();
    expect(alertCalls.some((call) => call.title === 'Chats archived')).toBe(false);
  });

  it('links to the archived chats screen', () => {
    const { getByText } = render(<DataControlsScreen />);

    fireEvent.press(getByText('Archived chats'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/archived-chats');
  });
});

function changeMode(mode: 'local' | 'cloud') {
  const previous = mockAppMode;
  mockAppMode = mode;
  mockModeListeners.forEach((listener) => listener({ appMode: mode }, { appMode: previous }));
}

function blurScreen() {
  mockFocusCallbacks.forEach((cleanup) => cleanup?.());
}

function focusScreen() {
  mockFocusCallbacks.forEach((_cleanup, callback) => {
    const cleanup = callback();
    mockFocusCallbacks.set(callback, typeof cleanup === 'function' ? cleanup : undefined);
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe.each([
  ['archive', 'Archive all', 'Yes, archive all', 'Chats archived'],
  ['delete', 'Delete all', 'Yes, delete all chats', 'Chats deleted'],
] as const)('%s bulk intent lifetime', (action, first, second, receipt) => {
  const open = () => {
    const screen = render(<DataControlsScreen />);
    fireEvent.press(screen.getByTestId(`${action}-all-chats-button`));
    return screen;
  };

  it('claims synchronously, consumes each confirmation once, and ignores prior dismissals', async () => {
    const pending = deferred<unknown>();
    mockPost.mockReturnValueOnce(pending.promise);
    const screen = render(<DataControlsScreen />);
    const entry = screen.getByTestId(`${action}-all-chats-button`).props.onPress;
    const otherEntry = screen.getByTestId(
      `${action === 'archive' ? 'delete' : 'archive'}-all-chats-button`,
    ).props.onPress;
    act(() => {
      entry();
      entry();
      otherEntry();
    });
    expect(alertCalls).toHaveLength(1);
    const firstDialog = alertCalls[0];
    pressAlertButton(first);
    pressAlertButton(first);
    expect(alertCalls).toHaveLength(2);
    act(() => {
      firstDialog.onDismiss?.();
      firstDialog.buttons[0].onPress?.();
    });
    pressAlertButton(second);
    pressAlertButton(second);
    act(() => {
      alertCalls[1].onDismiss?.();
      alertCalls[1].buttons[0].onPress?.();
    });
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(
      screen.getByTestId(`${action}-all-chats-button`).props.accessibilityState?.disabled ??
        screen.getByTestId(`${action}-all-chats-button`).props.disabled,
    ).toBe(true);
    await act(async () =>
      pending.resolve({ success: true, action: `${action}_all`, affectedCount: 2 }),
    );
    expect(alertCalls.some((call) => call.title === receipt)).toBe(true);
  });

  it.each(['first', 'second'] as const)('consumes Cancel and dismiss in the %s stage', (stage) => {
    const screen = open();
    if (stage === 'second') pressAlertButton(first);
    const dialog = alertCalls.at(-1)!;
    act(() => dialog.buttons[0].onPress?.());
    act(() => dialog.buttons[1].onPress?.());
    expect(mockPost).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId(`${action}-all-chats-button`));
    if (stage === 'second') pressAlertButton(first);
    const dismissed = alertCalls.at(-1)!;
    act(() => dismissed.onDismiss?.());
    act(() => dismissed.buttons[1].onPress?.());
    expect(mockPost).not.toHaveBeenCalled();
    expect(alertCalls.at(-1)).toBe(dismissed);
  });

  it.each(['first', 'second'] as const)(
    'retires %s-stage confirmations on mode, account, auth, access, focus and unmount',
    (stage) => {
      const transitions = [
        () => {
          changeMode('local');
          changeMode('cloud');
        },
        () => {
          activateCloudAccount('account-b');
          activateCloudAccount('account-a');
        },
        () => {
          invalidateCloudAccount();
          activateCloudAccount('account-a');
        },
        () => {
          useAuthStore.setState({ isClerkSignedIn: false });
          useAuthStore.setState({ isClerkSignedIn: true });
        },
        () => {
          mockCloudUnlocked = false;
          mockAccessListeners.forEach((listener) =>
            listener({ cloudUnlocked: false }, { cloudUnlocked: true }),
          );
          mockCloudUnlocked = true;
          mockAccessListeners.forEach((listener) =>
            listener({ cloudUnlocked: true }, { cloudUnlocked: false }),
          );
        },
        () => {
          blurScreen();
          focusScreen();
        },
      ];
      for (const transition of transitions) {
        const screen = open();
        if (stage === 'second') pressAlertButton(first);
        const dialog = alertCalls.at(-1)!;
        const count = alertCalls.length;
        act(transition);
        act(() => dialog.buttons[1].onPress?.());
        expect(alertCalls).toHaveLength(count);
        expect(mockPost).not.toHaveBeenCalled();
        screen.unmount();
      }
      const screen = open();
      if (stage === 'second') pressAlertButton(first);
      const dialog = alertCalls.at(-1)!;
      screen.unmount();
      act(() => dialog.buttons[1].onPress?.());
      expect(mockPost).not.toHaveBeenCalled();
    },
  );

  it('rejects a saved rendered entry after account or focus replacement', () => {
    const screen = render(<DataControlsScreen />);
    const entry = screen.getByTestId(`${action}-all-chats-button`).props.onPress;
    act(() => {
      activateCloudAccount('account-b');
      activateCloudAccount('account-a');
    });
    act(() => entry());
    expect(alertCalls).toHaveLength(0);
    const focusedEntry = screen.getByTestId(`${action}-all-chats-button`).props.onPress;
    act(() => {
      blurScreen();
      focusScreen();
    });
    act(() => focusedEntry());
    expect(alertCalls).toHaveLength(0);
    fireEvent.press(screen.getByTestId(`${action}-all-chats-button`));
    expect(alertCalls).toHaveLength(1);
  });

  it.each(['resolve', 'reject'] as const)(
    'ignores a stale %s and its finally while a newer intent owns busy state',
    async (outcome) => {
      const old = deferred<unknown>();
      mockPost.mockReturnValueOnce(old.promise);
      const screen = open();
      pressAlertButton(first);
      pressAlertButton(second);
      const signal = mockPost.mock.calls[0][2].signal as AbortSignal;
      act(() => {
        changeMode('local');
        changeMode('cloud');
      });
      expect(signal.aborted).toBe(true);
      fireEvent.press(screen.getByTestId(`${action}-all-chats-button`));
      const current = alertCalls.at(-1);
      await act(async () => {
        if (outcome === 'resolve')
          old.resolve({ success: true, action: `${action}_all`, affectedCount: 2 });
        else old.reject(new Error('late failure'));
      });
      expect(mockLoadConversations).not.toHaveBeenCalled();
      expect(alertCalls.at(-1)).toBe(current);
      expect(
        screen.getByTestId(`${action}-all-chats-button`).props.accessibilityState?.disabled ??
          screen.getByTestId(`${action}-all-chats-button`).props.disabled,
      ).toBe(true);
      pressAlertButton(first);
      pressAlertButton(second);
      await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    },
  );

  it('suppresses receipts when focus is lost during the list refresh', async () => {
    const refresh = deferred<void>();
    mockLoadConversations.mockReturnValueOnce(refresh.promise);
    const screen = open();
    pressAlertButton(first);
    pressAlertButton(second);
    await waitFor(() => expect(mockLoadConversations).toHaveBeenCalledTimes(1));
    act(blurScreen);
    await act(async () => refresh.resolve());
    expect(alertCalls.some((call) => call.title === receipt)).toBe(false);
    screen.unmount();
  });

  it.each(['resolved error', 'rejection'] as const)(
    'preserves the acknowledged mutation after refresh %s',
    async (failure) => {
      if (failure === 'resolved error') {
        mockLoadConversations.mockImplementationOnce(async () => {
          mockConversationLoadError = 'refresh failed';
        });
      } else mockLoadConversations.mockRejectedValueOnce(new Error('refresh failed'));
      open();
      pressAlertButton(first);
      pressAlertButton(second);
      await waitFor(() => expect(alertCalls.some((call) => call.title === receipt)).toBe(true));
      expect(alertCalls.find((call) => call.title === receipt)?.message).toContain(
        'The change was confirmed',
      );
      expect(alertCalls.some((call) => call.title.endsWith('outcome unknown'))).toBe(false);
    },
  );
});

describe('archived-chats bulk service', () => {
  it('maps each helper to its own action on the shared bulk endpoint', async () => {
    mockPost.mockResolvedValue({ success: true, action: 'archive_all', affectedCount: 2 });
    await expect(archiveAllConversations(captureCloudAccountEpoch()!)).resolves.toBe(2);
    expect(mockPost).toHaveBeenLastCalledWith(
      '/api/chat/conversations/bulk',
      {
        action: 'archive_all',
      },
      { accountEpoch: captureCloudAccountEpoch() },
    );

    mockPost.mockResolvedValue({ success: true, action: 'delete_all', affectedCount: 4 });
    await expect(deleteAllConversations(captureCloudAccountEpoch()!)).resolves.toBe(4);
    expect(mockPost).toHaveBeenLastCalledWith(
      '/api/chat/conversations/bulk',
      {
        action: 'delete_all',
      },
      { accountEpoch: captureCloudAccountEpoch() },
    );

    mockPost.mockResolvedValue({ success: true, action: 'delete_archived', affectedCount: 0 });
    const account = captureCloudAccountEpoch();
    if (!account) throw new Error('Missing fixture account');
    await expect(deleteAllArchivedConversations(account)).resolves.toBe(0);
    expect(mockPost).toHaveBeenLastCalledWith(
      '/api/chat/conversations/bulk',
      {
        action: 'delete_archived',
      },
      { accountEpoch: account },
    );
  });

  it.each([archiveAllConversations, deleteAllConversations])(
    'passes the original epoch and optional signal and rejects stale completions',
    async (mutate) => {
      const account = captureCloudAccountEpoch()!;
      const controller = new AbortController();
      const pending = deferred<unknown>();
      mockPost.mockReturnValueOnce(pending.promise);
      const request = mutate(account, controller.signal);
      const rejected = expect(request).rejects.toThrow('Cloud account changed');
      expect(mockPost.mock.calls[0][2]).toEqual({
        accountEpoch: account,
        signal: controller.signal,
      });
      activateCloudAccount('account-b');
      activateCloudAccount('account-a');
      pending.resolve({ success: true, action: 'archive_all', affectedCount: 1 });
      await rejected;
      mockPost.mockClear();
      await expect(mutate(account)).rejects.toThrow('Cloud account changed');
      expect(mockPost).not.toHaveBeenCalled();
    },
  );

  it('rejects a response that does not match the server contract', async () => {
    mockPost.mockResolvedValue({ success: true, action: 'archive_all' });
    await expect(archiveAllConversations(captureCloudAccountEpoch()!)).rejects.toThrow();

    mockPost.mockResolvedValue({ success: false, action: 'delete_all', affectedCount: 1 });
    await expect(deleteAllConversations(captureCloudAccountEpoch()!)).rejects.toThrow();
  });
});

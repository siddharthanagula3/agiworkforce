/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockFetch = jest.fn();
const mockRestore = jest.fn();
const mockLoadConversations = jest.fn();
let mockClerkUserId = 'account-a';
let mockAppMode = 'cloud';

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    canGoBack: () => false,
    back: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
  }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'View' }));
jest.mock('@/components/ui/card', () => ({
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
jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (
    selector: (state: {
      isClerkLoaded: boolean;
      isClerkSignedIn: boolean;
      clerkUserId: string;
    }) => unknown,
  ) => selector({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: mockClerkUserId }),
}));
jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: Object.assign(
    (selector: (state: { appMode: string; setAppMode: () => void }) => unknown) =>
      selector({ appMode: mockAppMode, setAppMode: jest.fn() }),
    { getState: () => ({ appMode: mockAppMode }) },
  ),
}));
jest.mock('@/stores/chat/chatMessageStore', () => ({
  useChatMessageStore: (selector: (state: { loadConversations: () => Promise<void> }) => unknown) =>
    selector({ loadConversations: mockLoadConversations }),
}));
jest.mock('@/src/features/settings/common', () => ({
  CloudAccountRequired: () => null,
  CloudSyncBlockedBanner: () => null,
}));
jest.mock('@/src/features/archived-chats', () => ({
  fetchArchivedConversations: (...args: unknown[]) => mockFetch(...args),
  restoreArchivedConversation: (...args: unknown[]) => mockRestore(...args),
  deleteArchivedConversation: jest.fn(),
  deleteAllArchivedConversations: jest.fn(),
}));

import ArchivedChatsScreen from '../app/(app)/settings/archived-chats';
import {
  activateCloudAccount,
  __resetCloudAccountSessionForTests,
} from '@/src/features/auth/services/cloudAccountSession';
import { deleteArchivedConversation } from '@/src/features/archived-chats';

describe('Archived chats failure recovery', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('account-a');
    mockClerkUserId = 'account-a';
    mockAppMode = 'cloud';
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
    mockFetch.mockResolvedValue({
      conversations: [
        { id: 'chat-1', title: 'Launch plan', updatedAt: '2026-09-27T00:00:00.000Z' },
      ],
      hasMore: false,
      nextOffset: 1,
    });
    mockRestore.mockResolvedValue(undefined);
    mockLoadConversations.mockRejectedValue(new Error('private refresh detail'));

    const screen = render(<ArchivedChatsScreen />);
    await waitFor(() => expect(screen.getByLabelText('Restore Launch plan')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Restore Launch plan'));

    await waitFor(() => expect(mockRestore).toHaveBeenCalledWith('chat-1'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Chat restored', expect.any(String)));
    expect(alertSpy.mock.calls[0]?.[1]).toBe('Refresh your chats to see it in the list.');
    expect(screen.queryByText('Launch plan')).toBeNull();
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
    mockClerkUserId = 'account-b';
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
    mockClerkUserId = 'account-b';
    screen.rerender(<ArchivedChatsScreen />);

    expect(screen.queryByText('Old account chat')).toBeNull();
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
});

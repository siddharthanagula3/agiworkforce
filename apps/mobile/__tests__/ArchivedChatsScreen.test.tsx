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

import ArchivedChatsScreen from '../app/(app)/settings/archived-chats';
import {
  activateCloudAccount,
  captureCloudAccountEpoch,
  __resetCloudAccountSessionForTests,
} from '@/src/features/auth/services/cloudAccountSession';
import { deleteArchivedConversation, deleteAllArchivedConversations } from '@/src/features/archived-chats';

describe('Archived chats failure recovery', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(deleteArchivedConversation).mockReset();
    jest.mocked(deleteAllArchivedConversations).mockReset();
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

    await waitFor(() => expect(mockRestore).toHaveBeenCalledWith('chat-1', expect.objectContaining({ ownerId: 'account-a' })));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Chat restored', expect.any(String)));
    expect(alertSpy.mock.calls[0]?.[1]).toBe('Refresh your chats to see it in the list.');
    expect(screen.queryByText('Launch plan')).toBeNull();
  });

  it('does not claim the chat remains archived after an uncertain restore response', async () => {
    mockFetch.mockResolvedValue({
      conversations: [{ id: 'chat-1', title: 'Launch plan', updatedAt: '2026-09-27T00:00:00.000Z' }],
      hasMore: false,
      nextOffset: 1,
    });
    mockRestore.mockRejectedValueOnce(new Error('response lost'));
    const screen = render(<ArchivedChatsScreen />);
    fireEvent.press(await screen.findByLabelText('Restore Launch plan'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Could not restore',
      'Could not confirm the restore. Refresh archived chats before trying again.'));
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

  it('does not rebind a saved Restore row callback to a replacement account', async () => {
    mockFetch.mockResolvedValue({
      conversations: [{ id: 'chat-1', title: 'Launch plan', updatedAt: '2026-09-27T00:00:00.000Z' }],
      hasMore: false,
      nextOffset: 1,
    });
    const screen = render(<ArchivedChatsScreen />);
    const restore = (await screen.findByLabelText('Restore Launch plan')).props.onPress;
    activateCloudAccount('account-b');
    mockClerkUserId = 'account-b';
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
        conversations: [{ id: 'chat-1', title: 'Launch plan', updatedAt: '2026-09-27T00:00:00.000Z' }],
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

    it.each([false, true])('rejects saved rendered buttons after replacement, round trip: %s', async (roundTrip) => {
      const screen = await renderRows();
      const press = screen.getByLabelText(label).props.onPress;
      activateCloudAccount('account-b');
      if (roundTrip) activateCloudAccount('account-a');
      act(() => press());
      expect(alertSpy).not.toHaveBeenCalled();
      expect(mutation).not.toHaveBeenCalled();
    });

    it.each([false, true])('rejects saved confirmations after replacement, round trip: %s', async (roundTrip) => {
      const screen = await renderRows();
      fireEvent.press(screen.getByLabelText(label));
      const { confirm } = buttons();
      activateCloudAccount('account-b');
      if (roundTrip) activateCloudAccount('account-a');
      act(() => confirm());
      expect(mutation).not.toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    it('retires the confirmation on Cancel', async () => {
      const screen = await renderRows();
      fireEvent.press(screen.getByLabelText(label));
      const { confirm, cancel } = buttons();
      act(() => { cancel(); confirm(); });
      expect(mutation).not.toHaveBeenCalled();
    });

    it('dispatches once with the rendered owner and consumes the completed confirmation', async () => {
      let resolve!: () => void;
      const pending = new Promise<void>((yes) => { resolve = yes; });
      jest.mocked(deleteArchivedConversation).mockReturnValueOnce(pending);
      jest.mocked(deleteAllArchivedConversations).mockReturnValueOnce(pending.then(() => 1));
      const screen = await renderRows();
      const account = captureCloudAccountEpoch();
      fireEvent.press(screen.getByLabelText(label));
      const { confirm } = buttons();
      act(() => { confirm(); confirm(); });
      expect(mutation).toHaveBeenCalledTimes(1);
      if (kind === 'row') expect(mutation).toHaveBeenCalledWith('chat-1', account);
      else expect(mutation).toHaveBeenCalledWith(account);
      await act(async () => { resolve(); });
      expect(screen.queryByText('Launch plan')).toBeNull();
      act(() => confirm());
      expect(mutation).toHaveBeenCalledTimes(1);
    });

    it.each(['resolve', 'reject'] as const)('suppresses late %s after replacement', async (outcome) => {
      let resolve!: () => void;
      let reject!: (error: Error) => void;
      const pending = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
      if (kind === 'row') jest.mocked(deleteArchivedConversation).mockReturnValueOnce(pending);
      else jest.mocked(deleteAllArchivedConversations).mockReturnValueOnce(pending.then(() => 1));
      const screen = await renderRows();
      fireEvent.press(screen.getByLabelText(label));
      const { confirm } = buttons();
      act(() => confirm());
      mockFetch.mockResolvedValue({
        conversations: [{ id: 'replacement-chat', title: 'Replacement chat', updatedAt: '2026-09-27T00:00:00.000Z' }],
        hasMore: false,
        nextOffset: 1,
      });
      activateCloudAccount('account-b');
      mockClerkUserId = 'account-b';
      screen.rerender(<ArchivedChatsScreen />);
      await screen.findByText('Replacement chat');
      await act(async () => {
        if (outcome === 'resolve') resolve();
        else reject(new Error('late old failure'));
      });
      expect(screen.getByText('Replacement chat')).toBeTruthy();
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('does not clear replacement-account busy UI from an old delete finally', async () => {
    let resolveDelete!: () => void;
    jest.mocked(deleteArchivedConversation).mockReturnValueOnce(new Promise<void>((yes) => {
      resolveDelete = yes;
    }));
    mockFetch.mockResolvedValue({
      conversations: [{ id: 'old-chat', title: 'Old chat', updatedAt: '2026-09-27T00:00:00.000Z' }],
      hasMore: false,
      nextOffset: 1,
    });
    const screen = render(<ArchivedChatsScreen />);
    fireEvent.press(await screen.findByLabelText('Delete Old chat'));
    const confirm = alertSpy.mock.calls.at(-1)?.[2]?.find((button) => button.text === 'Delete')?.onPress;
    if (!confirm) throw new Error('Missing delete confirmation');
    act(() => confirm());
    mockFetch.mockResolvedValue({
      conversations: [{ id: 'new-chat', title: 'New chat', updatedAt: '2026-09-27T00:00:00.000Z' }],
      hasMore: false,
      nextOffset: 1,
    });
    activateCloudAccount('account-b');
    mockClerkUserId = 'account-b';
    screen.rerender(<ArchivedChatsScreen />);
    let resolveRestore!: () => void;
    mockRestore.mockReturnValueOnce(new Promise<void>((yes) => { resolveRestore = yes; }));
    fireEvent.press(await screen.findByLabelText('Restore New chat'));
    expect(screen.getByText('Working…')).toBeTruthy();
    await act(async () => { resolveDelete(); });
    expect(screen.getByText('Working…')).toBeTruthy();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    await act(async () => { resolveRestore(); });
  });
});

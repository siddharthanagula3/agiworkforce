/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPost = jest.fn();
const mockPush = jest.fn();
const mockLoadConversations = jest.fn().mockResolvedValue(undefined);

let mockAppMode: 'local' | 'cloud' = 'cloud';
let mockCloudUnlocked = true;

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
  buildLocalDataExportSnapshot: jest.fn(() => ({})),
}));

jest.mock('@/src/features/settings/data-controls/localCloudSyncService', () => ({
  syncLocalConversationsToCloud: jest.fn(),
}));

jest.mock('@/stores/chat/chatMessageStore', () => ({
  useChatMessageStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ loadConversations: mockLoadConversations }),
}));

jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ appMode: mockAppMode }),
}));

jest.mock('@/src/features/waitlist/store', () => ({
  useWaitlistStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ cloudUnlocked: mockCloudUnlocked }),
}));

jest.mock('expo-router', () => ({
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

import DataControlsScreen from '@/src/features/settings/data-controls';
import {
  archiveAllConversations,
  deleteAllArchivedConversations,
  deleteAllConversations,
} from '@/src/features/archived-chats';

type AlertButton = { text?: string; style?: string; onPress?: () => void };

const alertCalls: Array<{ title: string; message?: string; buttons: AlertButton[] }> = [];

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
  alertCalls.length = 0;
  mockAppMode = 'cloud';
  mockCloudUnlocked = true;
  mockPost.mockResolvedValue({ success: true, action: 'archive_all', affectedCount: 3 });
  jest
    .spyOn(Alert, 'alert')
    .mockImplementation((title: string, message?: string, buttons?: AlertButton[]) => {
      alertCalls.push({ title, message, buttons: buttons ?? [] });
    });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Data controls, Chat history bulk actions', () => {
  it('posts action "archive_all" only after both confirmation steps', async () => {
    mockPost.mockResolvedValue({ success: true, action: 'archive_all', affectedCount: 3 });
    const { getByTestId } = render(<DataControlsScreen />);

    fireEvent.press(getByTestId('archive-all-chats-button'));
    expect(mockPost).not.toHaveBeenCalled();

    pressAlertButton('Archive all');
    expect(mockPost).not.toHaveBeenCalled();

    pressAlertButton('Yes, archive all');

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost).toHaveBeenCalledWith('/api/chat/conversations/bulk', {
      action: 'archive_all',
    });
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
    expect(mockPost).toHaveBeenCalledWith('/api/chat/conversations/bulk', { action: 'delete_all' });
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
      expect(alertCalls.some((call) => call.title === 'Could not archive chats')).toBe(true),
    );
    expect(mockLoadConversations).not.toHaveBeenCalled();
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

  it('links to the archived chats screen', () => {
    const { getByText } = render(<DataControlsScreen />);

    fireEvent.press(getByText('Archived chats'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/archived-chats');
  });
});

describe('archived-chats bulk service', () => {
  it('maps each helper to its own action on the shared bulk endpoint', async () => {
    mockPost.mockResolvedValue({ success: true, action: 'archive_all', affectedCount: 2 });
    await expect(archiveAllConversations()).resolves.toBe(2);
    expect(mockPost).toHaveBeenLastCalledWith('/api/chat/conversations/bulk', {
      action: 'archive_all',
    });

    mockPost.mockResolvedValue({ success: true, action: 'delete_all', affectedCount: 4 });
    await expect(deleteAllConversations()).resolves.toBe(4);
    expect(mockPost).toHaveBeenLastCalledWith('/api/chat/conversations/bulk', {
      action: 'delete_all',
    });

    mockPost.mockResolvedValue({ success: true, action: 'delete_archived', affectedCount: 0 });
    await expect(deleteAllArchivedConversations()).resolves.toBe(0);
    expect(mockPost).toHaveBeenLastCalledWith('/api/chat/conversations/bulk', {
      action: 'delete_archived',
    });
  });

  it('rejects a response that does not match the server contract', async () => {
    mockPost.mockResolvedValue({ success: true, action: 'archive_all' });
    await expect(archiveAllConversations()).rejects.toThrow();

    mockPost.mockResolvedValue({ success: false, action: 'delete_all', affectedCount: 1 });
    await expect(deleteAllConversations()).rejects.toThrow();
  });
});

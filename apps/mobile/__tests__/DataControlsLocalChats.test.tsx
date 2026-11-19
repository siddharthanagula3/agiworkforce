/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import DataControlsScreen from '@/src/features/settings/data-controls';
import { useChatMessageStore } from '@/stores/chat/chatMessageStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { getDraft, setDraft } from '@/src/features/chat/draftStore';
import { useMemoryStore } from '@/src/features/memory/store';

const mockPost = jest.fn();
jest.mock('@/services/api', () => ({
  api: {
    get: jest.fn(),
    put: jest.fn(),
    post: (...a: unknown[]) => mockPost(...a),
    delete: jest.fn(),
  },
}));
jest.mock('@/services/dsarExport', () => ({ exportAllUserData: jest.fn() }));
jest.mock('@/src/features/settings/data-controls/localDataSnapshot', () => ({
  LocalExportAuthorityError: class LocalExportAuthorityError extends Error {},
  buildLocalDataExportSnapshot: jest.fn(() => ({})),
}));
jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(() => callback(), [callback]);
  },
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

type AlertButton = { text?: string; onPress?: () => void };
const alerts: Array<{ title: string; message?: string; buttons: AlertButton[] }> = [];

function conversation(id: string, executionMode: 'local' | 'cloud') {
  return {
    id,
    title: id,
    updatedAt: new Date().toISOString(),
    messageCount: 1,
    model: 'm',
    provider: executionMode === 'cloud' ? 'cloud_managed' : 'local',
    executionMode,
  };
}

const message = (id: string) => ({ id, role: 'user', content: 'hello', timestamp: 1 });

beforeEach(() => {
  alerts.length = 0;
  jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
    alerts.push({ title, message, buttons: (buttons ?? []) as AlertButton[] });
  });
  useChatAppModeStore.setState({ appMode: 'local' });
  useChatMessageStore.setState({
    conversations: [
      conversation('l1', 'local'),
      conversation('l2', 'local'),
      conversation('c1', 'cloud'),
    ],
    messages: { l1: [message('a')], l2: [message('b')], c1: [message('c')] },
    currentConversationId: 'l1',
  } as never);
  setDraft('l1', 'half typed', { scope: 'local' });
});

afterEach(() => jest.restoreAllMocks());

function press(text: string) {
  const button = alerts.at(-1)?.buttons.find((b) => b.text === text);
  if (!button) throw new Error(`No button ${text}`);
  act(() => button.onPress?.());
}

describe('Data controls, Delete all chats in Local mode', () => {
  it('asks first, naming what is removed and what stays', () => {
    const screen = render(<DataControlsScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Delete all local chats' }));
    const ask = alerts.at(-1)!;
    expect(ask.title).toBe('Delete all local chats?');
    expect(ask.message).toContain('Memory, settings, projects and downloaded models stay');
    expect(ask.message).toContain('cannot be undone');
    expect(useChatMessageStore.getState().conversations).toHaveLength(3);
  });

  it('keeps everything when cancelled', () => {
    const screen = render(<DataControlsScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Delete all local chats' }));
    press('Cancel');
    expect(useChatMessageStore.getState().conversations).toHaveLength(3);
  });

  it('deletes every local chat, its messages and draft, and leaves cloud chats and memory alone', async () => {
    const memoryBefore = useMemoryStore.getState().entries;
    const screen = render(<DataControlsScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Delete all local chats' }));
    press('Delete all');
    await waitFor(() => expect(alerts.at(-1)?.title).toBe('Chats deleted'));
    const state = useChatMessageStore.getState();
    expect(state.conversations.map((c) => c.id)).toEqual(['c1']);
    expect(Object.keys(state.messages)).toEqual(['c1']);
    expect(state.currentConversationId).toBeNull();
    expect(getDraft('l1', { scope: 'local' })).toBe('');
    expect(useMemoryStore.getState().entries).toBe(memoryBefore);
    expect(mockPost).not.toHaveBeenCalled();
    expect(alerts.at(-1)?.message).toBe('2 chats deleted from this device.');
  });

  it('says so when there is nothing to delete', () => {
    useChatMessageStore.setState({ conversations: [], messages: {} } as never);
    const screen = render(<DataControlsScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Delete all local chats' }));
    expect(alerts.at(-1)?.title).toBe('No local chats');
  });

  it('is not offered in Cloud mode', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const screen = render(<DataControlsScreen />);
    expect(screen.queryByRole('button', { name: 'Delete all local chats' })).toBeNull();
  });
});

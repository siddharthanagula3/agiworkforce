jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));
jest.mock('../services/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../services/managedCloudChat', () => ({
  managedCloudChat: {
    listConversations: jest.fn(),
    createConversation: jest.fn(),
    getConversation: jest.fn(),
    updateConversation: jest.fn(),
    deleteConversation: jest.fn(),
  },
}));

import { Alert } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useConversationActions } from '../src/features/conversation-actions/useConversationActions';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useTierStore } from '../src/features/billing/store';
import { requireLocalModel } from '../test-utils/modelFixtures';

const T = '2026-06-20T00:00:00.000Z';
const LOCAL_MODEL_ID = requireLocalModel().id;

beforeEach(() => {
  jest.clearAllMocks();
  useChatCloudMessageStore.getState().clearCloudData();
  useChatMessageStore.setState({ conversations: [], messages: {}, currentConversationId: null });
  useChatAppModeStore.getState().setAppMode('cloud');
  useWaitlistStore.setState({ cloudUnlocked: true });
  useTierStore.setState({ tier: 'max', billingTier: 'max' });
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined as never);
});

function seedCloudRow(id: string): void {
  useChatCloudMessageStore.getState().addCloudConversation({
    id,
    title: `Chat ${id}`,
    createdAt: T,
    updatedAt: T,
    messageCount: 0,
    pinned: false,
  });
}

function seedLocalRow(id: string): void {
  useChatMessageStore.setState({
    conversations: [
      {
        id,
        title: `Chat ${id}`,
        createdAt: T,
        updatedAt: T,
        messageCount: 0,
        pinned: false,
        model: LOCAL_MODEL_ID,
        provider: 'local',
        executionMode: 'local',
      },
    ],
    messages: { [id]: [] },
  });
}

describe('conversation row actions reach every action on both platforms', () => {
  it('offers rename, pin, archive and delete for a Cloud chat without an Alert menu', () => {
    seedCloudRow('c-1');
    const { result } = renderHook(() => useConversationActions());

    act(() => result.current.openActions('c-1', 'Chat c-1', false));

    const menu = result.current.rename.menu;
    expect(menu.visible).toBe(true);
    expect(menu.actions.map((action) => action.key)).toEqual([
      'rename',
      'pin',
      'archive',
      'delete',
    ]);
    expect(menu.actions.find((action) => action.key === 'delete')?.destructive).toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('omits archive for a Local chat, which has no archived set', () => {
    useChatAppModeStore.getState().setAppMode('local');
    seedLocalRow('l-1');
    const { result } = renderHook(() => useConversationActions());

    act(() => result.current.openActions('l-1', 'Chat l-1', false));

    expect(result.current.rename.menu.actions.map((action) => action.key)).toEqual([
      'rename',
      'pin',
      'delete',
    ]);
  });

  it('confirms before deleting rather than deleting on the first tap', () => {
    seedCloudRow('c-1');
    const { result } = renderHook(() => useConversationActions());

    act(() => result.current.openActions('c-1', 'Chat c-1', false));
    const deleteAction = result.current.rename.menu.actions.find(
      (action) => action.key === 'delete',
    );
    act(() => deleteAction?.run());

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as Array<{ text: string }>;
    expect(buttons.map((button) => button.text)).toEqual(['Cancel', 'Delete']);
  });

  it('closes the menu when dismissed', () => {
    seedCloudRow('c-1');
    const { result } = renderHook(() => useConversationActions());

    act(() => result.current.openActions('c-1', 'Chat c-1', false));
    act(() => result.current.rename.menu.close());

    expect(result.current.rename.menu.visible).toBe(false);
  });
});

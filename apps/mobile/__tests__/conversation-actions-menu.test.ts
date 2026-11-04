const mockMmkvValues = new Map<string, string>();
jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  storage: {
    getString: (key: string) => mockMmkvValues.get(key),
    set: (key: string, value: string) => mockMmkvValues.set(key, value),
    delete: (key: string) => mockMmkvValues.delete(key),
  },
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

const mockShowToast = jest.fn();
jest.mock('../src/shared/components/Toast', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

import { Alert } from 'react-native';
import { api } from '../services/api';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useConversationActions } from '../src/features/conversation-actions/useConversationActions';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useTierStore } from '../src/features/billing/store';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import { requireLocalModel } from '../test-utils/modelFixtures';

const T = '2026-06-20T00:00:00.000Z';
const LOCAL_MODEL_ID = requireLocalModel().id;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(api.put).mockReset();
  mockMmkvValues.clear();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('conversation-actions-test-account');
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
      'share',
      'rename',
      'pin',
      'duplicate',
      'unread',
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
      'duplicate',
      'unread',
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
  it("adds a caller's extra actions and reports a confirmed delete to the caller", () => {
    seedCloudRow('c-1');
    const { result } = renderHook(() => useConversationActions());
    const extraRun = jest.fn();
    const onDeleted = jest.fn();

    act(() =>
      result.current.openActions('c-1', 'Chat c-1', false, {
        extraActions: [{ key: 'export', label: 'Export', run: extraRun }],
        onDeleted,
      }),
    );

    const actions = result.current.rename.menu.actions;
    expect(actions.map((action) => action.key)).toContain('export');
    expect(actions.map((action) => action.key).indexOf('export')).toBeGreaterThan(
      actions.map((action) => action.key).indexOf('pin'),
    );
    act(() => actions.find((action) => action.key === 'export')?.run());
    expect(extraRun).toHaveBeenCalledTimes(1);

    act(() => actions.find((action) => action.key === 'delete')?.run());
    expect(onDeleted).not.toHaveBeenCalled();
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    act(() => buttons.find((button) => button.text === 'Delete')?.onPress?.());
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it('labels the pin action Unpin for a pinned chat', () => {
    seedCloudRow('c-1');
    const { result } = renderHook(() => useConversationActions());

    act(() => result.current.openActions('c-1', 'Chat c-1', true));

    expect(result.current.rename.menu.actions.find((action) => action.key === 'pin')?.label).toBe(
      'Unpin',
    );
  });
});


function archivedWire(archived: boolean) {
  return { conversation: {
    id: 'c-1', title: 'Chat c-1', model: null, project_id: null,
    pinned: false, starred: false, archived, is_temporary: false,
    created_at: T, updated_at: T,
  } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function archiveAndReadUndo() {
  seedCloudRow('c-1');
  jest.mocked(api.put).mockResolvedValueOnce(archivedWire(true));
  const view = renderHook(() => useConversationActions());
  act(() => view.result.current.openActions('c-1', 'Chat c-1', false));
  act(() => view.result.current.rename.menu.actions.find((action) => action.key === 'archive')?.run());
  await waitFor(() => expect(mockShowToast).toHaveBeenCalledTimes(1));
  const undo = mockShowToast.mock.calls[0]?.[1]?.onPress as (() => void) | undefined;
  if (!undo) throw new Error('Archive did not provide Undo');
  return undo;
}

describe('archive Undo retains the original account intent', () => {
  it('does not dispatch a saved Undo after an account round trip', async () => {
    const undo = await archiveAndReadUndo();
    act(() => {
      activateCloudAccount('replacement-account');
      activateCloudAccount('conversation-actions-test-account');
      undo();
    });
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('admits one Undo with the original account and restores its row', async () => {
    const undo = await archiveAndReadUndo();
    const restore = deferred<ReturnType<typeof archivedWire>>();
    jest.mocked(api.put).mockReturnValueOnce(restore.promise);
    act(() => { undo(); undo(); });
    expect(api.put).toHaveBeenCalledTimes(2);
    const originalAccount = jest.mocked(api.put).mock.calls[0]?.[2]?.accountEpoch;
    expect(api.put).toHaveBeenLastCalledWith('/api/chat/conversations/c-1',
      { archived: false }, { accountEpoch: originalAccount });
    await act(async () => { restore.resolve(archivedWire(false)); });
    expect(useChatCloudMessageStore.getState().conversations.find((row) => row.id === 'c-1'))
      .toMatchObject({ id: 'c-1', pinned: false });
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('reports an uncertain Undo without claiming the chat remains archived', async () => {
    const undo = await archiveAndReadUndo();
    jest.mocked(api.put).mockRejectedValueOnce(new Error('response lost'));
    await act(async () => { undo(); });
    expect(Alert.alert).toHaveBeenCalledWith('Could not unarchive',
      'Could not confirm the restore. Refresh your chats and Archived chats to check.');
    act(() => undo());
    expect(api.put).toHaveBeenCalledTimes(2);
  });

  it.each(['resolve', 'reject'] as const)('ignores a late Undo %s after account replacement', async (outcome) => {
    const undo = await archiveAndReadUndo();
    const restore = deferred<ReturnType<typeof archivedWire>>();
    jest.mocked(api.put).mockReturnValueOnce(restore.promise);
    act(() => undo());
    act(() => {
      activateCloudAccount('replacement-account');
      useChatCloudMessageStore.getState().clearCloudData();
      seedCloudRow('replacement-row');
    });
    await act(async () => {
      if (outcome === 'resolve') restore.resolve(archivedWire(false));
      else restore.reject(new Error('late old failure'));
    });
    expect(useChatCloudMessageStore.getState().conversations.map((row) => row.id))
      .toEqual(['replacement-row']);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('suppresses a late original archive failure after account replacement', async () => {
    seedCloudRow('c-1');
    const archive = deferred<ReturnType<typeof archivedWire>>();
    jest.mocked(api.put).mockReturnValueOnce(archive.promise);
    const view = renderHook(() => useConversationActions());
    act(() => view.result.current.openActions('c-1', 'Chat c-1', false));
    act(() => view.result.current.rename.menu.actions.find((action) => action.key === 'archive')?.run());
    activateCloudAccount('replacement-account');
    await act(async () => { archive.reject(new Error('late old failure')); });
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockShowToast).not.toHaveBeenCalled();
  });
});

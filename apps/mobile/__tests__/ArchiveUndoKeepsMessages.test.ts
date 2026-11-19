jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
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
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { api } from '../services/api';
import { managedCloudChat } from '../services/managedCloudChat';
import { useConversationActions } from '../src/features/conversation-actions/useConversationActions';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useChatExecutionStore } from '../stores/chat/chatExecutionStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useTierStore } from '../src/features/billing/store';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import type { ChatMessage, ConversationSummary } from '../types/chat';

const STAMP = '2026-11-15T09:00:00.000Z';
const CHAT_ID = 'chat-archived';

const summary: ConversationSummary = {
  id: CHAT_ID,
  title: 'Trip plan',
  createdAt: STAMP,
  updatedAt: STAMP,
  messageCount: 2,
  pinned: false,
};

const transcript: ChatMessage[] = [
  {
    id: 'question-1',
    conversationId: CHAT_ID,
    role: 'user',
    content: 'Plan a trip',
    createdAt: STAMP,
  },
  {
    id: 'answer-1',
    conversationId: CHAT_ID,
    role: 'assistant',
    content: 'Here is a plan',
    createdAt: STAMP,
    parentId: 'question-1',
  },
];

function wire(archived: boolean) {
  return {
    conversation: {
      id: CHAT_ID,
      title: summary.title,
      model: null,
      project_id: null,
      pinned: false,
      starred: false,
      archived,
      is_temporary: false,
      created_at: STAMP,
      updated_at: STAMP,
    },
  };
}

function serverPage() {
  return {
    conversation: {
      id: CHAT_ID,
      title: summary.title,
      projectId: null,
      pinned: false,
      starred: false,
      archived: false,
      isTemporary: false,
      activeLeafMessageId: 'answer-1',
      createdAt: STAMP,
      updatedAt: STAMP,
    },
    messages: transcript,
    total: transcript.length,
    hasMore: false,
  };
}

async function archiveThenUndo(beforeUndo?: () => void) {
  jest.mocked(api.put).mockResolvedValueOnce(wire(true)).mockResolvedValueOnce(wire(false));
  const view = renderHook(() => useConversationActions());
  act(() => view.result.current.openActions(CHAT_ID, summary.title));
  const archive = view.result.current.rename.menu.actions.find(
    (action) => action.key === 'archive',
  );
  act(() => archive?.run());
  await waitFor(() => expect(mockShowToast).toHaveBeenCalledTimes(1));
  expect(useChatCloudMessageStore.getState().conversations).toEqual([]);
  beforeUndo?.();
  const undo = mockShowToast.mock.calls[0][1].onPress as () => void;
  await act(async () => {
    undo();
  });
  await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('archive-undo-account');
  useChatCloudMessageStore.getState().clearCloudData();
  useChatMessageStore.setState({ conversations: [], messages: {}, currentConversationId: null });
  useChatExecutionStore.setState({ streamingConversationIds: [] });
  useChatAppModeStore.getState().setAppMode('cloud');
  useWaitlistStore.setState({ cloudUnlocked: true });
  useTierStore.setState({ tier: 'max', billingTier: 'max' });
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Undo after archiving a Cloud chat', () => {
  it('puts back the messages the phone already had, without asking the server again', async () => {
    useChatCloudMessageStore.getState().addCloudConversation(summary);
    useChatCloudMessageStore.getState().setCloudMessages(CHAT_ID, transcript);

    await archiveThenUndo();

    await waitFor(() =>
      expect(useChatCloudMessageStore.getState().messages[CHAT_ID]).toEqual(transcript),
    );
    expect(useChatCloudMessageStore.getState().conversations.map((c) => c.id)).toEqual([CHAT_ID]);
    expect(managedCloudChat.getConversation).not.toHaveBeenCalled();
  });

  it('fetches the messages when the phone had not loaded them before archiving', async () => {
    useChatCloudMessageStore.getState().setCloudConversations([summary]);
    expect(useChatCloudMessageStore.getState().messages[CHAT_ID]).toBeUndefined();
    jest.mocked(managedCloudChat.getConversation).mockResolvedValueOnce(serverPage() as never);

    await archiveThenUndo();

    await waitFor(() =>
      expect(
        useChatCloudMessageStore
          .getState()
          .messages[CHAT_ID]?.map((message) => message.id)
          .sort(),
      ).toEqual(['answer-1', 'question-1']),
    );
    expect(managedCloudChat.getConversation).toHaveBeenCalledWith(CHAT_ID, expect.anything());
  });

  it('puts back the messages when a chat list refresh already brought the row back', async () => {
    useChatCloudMessageStore.getState().addCloudConversation(summary);
    useChatCloudMessageStore.getState().setCloudMessages(CHAT_ID, transcript);

    await archiveThenUndo(() => {
      useChatCloudMessageStore.getState().setCloudConversations([summary]);
    });

    await waitFor(() =>
      expect(useChatCloudMessageStore.getState().messages[CHAT_ID]).toEqual(transcript),
    );
    expect(managedCloudChat.getConversation).not.toHaveBeenCalled();
  });

  it('fetches the finished answer when it was still being written at archive time', async () => {
    useChatCloudMessageStore.getState().addCloudConversation(summary);
    useChatCloudMessageStore
      .getState()
      .setCloudMessages(CHAT_ID, [transcript[0], { ...transcript[1], isStreaming: true }]);
    useChatExecutionStore.setState({ streamingConversationIds: [CHAT_ID] });
    jest.mocked(managedCloudChat.getConversation).mockResolvedValueOnce(serverPage() as never);

    await archiveThenUndo(() => {
      useChatExecutionStore.setState({ streamingConversationIds: [] });
    });

    await waitFor(() => expect(managedCloudChat.getConversation).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        useChatCloudMessageStore
          .getState()
          .messages[CHAT_ID]?.find((message) => message.id === 'answer-1')?.isStreaming,
      ).toBeFalsy(),
    );
    expect(useChatCloudMessageStore.getState().messages[CHAT_ID]).toHaveLength(2);
  });

  it('keeps the answer being written when the stream is still running at Undo', async () => {
    const writing: ChatMessage[] = [transcript[0], { ...transcript[1], isStreaming: true }];
    useChatCloudMessageStore.getState().addCloudConversation(summary);
    useChatCloudMessageStore.getState().setCloudMessages(CHAT_ID, writing);
    useChatExecutionStore.setState({ streamingConversationIds: [CHAT_ID] });

    await archiveThenUndo();

    await waitFor(() =>
      expect(useChatCloudMessageStore.getState().messages[CHAT_ID]).toEqual(writing),
    );
    expect(managedCloudChat.getConversation).not.toHaveBeenCalled();
  });
});

describe('Archive from the open chat', () => {
  function archiveWith(onArchived: () => void) {
    const view = renderHook(() => useConversationActions());
    act(() => view.result.current.openActions(CHAT_ID, summary.title, { onArchived }));
    const archive = view.result.current.rename.menu.actions.find(
      (action) => action.key === 'archive',
    );
    act(() => archive?.run());
  }

  it('leaves the chat once the server has archived it', async () => {
    useChatCloudMessageStore.getState().addCloudConversation(summary);
    jest.mocked(api.put).mockResolvedValueOnce(wire(true));
    const onArchived = jest.fn(() => {
      expect(useChatCloudMessageStore.getState().conversations).toEqual([]);
    });

    archiveWith(onArchived);

    await waitFor(() => expect(onArchived).toHaveBeenCalledTimes(1));
    expect(mockShowToast).toHaveBeenCalledWith(
      'Chat archived. Find it in Settings, Archived chats.',
      expect.objectContaining({ label: 'Undo' }),
    );
  });

  it('stays on the chat when the archive did not go through', async () => {
    useChatCloudMessageStore.getState().addCloudConversation(summary);
    jest.mocked(api.put).mockRejectedValueOnce(new Error('offline'));
    const onArchived = jest.fn();

    archiveWith(onArchived);

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Could not archive',
        'Check your connection and try again.',
      ),
    );
    expect(onArchived).not.toHaveBeenCalled();
    expect(useChatCloudMessageStore.getState().conversations.map((c) => c.id)).toEqual([CHAT_ID]);
  });
});

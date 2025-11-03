import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { useChatStore } from '../chatStore';
import type { Conversation, ConversationStats, Message, ConversationUI, MessageUI } from '../../types/chat';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

type TauriInvoke = typeof import('@tauri-apps/api/core')['invoke'];
type InvokeMock = Mock<Parameters<TauriInvoke>, ReturnType<TauriInvoke>>;

let invokeMock: InvokeMock;

async function getInvokeMock(): Promise<InvokeMock> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke as InvokeMock;
}

function iso(date: string): string {
  return new Date(date).toISOString();
}

function buildConversationUI(
  id: number,
  title: string,
  updatedAtIso: string,
  lastMessage: string,
  pinned = false
): ConversationUI {
  return {
    id,
    title,
    created_at: updatedAtIso,
    updated_at: updatedAtIso,
    updatedAt: new Date(updatedAtIso),
    lastMessage,
    messageCount: 0,
    pinned,
  };
}

beforeEach(async () => {
  const { reset } = useChatStore.getState();
  reset();
  window.localStorage.removeItem('agiworkforce-chat');
  invokeMock = await getInvokeMock();
  invokeMock.mockReset();
});

describe('useChatStore pinned conversations', () => {
  it('applies pinned state and filters invalid ids when loading conversations', async () => {
    const backendConversations: Conversation[] = [
      {
        id: 1,
        title: 'Pinned conversation',
        created_at: iso('2024-01-01T08:00:00Z'),
        updated_at: iso('2024-01-02T09:00:00Z'),
      },
      {
        id: 2,
        title: 'Secondary conversation',
        created_at: iso('2024-01-03T08:00:00Z'),
        updated_at: iso('2024-01-04T10:00:00Z'),
      },
    ];

    const statsById: Record<number, ConversationStats> = {
      1: { message_count: 3, total_tokens: 120, total_cost: 0.25 },
      2: { message_count: 1, total_tokens: 40, total_cost: 0.08 },
    };

    const messagesById: Record<number, Message[]> = {
      1: [
        {
          id: 11,
          conversation_id: 1,
          role: 'assistant',
          content: 'Pinned final reply',
          created_at: iso('2024-01-02T09:00:00Z'),
        },
      ],
      2: [
        {
          id: 21,
          conversation_id: 2,
          role: 'assistant',
          content: 'Secondary reply',
          created_at: iso('2024-01-04T10:00:00Z'),
        },
      ],
    };

    invokeMock.mockImplementation((command, args) => {
      switch (command) {
        case 'chat_get_conversations':
          return Promise.resolve(backendConversations);
        case 'chat_get_conversation_stats':
          return Promise.resolve(statsById[(args as { conversationId: number }).conversationId]);
        case 'chat_get_messages':
          return Promise.resolve(messagesById[(args as { conversationId: number }).conversationId]);
        default:
          return Promise.resolve(undefined);
      }
    });

    useChatStore.setState({ pinnedConversations: [1, 99] });

    await useChatStore.getState().loadConversations();

    const state = useChatStore.getState();
    expect(state.conversations).toHaveLength(2);
    const [firstConversation, secondConversation] = state.conversations;
    expect(firstConversation).toBeDefined();
    expect(secondConversation).toBeDefined();
    expect(firstConversation!.id).toBe(1);
    expect(firstConversation!.pinned).toBe(true);
    expect(secondConversation!.pinned).toBe(false);
    expect(state.pinnedConversations).toEqual([1]);
    expect(firstConversation!.lastMessage).toBe('Pinned final reply');
  });

  it('toggles pinned conversations and persists identifiers', async () => {
    const first = buildConversationUI(1, 'Alpha', iso('2024-01-02T10:00:00Z'), 'Alpha last');
    const second = buildConversationUI(2, 'Bravo', iso('2024-01-03T12:00:00Z'), 'Bravo last');

    useChatStore.setState({
      conversations: [second, first],
      pinnedConversations: [],
    });

    await useChatStore.getState().togglePinnedConversation(1);

    let state = useChatStore.getState();
    expect(state.pinnedConversations).toEqual([1]);
    const pinnedConversation = state.conversations[0];
    expect(pinnedConversation).toBeDefined();
    expect(pinnedConversation!.id).toBe(1);
    expect(pinnedConversation!.pinned).toBe(true);

    const persistedAfterPin = JSON.parse(window.localStorage.getItem('agiworkforce-chat') ?? '{}');
    expect(persistedAfterPin?.state?.pinnedConversations).toEqual([1]);

    await useChatStore.getState().togglePinnedConversation(1);

    state = useChatStore.getState();
    expect(state.pinnedConversations).toEqual([]);
    const firstConversationAfterUnpin = state.conversations[0];
    expect(firstConversationAfterUnpin).toBeDefined();
    expect(firstConversationAfterUnpin!.id).toBe(2);
    expect(state.conversations.find((conversation) => conversation.id === 1)?.pinned).toBeFalsy();

    const persistedAfterUnpin = JSON.parse(window.localStorage.getItem('agiworkforce-chat') ?? '{}');
    expect(persistedAfterUnpin?.state?.pinnedConversations).toEqual([]);
  });
});

describe('useChatStore conversation management', () => {
  it('renames conversations with trimmed titles and updates state', async () => {
    const conversation = buildConversationUI(5, 'Old name', iso('2024-01-05T09:00:00Z'), 'Last message');
    useChatStore.setState({ conversations: [conversation] });

    invokeMock.mockImplementation((command, args) => {
      if (command === 'chat_update_conversation') {
        expect(args).toEqual({ id: 5, request: { title: 'New name' } });
        return Promise.resolve(undefined);
      }
      return Promise.resolve(undefined);
    });

    await useChatStore.getState().renameConversation(5, '  New name  ');

    const state = useChatStore.getState();
    const renamedConversation = state.conversations[0];
    expect(renamedConversation).toBeDefined();
    expect(renamedConversation!.title).toBe('New name');
    expect(invokeMock).toHaveBeenCalledWith('chat_update_conversation', {
      id: 5,
      request: { title: 'New name' },
    });
  });

  it('rejects rename when trimmed title is empty', async () => {
    await expect(useChatStore.getState().renameConversation(1, '   ')).rejects.toThrow(
      'Title cannot be empty'
    );
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe('useChatStore message editing and deletion', () => {
  it('edits a message and updates conversation metadata', async () => {
    const createdAt = iso('2024-01-10T09:15:00Z');

    useChatStore.setState({
      conversations: [
        {
          id: 7,
          title: 'Daily sync',
          created_at: createdAt,
          updated_at: createdAt,
          updatedAt: new Date(createdAt),
          lastMessage: 'Original content',
          messageCount: 1,
        } as ConversationUI,
      ],
      messages: [
        {
          id: 42,
          conversation_id: 7,
          role: 'user',
          content: 'Original content',
          created_at: createdAt,
          timestamp: new Date(createdAt),
        } as MessageUI,
      ],
      activeConversationId: 7,
    });

    invokeMock.mockImplementation((command, args) => {
      if (command === 'chat_update_message') {
        expect(args).toEqual({ id: 42, content: 'Edited content' });
        return Promise.resolve({
          id: 42,
          conversation_id: 7,
          role: 'user',
          content: 'Edited content',
          created_at: createdAt,
        });
      }
      return Promise.resolve(undefined);
    });

    await useChatStore.getState().editMessage(42, '  Edited content  ');

    const state = useChatStore.getState();
    expect(state.messages[0]?.content).toBe('Edited content');
    expect(state.conversations[0]?.lastMessage).toBe('Edited content');
  });

  it('deletes a message and re-computes local state', async () => {
    const firstTimestamp = iso('2024-01-11T08:00:00Z');
    const secondTimestamp = iso('2024-01-11T08:05:00Z');

    useChatStore.setState({
      conversations: [
        {
          id: 4,
          title: 'Standup',
          created_at: firstTimestamp,
          updated_at: secondTimestamp,
          updatedAt: new Date(secondTimestamp),
          lastMessage: 'Second reply',
          messageCount: 2,
        } as ConversationUI,
      ],
      messages: [
        {
          id: 100,
          conversation_id: 4,
          role: 'user',
          content: 'First message',
          created_at: firstTimestamp,
          timestamp: new Date(firstTimestamp),
        } as MessageUI,
        {
          id: 101,
          conversation_id: 4,
          role: 'assistant',
          content: 'Second reply',
          created_at: secondTimestamp,
          timestamp: new Date(secondTimestamp),
        } as MessageUI,
      ],
      activeConversationId: 4,
    });

    invokeMock.mockImplementation((command, args) => {
      if (command === 'chat_delete_message') {
        expect(args).toEqual({ id: 101 });
        return Promise.resolve(undefined);
      }
      return Promise.resolve(undefined);
    });

    await useChatStore.getState().deleteMessage(101);

    const state = useChatStore.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.content).toBe('First message');
    expect(state.conversations[0]?.messageCount).toBe(1);
    expect(state.conversations[0]?.lastMessage).toBe('First message');
  });
});

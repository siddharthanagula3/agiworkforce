import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import {
  isThreadingCapableConversation,
  visibleThreadFor,
} from '../src/features/chat/utils/conversationThread';
import type { ChatMessage, ConversationSummary } from '../types/chat';

const CONVERSATION_ID = '0190a000-0000-7000-8000-0000000000a1';

function row(id: string, parentId?: string | null, createdAt = '2026-06-01T00:00:00.000Z') {
  return {
    id,
    conversationId: CONVERSATION_ID,
    role: 'assistant' as const,
    content: `content-${id}`,
    createdAt,
    ...(parentId === undefined ? {} : { parentId }),
  } satisfies ChatMessage;
}

function conversation(patch: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: CONVERSATION_ID,
    title: 'Chat',
    updatedAt: '2026-06-01T00:00:00.000Z',
    createdAt: '2026-06-01T00:00:00.000Z',
    messageCount: 0,
    pinned: false,
    executionMode: 'cloud',
    ...patch,
  };
}

describe('isThreadingCapableConversation', () => {
  it('reads an absent active leaf as a pre-threading server', () => {
    expect(isThreadingCapableConversation(conversation())).toBe(false);
    expect(isThreadingCapableConversation(undefined)).toBe(false);
  });

  it('reads a null active leaf as a threading server that has not branched', () => {
    expect(isThreadingCapableConversation(conversation({ activeLeafMessageId: null }))).toBe(true);
  });

  it('reads a leaf id as a threading server', () => {
    expect(isThreadingCapableConversation(conversation({ activeLeafMessageId: 'm1' }))).toBe(true);
  });
});

describe('visibleThreadFor', () => {
  it('returns the stored array itself when the conversation has never branched', () => {
    const rows = [row('m1'), row('m2')];

    expect(visibleThreadFor(rows, conversation())).toBe(rows);
    expect(visibleThreadFor(rows, conversation({ activeLeafMessageId: null }))).toBe(rows);
  });

  it('returns the stored array itself for a legacy all-parentless transcript', () => {
    const rows = [row('m1'), row('m2'), row('m3')];

    expect(visibleThreadFor(rows, undefined)).toBe(rows);
  });

  it('hides the abandoned sibling and keeps the active path in root-first order', () => {
    const rows = [
      row('u1', null, '2026-06-01T00:00:00.000Z'),
      row('a1', 'u1', '2026-06-01T00:00:01.000Z'),
      row('a2', 'u1', '2026-06-01T00:00:02.000Z'),
    ];

    const visible = visibleThreadFor(rows, conversation({ activeLeafMessageId: 'a2' }));

    expect(visible.map((message) => message.id)).toEqual(['u1', 'a2']);
  });

  it('keeps every row on the path the leaf names when the tree is deeper than one branch', () => {
    const rows = [
      row('u1', null, '2026-06-01T00:00:00.000Z'),
      row('a1', 'u1', '2026-06-01T00:00:01.000Z'),
      row('u2', 'a1', '2026-06-01T00:00:02.000Z'),
      row('a2', 'u2', '2026-06-01T00:00:03.000Z'),
      row('u3', 'a1', '2026-06-01T00:00:04.000Z'),
    ];

    expect(
      visibleThreadFor(rows, conversation({ activeLeafMessageId: 'a2' })).map((m) => m.id),
    ).toEqual(['u1', 'a1', 'u2', 'a2']);
  });
});

describe('setCloudConversations', () => {
  beforeEach(() => {
    useChatCloudMessageStore.getState().clearCloudData();
  });

  it('keeps a leaf learned from the conversation detail when the list payload omits it', () => {
    useChatCloudMessageStore
      .getState()
      .setCloudConversations([conversation({ activeLeafMessageId: 'a2' })]);

    useChatCloudMessageStore.getState().setCloudConversations([conversation()]);

    expect(useChatCloudMessageStore.getState().conversations[0]?.activeLeafMessageId).toBe('a2');
  });

  it('lets an explicit null from the server clear a stale leaf', () => {
    useChatCloudMessageStore
      .getState()
      .setCloudConversations([conversation({ activeLeafMessageId: 'a2' })]);

    useChatCloudMessageStore
      .getState()
      .setCloudConversations([conversation({ activeLeafMessageId: null })]);

    expect(useChatCloudMessageStore.getState().conversations[0]?.activeLeafMessageId).toBeNull();
  });
});

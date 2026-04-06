import { beforeEach, describe, expect, it } from 'vitest';
import { normalizeHostConversation } from '../../lib/hostBridge';
import { useChatStore } from '../../stores/chatStore';
import { syncPackageStoreFromHost } from '../useHostBridgeSync';

function resetStore() {
  useChatStore.setState({
    conversations: [],
    messagesByConversation: {},
    activeConversationId: null,
    isStreaming: false,
    streamingContent: '',
    streamingReasoning: '',
    searchQuery: '',
    searchResults: [],
    draftContent: '',
    activeMode: null,
    webSearchEnabled: false,
  });
}

describe('host bridge conversation normalization', () => {
  it('normalizes Date-backed host conversations into ISO chat conversations', () => {
    const createdAt = new Date('2026-04-01T10:00:00.000Z');
    const updatedAt = new Date('2026-04-02T11:30:00.000Z');

    expect(
      normalizeHostConversation({
        id: 'conv-1',
        title: 'Bridge Conversation',
        createdAt,
        updatedAt,
        pinned: true,
      }),
    ).toEqual({
      id: 'conv-1',
      title: 'Bridge Conversation',
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      pinned: true,
      archived: false,
      model: undefined,
      provider: undefined,
      messageCount: undefined,
      lastMessage: undefined,
    });
  });
});

describe('syncPackageStoreFromHost', () => {
  beforeEach(resetStore);

  it('hydrates package conversations and active conversation from the host bridge', () => {
    syncPackageStoreFromHost({
      getSnapshot: () => ({
        activeConversationId: 'conv-2',
        conversations: [
          {
            id: 'conv-1',
            title: 'First',
            updatedAt: '2026-04-01T10:00:00.000Z',
          },
          {
            id: 'conv-2',
            title: 'Second',
            createdAt: '2026-04-02T10:00:00.000Z',
            updatedAt: '2026-04-03T10:00:00.000Z',
            archived: true,
          },
        ],
      }),
    });

    const state = useChatStore.getState();
    expect(state.activeConversationId).toBe('conv-2');
    expect(state.conversations.map((conversation) => conversation.id)).toEqual([
      'conv-1',
      'conv-2',
    ]);
    expect(state.conversations[0]?.createdAt).toBe('2026-04-01T10:00:00.000Z');
    expect(state.conversations[1]?.archived).toBe(true);
  });
});

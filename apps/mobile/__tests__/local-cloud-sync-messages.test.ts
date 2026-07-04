/**
 * Local→Cloud sync — message body regression test.
 *
 * Previously syncLocalConversationsToCloud() only POSTed the conversation
 * shell (title/metadata) and never sent message bodies, while still
 * reporting the conversation+messages as successfully synced. This test
 * asserts the server actually receives message content via the bulk
 * messages endpoint, and that success is only reported once accepted.
 */

jest.mock('../services/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

import { api } from '../services/api';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { syncLocalConversationsToCloud } from '../src/features/settings/data-controls/localCloudSyncService';
import type { ChatMessage, ConversationSummary } from '../types/chat';

const mockPost = api.post as jest.MockedFunction<typeof api.post>;

const CONVERSATION_ID = 'local-conv-1';

const conversation: ConversationSummary = {
  id: CONVERSATION_ID,
  title: 'Local chat',
  updatedAt: '2026-06-01T00:00:00.000Z',
  createdAt: '2026-06-01T00:00:00.000Z',
  messageCount: 2,
  pinned: false,
  executionMode: 'local',
};

const localMessages: ChatMessage[] = [
  { id: 'm1', role: 'user', content: 'Hello there' } as ChatMessage,
  { id: 'm2', role: 'assistant', content: 'Hi! How can I help?', model: 'gpt-5.4' } as ChatMessage,
];

function seedLocalStore() {
  useChatMessageStore.setState({
    conversations: [conversation],
    messages: { [CONVERSATION_ID]: localMessages },
  });
}

describe('syncLocalConversationsToCloud', () => {
  beforeEach(() => {
    mockPost.mockReset();
    seedLocalStore();
  });

  it('sends message bodies to the bulk endpoint, not just the conversation shell', async () => {
    mockPost.mockImplementation(async (path: string) => {
      if (path === '/api/chat/conversations') {
        return { conversation: { id: 'server-conv-1' } };
      }
      if (path === '/api/chat/conversations/server-conv-1/messages/bulk') {
        return { saved: 2 };
      }
      throw new Error(`Unexpected path: ${path}`);
    });

    const result = await syncLocalConversationsToCloud();

    const bulkCall = mockPost.mock.calls.find(
      ([path]) => path === '/api/chat/conversations/server-conv-1/messages/bulk',
    );
    expect(bulkCall).toBeDefined();
    const [, body] = bulkCall as [string, { messages: Array<{ role: string; content: string }> }];
    expect(body.messages).toEqual([
      { role: 'user', content: 'Hello there', model: undefined },
      { role: 'assistant', content: 'Hi! How can I help?', model: 'gpt-5.4' },
    ]);

    expect(result.conversationsSynced).toBe(1);
    expect(result.messagesSynced).toBe(2);
    expect(result.errors).toEqual([]);
  });

  it('reports an error instead of success when the server only partially accepts messages', async () => {
    mockPost.mockImplementation(async (path: string) => {
      if (path === '/api/chat/conversations') {
        return { conversation: { id: 'server-conv-1' } };
      }
      if (path === '/api/chat/conversations/server-conv-1/messages/bulk') {
        return { saved: 1 };
      }
      throw new Error(`Unexpected path: ${path}`);
    });

    const result = await syncLocalConversationsToCloud();

    expect(result.conversationsSynced).toBe(0);
    expect(result.messagesSynced).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/1\/2 messages/);
  });
});

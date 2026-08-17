jest.mock('../services/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));
jest.mock('../services/managedCloudChat', () => ({
  managedCloudChat: { createConversation: jest.fn() },
}));

import { api } from '../services/api';
import { managedCloudChat } from '../services/managedCloudChat';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { syncLocalConversationsToCloud } from '../src/features/settings/data-controls/localCloudSyncService';
import type { ChatMessage, ConversationSummary } from '../types/chat';

const mockPost = api.post as jest.MockedFunction<typeof api.post>;
const mockCreateConversation = managedCloudChat.createConversation as jest.MockedFunction<
  typeof managedCloudChat.createConversation
>;

const CONVERSATION_ID = '0190a000-0000-7000-8000-0000000000c1';

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
  {
    id: 'm2',
    role: 'assistant',
    content: 'Hi! How can I help?',
    model: 'fixture-model',
  } as ChatMessage,
];

function seedLocalStore() {
  useChatMessageStore.setState({
    conversations: [conversation],
    messages: { [CONVERSATION_ID]: localMessages },
  });
}

const SERVER_CONVERSATION_ID = '0190a000-0000-7000-8000-000000000f51';
const BULK_PATH = `/api/chat/conversations/${SERVER_CONVERSATION_ID}/messages/bulk`;

function cloudConversationFixture(id: string) {
  return {
    id,
    title: 'Local chat',
    model: null,
    projectId: null,
    pinned: false,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  } as Awaited<ReturnType<typeof managedCloudChat.createConversation>>;
}

describe('syncLocalConversationsToCloud', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockCreateConversation.mockReset();
    mockCreateConversation.mockResolvedValue(cloudConversationFixture(SERVER_CONVERSATION_ID));
    seedLocalStore();
  });

  it('creates the cloud conversation through the shared client with an idempotent id', async () => {
    mockPost.mockResolvedValue({ saved: 2 });

    await syncLocalConversationsToCloud();

    expect(mockCreateConversation).toHaveBeenCalledWith({
      id: CONVERSATION_ID,
      title: 'Local chat',
    });
  });

  it('sends message bodies to the bulk endpoint, not just the conversation shell', async () => {
    mockPost.mockImplementation(async (path: string) => {
      if (path === BULK_PATH) {
        return { saved: 2 };
      }
      throw new Error(`Unexpected path: ${path}`);
    });

    const result = await syncLocalConversationsToCloud();

    const bulkCall = mockPost.mock.calls.find(([path]) => path === BULK_PATH);
    expect(bulkCall).toBeDefined();
    const [, body] = bulkCall as [string, { messages: Array<{ role: string; content: string }> }];
    expect(body.messages).toEqual([
      { role: 'user', content: 'Hello there', model: undefined },
      { role: 'assistant', content: 'Hi! How can I help?', model: 'fixture-model' },
    ]);

    expect(result.conversationsSynced).toBe(1);
    expect(result.messagesSynced).toBe(2);
    expect(result.errors).toEqual([]);
  });

  it('reports an error instead of success when the server only partially accepts messages', async () => {
    mockPost.mockImplementation(async (path: string) => {
      if (path === BULK_PATH) {
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

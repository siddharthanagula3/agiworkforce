import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();
const listenHandlers = new Map<string, (event: { payload: unknown }) => void>();
const listenMock = vi.fn(async (event: string, handler: (event: { payload: unknown }) => void) => {
  listenHandlers.set(event, handler);
  return () => {
    listenHandlers.delete(event);
  };
});

const uuidToDbIdMock = vi.fn();
const linkConversationIdMock = vi.fn();

vi.mock('../../lib/tauri-mock', () => ({
  invoke: invokeMock,
  listen: listenMock,
}));

vi.mock('../../stores/auth', () => ({
  useUnifiedAuthStore: {
    getState: () => ({
      user: { id: 'user-123' },
    }),
  },
}));

vi.mock('../../stores/appModeStore', () => ({
  useAppModeStore: {
    getState: () => ({
      mode: 'local',
    }),
  },
}));

vi.mock('../../stores/chat/chatStore', () => ({
  uuidToDbId: uuidToDbIdMock,
  useChatStore: {
    getState: () => ({
      linkConversationId: linkConversationIdMock,
    }),
  },
}));

describe('TauriRuntime', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    listenHandlers.clear();
    uuidToDbIdMock.mockReturnValue(undefined);

    invokeMock.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command === 'chat_create_conversation') {
        return {
          id: 42,
          title: (args?.request as { title?: string } | undefined)?.title ?? 'New Conversation',
          created_at: '2026-03-28T00:00:00.000Z',
          updated_at: '2026-03-28T00:00:00.000Z',
        };
      }

      if (command === 'chat_send_message') {
        setTimeout(() => {
          listenHandlers.get('chat:stream-end')?.({
            payload: {
              conversation_id: 42,
              message_id: 'assistant-1',
            },
          });
        }, 0);

        return {
          conversation: {
            id: 42,
            title: 'Hello from runtime',
            created_at: '2026-03-28T00:00:00.000Z',
            updated_at: '2026-03-28T00:00:01.000Z',
          },
          user_message: {
            id: 1,
            conversation_id: 42,
            role: 'user',
            content: 'Hello from runtime',
            created_at: '2026-03-28T00:00:00.000Z',
          },
          assistant_message: {
            id: 2,
            conversation_id: 42,
            role: 'assistant',
            content: '',
            created_at: '2026-03-28T00:00:01.000Z',
          },
          stats: {
            message_count: 1,
            total_tokens: 0,
            total_input_tokens: 0,
            total_output_tokens: 0,
            total_cost: 0,
          },
        };
      }

      return undefined;
    });
  });

  it('creates and maps a backend conversation before starting a stream', async () => {
    const { TauriRuntime } = await import('../TauriRuntime');
    const runtime = new TauriRuntime();

    await runtime.sendMessage('frontend-conversation-id', 'Hello from runtime', {
      model: 'claude-sonnet-4.6',
    });

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'chat_create_conversation', {
      request: {
        title: 'Hello from runtime',
        userId: 'user-123',
        projectId: null,
      },
    });

    expect(invokeMock).toHaveBeenNthCalledWith(2, 'chat_send_message', {
      request: expect.objectContaining({
        content: 'Hello from runtime',
        userId: 'user-123',
        conversationId: 42,
        modelOverride: 'claude-sonnet-4.6',
        stream: true,
        frontendMessageId: expect.any(String),
      }),
    });

    expect(linkConversationIdMock).toHaveBeenCalledWith('frontend-conversation-id', 42);
  });

  it('reuses an existing backend id for mapped conversations', async () => {
    uuidToDbIdMock.mockReturnValue(77);

    const { TauriRuntime } = await import('../TauriRuntime');
    const runtime = new TauriRuntime();

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'chat_send_message') {
        setTimeout(() => {
          listenHandlers.get('chat:stream-end')?.({
            payload: {
              conversation_id: 77,
              message_id: 'assistant-2',
            },
          });
        }, 0);
      }

      return {
        conversation: {
          id: 77,
          title: 'Existing conversation',
          created_at: '2026-03-28T00:00:00.000Z',
          updated_at: '2026-03-28T00:00:01.000Z',
        },
      };
    });

    await runtime.sendMessage('mapped-frontend-id', 'Existing conversation');

    expect(invokeMock).not.toHaveBeenCalledWith('chat_create_conversation', expect.anything());
    expect(invokeMock).toHaveBeenCalledWith('chat_send_message', {
      request: expect.objectContaining({
        userId: 'user-123',
        conversationId: 77,
        stream: true,
        frontendMessageId: expect.any(String),
      }),
    });
  });
});

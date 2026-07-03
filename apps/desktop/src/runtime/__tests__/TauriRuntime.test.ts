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
  isTauri: false,
  isTauriContext: () => false,
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
  // TauriRuntime.ts uses selectPrivacyMode (lines 172/461); the mock must
  // export it or those calls throw and the create→send flow aborts.
  selectPrivacyMode: (state: { mode: string }) => (state.mode === 'local' ? 'local' : 'managed'),
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
          title: (args?.['request'] as { title?: string } | undefined)?.title ?? 'New Conversation',
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

    expect(invokeMock.mock.calls.map(([command]) => command)).not.toContain('llm_send_message');
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

  // LOCAL-CHAT-NOINVOKE-01 root-cause regression (2026-07-03): the AgentControl
  // composer chip's `agentMode` is a permission-style value ('ask' | 'auto' |
  // 'plan' | 'bypass') that is ALWAYS a non-empty string once a conversation
  // exists — 'ask' is the default. A prior `agentMode ? true : undefined`
  // mapping forced `enableAgentMode: true` on every send, which for an
  // explicit (non-"auto") model routes the backend into the full computer-use
  // AgentOrchestrator instead of a plain chat completion — the exact "user
  // message shows, assistant reply never arrives" Local-mode failure. This
  // pins `enableAgentMode` to never be forwarded from the default 'ask' mode.
  it('never forwards enableAgentMode:true for the default AgentControl mode', async () => {
    const { TauriRuntime } = await import('../TauriRuntime');
    const runtime = new TauriRuntime();

    await runtime.sendMessage('frontend-conversation-id', 'Hello from runtime', {
      model: 'tinyllama:latest',
      provider: 'ollama',
      agentMode: 'ask',
    });

    const sendCall = invokeMock.mock.calls.find(([command]) => command === 'chat_send_message');
    expect(sendCall).toBeDefined();
    const request = sendCall?.[1] as { request: Record<string, unknown> };
    expect(request.request['enableAgentMode']).toBeUndefined();
  });
});

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

  // DESKTOP-ARTIFACTS-ENTIRELY-UNWIRED-01 fix regression: TauriRuntime must
  // listen for the `chat:artifact` event (emitted by
  // core/llm/tool_executor/artifact_tools.rs::execute_create_artifact_tool
  // when the model calls the `create_artifact` tool) and surface it as an
  // `{ type: 'artifact' }` StreamEvent — the same event -> chunk -> event
  // pipeline already proven for tool_call/tool_result above. This is the
  // deterministic frontend-side proof that the wiring works, independent of
  // whether a live local model actually decides to call the tool.
  it('surfaces a chat:artifact event as an artifact StreamEvent', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'chat_send_message') {
        setTimeout(() => {
          listenHandlers.get('chat:artifact')?.({
            payload: {
              conversation_id: 42,
              message_id: 'assistant-1',
              artifact: {
                id: 'artifact-abc',
                type: 'markdown',
                title: 'Release Notes',
                content: '# Hello Artifact',
                language: null,
                metadata: {},
              },
            },
          });
          listenHandlers.get('chat:stream-end')?.({
            payload: { conversation_id: 42, message_id: 'assistant-1' },
          });
        }, 0);
        return undefined;
      }
      if (command === 'chat_create_conversation') {
        return {
          id: 42,
          title: 'New Conversation',
          created_at: '2026-03-28T00:00:00.000Z',
          updated_at: '2026-03-28T00:00:00.000Z',
        };
      }
      return undefined;
    });

    const { TauriRuntime } = await import('../TauriRuntime');
    const runtime = new TauriRuntime();

    const events: import('@agiworkforce/unified-chat').StreamEvent[] = [];
    runtime.onStream((event) => events.push(event));

    await runtime.sendMessage('frontend-conversation-id', 'Write me a markdown summary');

    const artifactEvent = events.find((event) => event.type === 'artifact');
    expect(artifactEvent).toBeDefined();
    expect(artifactEvent).toMatchObject({
      type: 'artifact',
      artifact: {
        id: 'artifact-abc',
        type: 'markdown',
        title: 'Release Notes',
        content: '# Hello Artifact',
      },
    });
  });

  // Mirrors the conversation-id filter already proven for chat:stream-chunk —
  // an artifact event for a DIFFERENT conversation must not leak into this turn.
  it('ignores a chat:artifact event for a different conversation', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'chat_send_message') {
        setTimeout(() => {
          listenHandlers.get('chat:artifact')?.({
            payload: {
              conversation_id: 999,
              artifact: {
                id: 'artifact-other-conv',
                type: 'code',
                content: 'print("wrong conversation")',
              },
            },
          });
          listenHandlers.get('chat:stream-end')?.({
            payload: { conversation_id: 42, message_id: 'assistant-1' },
          });
        }, 0);
        return undefined;
      }
      if (command === 'chat_create_conversation') {
        return {
          id: 42,
          title: 'New Conversation',
          created_at: '2026-03-28T00:00:00.000Z',
          updated_at: '2026-03-28T00:00:00.000Z',
        };
      }
      return undefined;
    });

    const { TauriRuntime } = await import('../TauriRuntime');
    const runtime = new TauriRuntime();

    const events: import('@agiworkforce/unified-chat').StreamEvent[] = [];
    runtime.onStream((event) => events.push(event));

    await runtime.sendMessage('frontend-conversation-id', 'Hello');

    expect(events.find((event) => event.type === 'artifact')).toBeUndefined();
  });

  // DESKTOP-ATTACHMENT-SEND-WIRE-SEVERED-01 regression: `options.attachments`
  // (real `File` objects held by ChatInput) must be base64-encoded and
  // forwarded to `chat_send_message` in the shape the Rust `ChatAttachment`
  // struct expects (`apps/desktop/src-tauri/src/sys/commands/chat/types.rs`)
  // — previously this was hardcoded to `undefined` regardless of input.
  it('encodes attachments to base64 and forwards them on chat_send_message', async () => {
    const { TauriRuntime } = await import('../TauriRuntime');
    const runtime = new TauriRuntime();

    const textFile = new File(['hello world file contents'], 'notes.txt', {
      type: 'text/plain',
    });
    const imageFile = new File(['fake-png-bytes'], 'screenshot.png', {
      type: 'image/png',
    });

    await runtime.sendMessage('frontend-conversation-id', 'What does the file say?', {
      model: 'tinyllama:latest',
      provider: 'ollama',
      attachments: [textFile, imageFile],
    });

    const sendCall = invokeMock.mock.calls.find(([command]) => command === 'chat_send_message');
    expect(sendCall).toBeDefined();
    const request = sendCall?.[1] as { request: Record<string, unknown> };
    const attachments = request.request['attachments'] as Array<Record<string, unknown>>;

    expect(attachments).toHaveLength(2);

    expect(attachments[0]).toMatchObject({
      type: 'file',
      name: 'notes.txt',
      mimeType: 'text/plain',
    });
    expect(attachments[0]?.['id']).toEqual(expect.any(String));
    expect(attachments[0]?.['content']).toMatch(/^data:text\/plain;base64,/);

    expect(attachments[1]).toMatchObject({
      type: 'image',
      name: 'screenshot.png',
      mimeType: 'image/png',
    });
    expect(attachments[1]?.['content']).toMatch(/^data:image\/png;base64,/);
  });

  it('omits attachments entirely when none were attached', async () => {
    const { TauriRuntime } = await import('../TauriRuntime');
    const runtime = new TauriRuntime();

    await runtime.sendMessage('frontend-conversation-id', 'Hello from runtime', {
      model: 'tinyllama:latest',
    });

    const sendCall = invokeMock.mock.calls.find(([command]) => command === 'chat_send_message');
    const request = sendCall?.[1] as { request: Record<string, unknown> };
    expect(request.request['attachments']).toEqual([]);
  });
});

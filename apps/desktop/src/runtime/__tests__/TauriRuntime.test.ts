import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersonalizationPreferences } from '../../stores/settingsStore';

const FIXTURE_MODEL_ID = 'fixture-model';

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
const executionModeByConversationId = new Map<string, 'local_only' | 'byok' | 'cloud_managed'>();
const projectIdByConversationId = new Map<string, string>();

const neutralPersonalization = (): PersonalizationPreferences => ({
  name: '',
  occupation: '',
  bio: '',
  formality: 3,
  warmth: 3,
  detail: 3,
  emojiUsage: 'sometimes',
});
const personalizationMock: { current: PersonalizationPreferences } = {
  current: neutralPersonalization(),
};

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
  selectPrivacyMode: (state: { mode: string }) => (state.mode === 'local' ? 'local' : 'managed'),
}));

vi.mock('../../stores/chat/chatStore', () => ({
  uuidToDbId: uuidToDbIdMock,
  resolveDesktopChatOwnerId: () => 'user-123',
  useChatStore: {
    getState: () => ({
      linkConversationId: linkConversationIdMock,
      conversations: Array.from(executionModeByConversationId, ([id, executionMode]) => ({
        id,
        executionMode,
        projectId: projectIdByConversationId.get(id),
      })),
    }),
  },
}));

vi.mock('../../stores/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({ personalization: personalizationMock.current }),
  },
}));

describe('TauriRuntime', () => {
  let resetArtifactStore: () => void;

  beforeAll(async () => {
    const [{ useArtifactStore }] = await Promise.all([
      import('../../stores/artifactStore'),
      import('../TauriRuntime'),
    ]);
    resetArtifactStore = () => useArtifactStore.getState().resetOnLogout();
  }, 20_000);

  it('does not advertise the shared per-conversation agent control without a native wire field', async () => {
    const { TauriRuntime } = await import('../TauriRuntime');
    expect(new TauriRuntime().supportsAgentControl).toBe(false);
  });

  it('advertises reasoning effort, which it does forward to the native command', async () => {
    const { TauriRuntime } = await import('../TauriRuntime');
    // ChatInterface reads `supportsReasoningEffort ?? supportsAgentControl !== false`,
    // so leaving this undefined on a runtime with supportsAgentControl:false
    // hid both the effort chip and the thinking control while sendMessage kept
    // forwarding the value.
    expect(new TauriRuntime().supportsReasoningEffort).toBe(true);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetArtifactStore();
    listenHandlers.clear();
    executionModeByConversationId.clear();
    projectIdByConversationId.clear();
    personalizationMock.current = neutralPersonalization();
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
              message_id: null,
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
      model: FIXTURE_MODEL_ID,
    });

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'chat_create_conversation', {
      request: {
        title: 'Hello from runtime',
        userId: 'user-123',
        projectId: null,
        executionMode: 'local_only',
      },
    });

    expect(invokeMock).toHaveBeenNthCalledWith(2, 'chat_send_message', {
      request: expect.objectContaining({
        content: 'Hello from runtime',
        userId: 'user-123',
        conversationId: 42,
        modelOverride: FIXTURE_MODEL_ID,
        enableTools: false,
        toolScope: undefined,
        stream: true,
        frontendMessageId: expect.any(String),
      }),
    });

    expect(invokeMock.mock.calls.map(([command]) => command)).not.toContain('llm_send_message');
    expect(linkConversationIdMock).toHaveBeenCalledWith('frontend-conversation-id', 42);
  });

  it('forwards an explicit Local Web-search turn as the narrow native search scope', async () => {
    const { TauriRuntime } = await import('../TauriRuntime');
    const runtime = new TauriRuntime();

    await runtime.sendMessage('frontend-conversation-id', 'Find current release notes', {
      model: FIXTURE_MODEL_ID,
      webSearch: true,
      localToolScope: 'web_search',
    });

    const sendCall = invokeMock.mock.calls.find(([command]) => command === 'chat_send_message');
    expect(sendCall?.[1]).toEqual({
      request: expect.objectContaining({
        enableTools: true,
        toolScope: 'web_search',
      }),
    });
  });

  it('injects the personalization "Response Style" settings into customInstructions', async () => {
    personalizationMock.current = {
      ...neutralPersonalization(),
      formality: 5,
      emojiUsage: 'never',
    };

    const { TauriRuntime } = await import('../TauriRuntime');
    const runtime = new TauriRuntime();

    await runtime.sendMessage('frontend-conversation-id', 'Hello from runtime', {
      model: FIXTURE_MODEL_ID,
    });

    const sendCall = invokeMock.mock.calls.find(([command]) => command === 'chat_send_message');
    const instructions = (sendCall?.[1] as { request: { customInstructions?: string } } | undefined)
      ?.request.customInstructions;
    expect(instructions).toContain('<personalization>');
    expect(instructions).toContain('Use a formal, professional tone');
    expect(instructions).toContain('Do not use emoji');
  });

  it('leaves customInstructions unset for a neutral (default) personalization', async () => {
    const { TauriRuntime } = await import('../TauriRuntime');
    const runtime = new TauriRuntime();

    await runtime.sendMessage('frontend-conversation-id', 'Hello from runtime', {
      model: FIXTURE_MODEL_ID,
    });

    const sendCall = invokeMock.mock.calls.find(([command]) => command === 'chat_send_message');
    const instructions = (sendCall?.[1] as { request: { customInstructions?: string } } | undefined)
      ?.request.customInstructions;
    expect(instructions).toBeUndefined();
  });

  it('carries the conversation project scope into the backend create', async () => {
    executionModeByConversationId.set('frontend-conversation-id', 'local_only');
    projectIdByConversationId.set('frontend-conversation-id', 'proj-42');

    const { TauriRuntime } = await import('../TauriRuntime');
    const runtime = new TauriRuntime();

    await runtime.sendMessage('frontend-conversation-id', 'Hello from a project chat', {
      model: FIXTURE_MODEL_ID,
    });

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'chat_create_conversation', {
      request: {
        title: 'Hello from a project chat',
        userId: 'user-123',
        projectId: 'proj-42',
        executionMode: 'local_only',
      },
    });
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

  it('sends a BYOK fork through the explicit BYOK execution boundary', async () => {
    uuidToDbIdMock.mockReturnValue(77);
    executionModeByConversationId.set('byok-fork', 'byok');
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'chat_send_message') {
        setTimeout(() => {
          listenHandlers.get('chat:stream-end')?.({
            payload: { conversation_id: 77, message_id: 'assistant-byok' },
          });
        }, 0);
      }
      return undefined;
    });

    const { TauriRuntime } = await import('../TauriRuntime');
    const runtime = new TauriRuntime();

    await runtime.sendMessage('byok-fork', 'Use my OpenAI key', {
      provider: 'openai',
      model: FIXTURE_MODEL_ID,
    });

    expect(invokeMock).toHaveBeenCalledWith('chat_send_message', {
      request: expect.objectContaining({
        conversationId: 77,
        executionMode: 'byok',
        activeMode: 'local',
        preferCloudCredits: false,
      }),
    });
  });

  it('fails a stale managed label closed to the Local native boundary', async () => {
    uuidToDbIdMock.mockReturnValue(77);
    executionModeByConversationId.set('stale-cloud-conversation', 'cloud_managed');
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'chat_send_message') {
        setTimeout(() => {
          listenHandlers.get('chat:stream-end')?.({
            payload: { conversation_id: 77, message_id: 'assistant-local' },
          });
        }, 0);
      }
      return undefined;
    });

    const { TauriRuntime } = await import('../TauriRuntime');
    const runtime = new TauriRuntime();
    await runtime.sendMessage('stale-cloud-conversation', 'Stay on this device');

    expect(invokeMock).toHaveBeenCalledWith('chat_send_message', {
      request: expect.objectContaining({
        executionMode: 'local_only',
        activeMode: 'local',
        preferCloudCredits: false,
      }),
    });
  });

  it('never forwards enableAgentMode:true for the default AgentControl mode', async () => {
    const { TauriRuntime } = await import('../TauriRuntime');
    const runtime = new TauriRuntime();

    await runtime.sendMessage('frontend-conversation-id', 'Hello from runtime', {
      model: 'fixture-local-model:current',
      provider: 'ollama',
      agentMode: 'ask',
    });

    const sendCall = invokeMock.mock.calls.find(([command]) => command === 'chat_send_message');
    expect(sendCall).toBeDefined();
    const request = sendCall?.[1] as { request: Record<string, unknown> };
    expect(request.request['enableAgentMode']).toBeUndefined();
  });

  it('surfaces a chat:artifact event as an artifact StreamEvent', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'chat_send_message') {
        setTimeout(() => {
          listenHandlers.get('chat:artifact')?.({
            payload: {
              conversation_id: 42,
              message_id: null,
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

  it('renders a progressive artifact draft while create_artifact arguments stream', async () => {
    const argsChunks = [
      '{"artifact_type":"markdown"',
      ',"title":"Release No',
      'tes","content":"# Hel',
      'lo\\nWorld"}',
    ];

    const { useArtifactStore } = await import('../../stores/artifactStore');
    type Draft = ReturnType<typeof useArtifactStore.getState>['draft'];
    const draftSnapshots: Draft[] = [];
    useArtifactStore.setState({ draft: null, panelOpen: false, activeArtifactId: null });

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'chat_send_message') {
        setTimeout(() => {
          argsChunks.forEach((delta, seq) => {
            listenHandlers.get('chat:artifact-progress')?.({
              payload: {
                conversation_id: 42,
                message_id: 'assistant-1',
                tool_call_index: 0,
                seq,
                delta,
              },
            });
          });
          draftSnapshots.push(useArtifactStore.getState().draft);
          listenHandlers.get('chat:artifact')?.({
            payload: {
              conversation_id: 42,
              message_id: null,
              artifact: {
                id: 'artifact-final',
                type: 'markdown',
                title: 'Release Notes',
                content: '# Hello\nWorld',
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
    await new TauriRuntime().sendMessage('frontend-conversation-id', 'Write release notes');

    expect(draftSnapshots).toHaveLength(1);
    expect(draftSnapshots[0]).toMatchObject({
      key: 'assistant-1:0',
      title: 'Release Notes',
      artifactType: 'markdown',
      content: '# Hello\nWorld',
      complete: true,
    });

    const finalState = useArtifactStore.getState();
    expect(finalState.draft).toBeNull();
    expect(finalState.activeArtifactId).toBe('artifact-final');
    expect(finalState.panelOpen).toBe(true);
  });

  it('discards the artifact draft when the turn ends without an artifact', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'chat_send_message') {
        setTimeout(() => {
          listenHandlers.get('chat:artifact-progress')?.({
            payload: {
              conversation_id: 42,
              message_id: 'assistant-1',
              tool_call_index: 0,
              seq: 0,
              delta: '{"artifact_type":"code","title":"Broken',
            },
          });
          listenHandlers.get('chat:stream-error')?.({
            payload: {
              conversation_id: 42,
              message_id: 'assistant-1',
              error: 'provider failed',
            },
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

    const { useArtifactStore } = await import('../../stores/artifactStore');
    useArtifactStore.setState({ draft: null, panelOpen: false, activeArtifactId: null });

    const { TauriRuntime } = await import('../TauriRuntime');
    await new TauriRuntime().sendMessage('frontend-conversation-id', 'Write some code');

    const finalState = useArtifactStore.getState();
    expect(finalState.draft).toBeNull();
    expect(finalState.panelOpen).toBe(false);
    expect(finalState.activeArtifactId).toBeNull();
  });

  it('ignores a chat:artifact-progress event for a different conversation', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'chat_send_message') {
        setTimeout(() => {
          listenHandlers.get('chat:artifact-progress')?.({
            payload: {
              conversation_id: 99,
              message_id: 'assistant-1',
              tool_call_index: 0,
              seq: 0,
              delta: '{"artifact_type":"code","title":"Other conversation"',
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

    const { useArtifactStore } = await import('../../stores/artifactStore');
    useArtifactStore.setState({ draft: null, panelOpen: false, activeArtifactId: null });

    const { TauriRuntime } = await import('../TauriRuntime');
    await new TauriRuntime().sendMessage('frontend-conversation-id', 'Write some code');

    expect(useArtifactStore.getState().draft).toBeNull();
    expect(useArtifactStore.getState().panelOpen).toBe(false);
  });

  it('projects native Local thinking and iteration events into the shared activity stream', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'chat_send_message') {
        setTimeout(() => {
          listenHandlers.get('agent:thinking')?.({
            payload: {
              thinking: true,
              message: 'Executing agent plan...',
            },
          });
          listenHandlers.get('chat:agent-progress')?.({
            payload: {
              conversation_id: 42,
              iteration: 2,
              max_iterations: 8,
              status: 'executing_tools',
              tool_count: 1,
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

    await runtime.sendMessage('frontend-conversation-id', 'Use local tools');

    expect(events.filter((event) => event.type === 'agent_event')).toEqual([
      expect.objectContaining({
        type: 'agent_event',
        envelope: expect.objectContaining({
          sequence: 0,
          event: {
            type: 'progress-update',
            progressId: 'local-thinking',
            summary: 'Executing agent plan...',
            status: 'running',
          },
        }),
      }),
      expect.objectContaining({
        type: 'agent_event',
        envelope: expect.objectContaining({
          sequence: 1,
          event: {
            type: 'progress-update',
            progressId: 'local-agent-iteration',
            summary: 'Agent iteration 2/8 — 1 tool',
            detail: 'Running local tools',
            status: 'running',
          },
        }),
      }),
    ]);
  });

  it('forwards native reasoning content into the shared thinking stream without duplicating completion text', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'chat_send_message') {
        setTimeout(() => {
          listenHandlers.get('thinking:event')?.({
            payload: {
              event_type: 'start',
              content: '',
              message_id: null,
              tokens: null,
              timestamp: 1_000,
            },
          });
          listenHandlers.get('thinking:event')?.({
            payload: {
              event_type: 'delta',
              content: 'Analyze the request.',
              message_id: null,
              tokens: null,
              timestamp: 1_400,
            },
          });
          listenHandlers.get('thinking:event')?.({
            payload: {
              event_type: 'complete',
              content: 'Analyze the request. Choose a concise answer.',
              message_id: null,
              tokens: 12,
              timestamp: 2_500,
            },
          });
          listenHandlers.get('chat:stream-chunk')?.({
            payload: {
              conversation_id: 42,
              message_id: 'assistant-1',
              delta: 'Hello!',
              content: 'Hello!',
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

    await runtime.sendMessage('frontend-conversation-id', 'Say hello');

    expect(events.filter((event) => event.type === 'thinking')).toEqual([
      {
        type: 'thinking',
        content: 'Analyze the request.',
        completed: false,
        durationMs: 400,
      },
      {
        type: 'thinking',
        content: ' Choose a concise answer.',
        completed: true,
        durationMs: 1_500,
      },
    ]);
  });

  it('durably links streamed artifacts to the persisted assistant message', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'chat_send_message') {
        setTimeout(() => {
          listenHandlers.get('chat:artifact')?.({
            payload: {
              conversation_id: 42,
              message_id: 'assistant-live-id',
              artifact: {
                id: 'artifact-linked',
                type: 'react',
                title: 'Counter',
                content: 'export default function Counter() { return <button>1</button>; }',
                language: 'tsx',
                metadata: {},
              },
            },
          });
          listenHandlers.get('chat:stream-end')?.({
            payload: {
              conversation_id: 42,
              message_id: 'assistant-live-id',
              backend_message_id: 17,
            },
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
      if (command === 'artifact_link_to_message') {
        return { success: true, data: 1, error: null };
      }
      return undefined;
    });

    const { TauriRuntime } = await import('../TauriRuntime');
    const runtime = new TauriRuntime();

    await runtime.sendMessage('frontend-conversation-id', 'Create a React counter');

    expect(invokeMock).toHaveBeenCalledWith('artifact_link_to_message', {
      conversationId: 42,
      messageId: 17,
      artifactIds: ['artifact-linked'],
      userId: 'user-123',
    });
  });

  it('waits for native cancellation completion so a created artifact is linked before teardown', async () => {
    const controller = new AbortController();
    uuidToDbIdMock.mockReturnValue(42);
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'chat_create_conversation') {
        return {
          id: 42,
          title: 'New Conversation',
          created_at: '2026-07-15T00:00:00.000Z',
          updated_at: '2026-07-15T00:00:00.000Z',
        };
      }
      if (command === 'chat_send_message') {
        setTimeout(() => {
          listenHandlers.get('chat:artifact')?.({
            payload: {
              conversation_id: 42,
              message_id: 'assistant-cancelled',
              artifact: {
                id: 'artifact-before-cancel',
                type: 'markdown',
                title: 'Partial notes',
                content: '# Already complete',
              },
            },
          });
        }, 0);
        return undefined;
      }
      if (command === 'chat_stop_generation') {
        setTimeout(() => {
          listenHandlers.get('chat:stream-end')?.({
            payload: {
              conversation_id: 42,
              message_id: 'assistant-cancelled',
              backend_message_id: 19,
            },
          });
        }, 0);
        return undefined;
      }
      if (command === 'artifact_link_to_message') {
        return { success: true, data: 1, error: null };
      }
      return undefined;
    });

    const { TauriRuntime } = await import('../TauriRuntime');
    const runtime = new TauriRuntime();
    runtime.onStream((event) => {
      if (event.type === 'artifact') controller.abort();
    });

    await runtime.sendMessage('frontend-conversation-id', 'Create notes, then stop', {
      signal: controller.signal,
    });

    expect(invokeMock).toHaveBeenCalledWith('chat_stop_generation', { conversationId: 42 });
    expect(invokeMock).toHaveBeenCalledWith('artifact_link_to_message', {
      conversationId: 42,
      messageId: 19,
      artifactIds: ['artifact-before-cancel'],
      userId: 'user-123',
    });
  });

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

  it('reconstructs persisted rich artifacts on conversation reopen without losing type or version', async () => {
    uuidToDbIdMock.mockReturnValue(42);
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'chat_get_messages') {
        return [
          {
            id: 1,
            conversation_id: 42,
            role: 'user',
            content: 'Create two rich artifacts',
            created_at: '2026-07-15T00:00:00.000Z',
          },
          {
            id: 17,
            conversation_id: 42,
            role: 'assistant',
            content: 'Created the artifacts.',
            created_at: '2026-07-15T00:00:01.000Z',
          },
        ];
      }
      if (command === 'artifact_get_conversation_snapshot') {
        return {
          success: true,
          data: [
            {
              id: 'artifact-react',
              render_type: 'react',
              title: 'Counter',
              content: 'export default function Counter() { return <button>1</button>; }',
              metadata: { language: 'tsx' },
              conversation_id: 42,
              message_id: 17,
              current_version: 3,
              created_at: '2026-07-15T00:00:01.100Z',
              updated_at: '2026-07-15T00:02:00.000Z',
            },
            {
              id: 'artifact-svg',
              artifact_type: 'image',
              render_type: 'svg',
              title: 'Logo',
              content: '<svg><circle r="10" /></svg>',
              metadata: {},
              conversation_id: 42,
              message_id: 17,
              current_version: 2,
              created_at: '2026-07-15T00:00:01.200Z',
              updated_at: '2026-07-15T00:03:00.000Z',
            },
            {
              id: 'artifact-forward-compatible',
              artifact_type: 'image',
              render_type: 'future-image-widget',
              title: 'Future image',
              content: 'future-image-content',
              metadata: {},
              conversation_id: 42,
              message_id: 17,
              current_version: 1,
              created_at: '2026-07-15T00:00:01.300Z',
              updated_at: '2026-07-15T00:04:00.000Z',
            },
            {
              id: 'artifact-malformed-missing-render-type',
              artifact_type: 'document',
              title: 'Malformed legacy row',
              content: 'must be skipped at the IPC boundary',
              metadata: {},
              conversation_id: 42,
              message_id: 17,
              current_version: 1,
            },
          ],
          error: null,
        };
      }
      return undefined;
    });

    const { TauriRuntime } = await import('../TauriRuntime');
    const runtime = new TauriRuntime();

    const messages = await runtime.loadMessages('42');

    expect(messages[1]?.artifacts).toEqual([
      expect.objectContaining({
        id: 'artifact-react',
        type: 'react',
        language: 'tsx',
        version: 3,
        messageId: '17',
      }),
      expect.objectContaining({
        id: 'artifact-svg',
        type: 'svg',
        version: 2,
        messageId: '17',
      }),
      expect.objectContaining({
        id: 'artifact-forward-compatible',
        type: 'image',
        version: 1,
        messageId: '17',
      }),
    ]);
  });

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
      model: 'fixture-local-model:current',
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
      model: 'fixture-local-model:current',
    });

    const sendCall = invokeMock.mock.calls.find(([command]) => command === 'chat_send_message');
    const request = sendCall?.[1] as { request: Record<string, unknown> };
    expect(request.request['attachments']).toEqual([]);
  });
});

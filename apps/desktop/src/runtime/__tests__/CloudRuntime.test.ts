/**
 * CloudRuntime unit tests — mock-only, no live backend.
 *
 * Live E2E verification requires a signed Tauri build plus a real Cloud
 * account. Managed Cloud itself is public alpha and no longer waitlist-gated.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StreamEvent } from '@agiworkforce/unified-chat';
import type {
  CloudAgentRun,
  ManagedCloudAgentRunFollowOptions,
  ManagedCloudAgentRunFollowResult,
} from '@agiworkforce/cloud-contracts';
import { CloudRuntime } from '../CloudRuntime';

type TestFollowOptions = ManagedCloudAgentRunFollowOptions & {
  onEvent: NonNullable<ManagedCloudAgentRunFollowOptions['onEvent']>;
  onSnapshot: NonNullable<ManagedCloudAgentRunFollowOptions['onSnapshot']>;
};

function managedRun(state: CloudAgentRun['state'], lastEventSequence: number): CloudAgentRun {
  return {
    id: MANAGED_RUN_ID,
    userId: 'user-desktop',
    requestId: 'request-desktop',
    conversationId: 'conv-desktop',
    originSurface: 'desktop',
    workMode: 'agiwork',
    state,
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    lastEventSequence,
    cancellationRequestedAt: null,
    completedAt: state === 'completed' ? '2026-07-17T20:00:00.000Z' : null,
    createdAt: '2026-07-17T19:59:00.000Z',
    updatedAt: '2026-07-17T20:00:00.000Z',
  };
}

const saveMessage = vi.fn();
const createConversation = vi.fn();
const deleteConversation = vi.fn();
const updateConversation = vi.fn();
const listConversations = vi.fn();
const getConversation = vi.fn();

vi.mock('../../lib/cloudChatPersistence', () => ({
  getDesktopCloudChatPersistenceClient: () => ({
    saveMessage,
    createConversation,
    deleteConversation,
    updateConversation,
    listConversations,
    getConversation,
  }),
}));

vi.mock('../../stores/appModeStore', () => ({
  useAppModeStore: {
    getState: () => ({ mode: 'cloud' }),
  },
  selectPrivacyMode: () => 'managed',
}));

vi.mock('../../stores/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../stores/auth')>();
  const state = {
    isAuthenticated: true,
    accessToken: 'desktop-cloud-token',
    // Empty email claim: exactly what /api/auth/device/token mints for a
    // browser-approved desktop device.
    user: { id: 'user-desktop', email: '' },
  };
  return {
    // Keep the REAL cloud-session predicate so the boundary is exercised, not mocked.
    selectHasCloudAccountSession: actual.selectHasCloudAccountSession,
    useAuthStore: { getState: () => state },
    useUnifiedAuthStore: { getState: () => state },
  };
});

vi.mock('../sessionLabeling', () => ({
  desktopExecutionProfileFor: vi.fn(() => ({})),
  labelDesktopSession: vi.fn(() => ({})),
}));

const sendCloudMessage = vi.fn();
const generateCloudImage = vi.fn();
const followRun = vi.fn();
const cancelRun = vi.fn();
vi.mock('../../api/cloudApi', () => ({
  CLOUD_API_BASE_URL: 'https://cloud.example',
  cloudFetch: vi.fn(),
  getAuthHeaders: vi.fn(async () => ({
    Authorization: 'Bearer desktop-cloud-token',
  })),
  generateCloudImage: (...args: unknown[]) => generateCloudImage(...args),
  sendCloudMessage: (...args: unknown[]) => sendCloudMessage(...args),
  createDesktopCloudAgentRunClient: () => ({ followRun, cancelRun }),
}));

const MANAGED_RUN_ID = '019c3330-02b7-7000-8000-000000000001';
const MANAGED_RUN_PATH = `/api/llm/v1/chat/completions/runs/${MANAGED_RUN_ID}`;

function collectEvents(runtime: CloudRuntime): StreamEvent[] {
  const events: StreamEvent[] = [];
  runtime.onStream((event) => events.push(event));
  return events;
}

describe('CloudRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveMessage.mockResolvedValue({ id: 'saved-id' });
    createConversation.mockImplementation(
      async (input: { id: string; title: string; model?: string; projectId?: string }) => ({
        id: input.id,
        title: input.title,
        model: input.model ?? null,
        projectId: input.projectId ?? null,
        pinned: false,
        starred: false,
        archived: false,
        isTemporary: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    updateConversation.mockImplementation(async (id: string, updates: Record<string, unknown>) => ({
      id,
      title: typeof updates['title'] === 'string' ? updates['title'] : 'New chat',
      model: typeof updates['model'] === 'string' ? updates['model'] : null,
      projectId: typeof updates['projectId'] === 'string' ? updates['projectId'] : null,
      pinned: updates['pinned'] === true,
      starred: false,
      archived: updates['archived'] === true,
      isTemporary: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }));
    deleteConversation.mockResolvedValue(undefined);
    cancelRun.mockResolvedValue(managedRun('cancelled', 0));
  });

  describe('sendMessage', () => {
    it('forwards managed search, thinking, code, Research, effort, work mode, and skill selection', async () => {
      const runtime = new CloudRuntime();
      expect(runtime.supportsManagedWebSearch).toBe(true);
      expect(runtime.supportsCodeExecution).toBe(true);
      expect(runtime.supportsResearch).toBe(true);
      expect(runtime.supportsImageGeneration).toBe(true);
      expect(runtime.supportsVideoGeneration).toBe(false);
      expect(runtime.supportsComputerUse).toBe(false);
      expect(runtime.supportsConcurrentTurns).toBe(true);
      sendCloudMessage.mockResolvedValue(undefined);

      await runtime.sendMessage('conv_research', 'investigate', {
        webSearch: true,
        thinkingEnabled: true,
        codeExecution: true,
        research: true,
        agentMode: 'auto',
        effort: 'high',
        workMode: 'agiwork',
        skillName: 'frontend-design',
      });

      expect(sendCloudMessage.mock.calls[0]?.[8]).toBe(true);
      expect(sendCloudMessage.mock.calls[0]?.[10]).toBe(true);
      expect(sendCloudMessage.mock.calls[0]?.[11]).toBe(true);
      expect(sendCloudMessage.mock.calls[0]?.[13]).toEqual({
        research: true,
        workMode: 'agiwork',
        skillName: 'frontend-design',
        effort: 'high',
      });
    });

    it('dispatches image prompts to durable managed media and persists the generated file', async () => {
      const runtime = new CloudRuntime();
      const events = collectEvents(runtime);
      generateCloudImage.mockResolvedValue({
        id: 'image-asset-1',
        uri: 'https://cloud.example/api/files/image-asset-1',
        provider: 'google',
        model: 'gemini-3.1-flash-image',
      });

      await runtime.sendMessage('conv_image', 'Create an image of a glass lighthouse at sunrise', {
        model: 'auto',
      });

      expect(sendCloudMessage).not.toHaveBeenCalled();
      expect(generateCloudImage).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Create an image of a glass lighthouse at sunrise',
          provider: 'google',
          model: expect.any(String),
          idempotencyKey: expect.stringMatching(/^agi\.media\.desktop\.image\./),
        }),
      );
      expect(events.map((event) => event.type)).toEqual([
        'tool_call',
        'tool_result',
        'generated_files',
        'done',
      ]);
      expect(events.every((event) => event.conversationId === 'conv_image')).toBe(true);
      expect(events.find((event) => event.type === 'generated_files')).toMatchObject({
        files: [
          {
            id: 'image-asset-1',
            uri: 'https://cloud.example/api/files/image-asset-1',
            kind: 'image',
            previewable: true,
          },
        ],
      });
      expect(saveMessage).toHaveBeenNthCalledWith(
        2,
        'conv_image',
        expect.objectContaining({
          role: 'assistant',
          metadata: expect.objectContaining({
            finishReason: 'stop',
            generatedFiles: [
              expect.objectContaining({
                id: 'image-asset-1',
                uri: 'https://cloud.example/api/files/image-asset-1',
              }),
            ],
          }),
        }),
      );
    });

    it('settles a failed image request instead of leaving the assistant turn loading', async () => {
      const runtime = new CloudRuntime();
      const events = collectEvents(runtime);
      generateCloudImage.mockRejectedValue(new Error('Image provider unavailable'));

      await runtime.sendMessage('conv_image_failure', 'Draw an image of a lighthouse');

      expect(events.map((event) => event.type)).toEqual(['tool_call', 'tool_result', 'error']);
      expect(events.find((event) => event.type === 'error')).toEqual({
        type: 'error',
        error: 'Image provider unavailable',
        conversationId: 'conv_image_failure',
      });
      expect(events.some((event) => event.type === 'done')).toBe(false);
      expect(saveMessage).toHaveBeenNthCalledWith(
        2,
        'conv_image_failure',
        expect.objectContaining({
          role: 'assistant',
          metadata: expect.objectContaining({
            finishReason: 'error',
            streamError: { message: 'Image provider unavailable' },
            toolCalls: [
              expect.objectContaining({
                name: 'media_generate_image',
                status: 'failed',
                error: 'Image provider unavailable',
              }),
            ],
          }),
        }),
      );
    });

    it('persists the user message before streaming, then the assistant message on done', async () => {
      const runtime = new CloudRuntime();
      const events = collectEvents(runtime);

      sendCloudMessage.mockImplementation(
        async (
          _conversationId: string,
          _content: string,
          _model: string,
          onChunk: (text: string) => void,
          onDone: () => void,
        ) => {
          onChunk('Hello');
          onChunk(' world');
          await onDone();
        },
      );

      await runtime.sendMessage('conv_1', 'Hi there');

      // User message saved before the stream call.
      expect(saveMessage).toHaveBeenNthCalledWith(
        1,
        'conv_1',
        expect.objectContaining({ role: 'user', content: 'Hi there' }),
      );
      expect(sendCloudMessage).toHaveBeenCalledTimes(1);

      // Content events forwarded, done emitted.
      expect(events.filter((e) => e.type === 'content')).toHaveLength(2);
      expect(events.some((e) => e.type === 'done')).toBe(true);

      // Assistant message saved with the accumulated content — fired async
      // after 'done', so wait a tick.
      await vi.waitFor(() => {
        expect(saveMessage).toHaveBeenCalledTimes(2);
      });
      expect(saveMessage).toHaveBeenNthCalledWith(
        2,
        'conv_1',
        expect.objectContaining({ role: 'assistant', content: 'Hello world' }),
      );
    });

    it('fails a lifecycle-only cloud turn that completed without renderable output', async () => {
      const events: StreamEvent[] = [];
      const runtime = new CloudRuntime();
      runtime.onStream((event) => events.push(event));

      sendCloudMessage.mockImplementation(
        async (
          _conversationId: string,
          _content: string,
          _model: string,
          _onChunk: (text: string) => void,
          onDone: () => void,
          _onError: (err: Error) => void,
          _signal: AbortSignal,
          onEvent: (payload: Record<string, unknown>) => void,
        ) => {
          onEvent({
            choices: [
              {
                delta: {
                  x_agent_event: {
                    schemaVersion: 3,
                    sessionId: 'session-1',
                    turnId: 'turn-1',
                    sequence: 0,
                    emittedAtMs: 1_000,
                    event: { type: 'lifecycle', phase: 'started' },
                  },
                },
              },
            ],
          });
          onEvent({
            choices: [
              {
                delta: {
                  x_agent_event: {
                    schemaVersion: 3,
                    sessionId: 'session-1',
                    turnId: 'turn-1',
                    sequence: 1,
                    emittedAtMs: 2_000,
                    event: { type: 'stop', reason: 'end-turn' },
                  },
                },
              },
            ],
          });
          await onDone();
        },
      );

      await runtime.sendMessage('conv_activity', 'Run the task');

      await vi.waitFor(() => expect(saveMessage).toHaveBeenCalledTimes(2));
      expect(saveMessage).toHaveBeenNthCalledWith(
        2,
        'conv_activity',
        expect.objectContaining({
          role: 'assistant',
          content: String.fromCharCode(0x200b),
          metadata: {
            agentActivity: expect.objectContaining({
              turnId: 'turn-1',
              status: 'failed',
              lastSequence: 1,
            }),
            finishReason: 'error',
            streamError: {
              message: 'AGI Cloud completed without returning a response.',
            },
          },
        }),
      );
      expect(events).toContainEqual({
        type: 'error',
        error: 'AGI Cloud completed without returning a response. Please retry.',
        conversationId: 'conv_activity',
      });
      expect(events.some((event) => event.type === 'done')).toBe(false);
    });

    it('emits an error and does not call sendCloudMessage when the user-message save fails', async () => {
      saveMessage.mockRejectedValueOnce(new Error('network down'));
      const runtime = new CloudRuntime();
      const events = collectEvents(runtime);

      await runtime.sendMessage('conv_1', 'Hi there');

      expect(sendCloudMessage).not.toHaveBeenCalled();
      expect(events).toEqual([{ type: 'error', error: 'network down', conversationId: 'conv_1' }]);
    });

    it('surfaces a save failure and does not report the reply as durably done', async () => {
      const runtime = new CloudRuntime();
      const events = collectEvents(runtime);

      sendCloudMessage.mockImplementation(
        async (
          _conversationId: string,
          _content: string,
          _model: string,
          onChunk: (text: string) => void,
          onDone: () => void,
        ) => {
          onChunk('Reply');
          await onDone();
        },
      );
      saveMessage.mockResolvedValueOnce({ id: 'user-saved' }); // user save ok
      saveMessage.mockRejectedValueOnce(new Error('save failed')); // assistant save fails

      await runtime.sendMessage('conv_1', 'Hi');

      expect(events.some((e) => e.type === 'done')).toBe(false);
      await vi.waitFor(() => {
        expect(events.some((e) => e.type === 'error' && e.error.includes('save failed'))).toBe(
          true,
        );
      });
    });

    it('forwards onError from the stream as an error event', async () => {
      const runtime = new CloudRuntime();
      const events = collectEvents(runtime);

      sendCloudMessage.mockImplementation(
        async (
          _conversationId: string,
          _content: string,
          _model: string,
          _onChunk: (text: string) => void,
          _onDone: () => void,
          onError: (err: Error) => void,
        ) => {
          onError(new Error('stream broke'));
        },
      );

      await runtime.sendMessage('conv_1', 'Hi');

      expect(events).toContainEqual({
        type: 'error',
        error: 'stream broke',
        conversationId: 'conv_1',
      });
    });

    it('persists canonical activity as failed when the stream promise rejects directly', async () => {
      const runtime = new CloudRuntime();

      sendCloudMessage.mockImplementation(
        async (
          _conversationId: string,
          _content: string,
          _model: string,
          _onChunk: (text: string) => void,
          _onDone: () => void,
          _onError: (err: Error) => void,
          _signal: AbortSignal,
          onEvent: (payload: Record<string, unknown>) => void,
        ) => {
          onEvent({
            choices: [
              {
                delta: {
                  x_agent_event: {
                    schemaVersion: 3,
                    sessionId: 'session-reject',
                    turnId: 'turn-reject',
                    sequence: 0,
                    emittedAtMs: 1_000,
                    event: { type: 'lifecycle', phase: 'started' },
                  },
                },
              },
            ],
          });
          throw new Error('socket rejected');
        },
      );

      await runtime.sendMessage('conv_reject', 'Start the task');

      await vi.waitFor(() => expect(saveMessage).toHaveBeenCalledTimes(2));
      expect(saveMessage).toHaveBeenNthCalledWith(
        2,
        'conv_reject',
        expect.objectContaining({
          metadata: expect.objectContaining({
            agentActivity: expect.objectContaining({
              turnId: 'turn-reject',
              status: 'failed',
            }),
          }),
        }),
      );
    });

    it('follows the durable run journal after an unexpected stream disconnect', async () => {
      const runtime = new CloudRuntime();
      const events = collectEvents(runtime);

      sendCloudMessage.mockImplementation(
        async (
          _conversationId: string,
          _content: string,
          _model: string,
          onChunk: (text: string) => void,
          _onDone: () => void,
          onError: (err: Error) => void,
          _signal: AbortSignal,
          onEvent: (payload: Record<string, unknown>) => void,
          _webSearch: boolean | undefined,
          _messageHistory: unknown,
          _thinkingEnabled: boolean | undefined,
          _codeExecution: boolean | undefined,
          _idempotencyKey: string,
          _requestOptions: unknown,
          onRunHandle: (handle: { runId: string; runPath: string } | null) => void,
        ) => {
          onRunHandle({ runId: MANAGED_RUN_ID, runPath: MANAGED_RUN_PATH });
          onChunk('Partial answer');
          onEvent({
            choices: [
              {
                delta: {
                  x_agent_event: {
                    schemaVersion: 3,
                    sessionId: 'session-reconnect',
                    turnId: 'turn-reconnect',
                    sequence: 0,
                    emittedAtMs: 1_000,
                    event: { type: 'lifecycle', phase: 'started' },
                  },
                },
              },
            ],
          });
          onError(new Error('connection reset'));
        },
      );

      followRun.mockImplementation(
        async (
          _runId: string,
          options: TestFollowOptions,
        ): Promise<ManagedCloudAgentRunFollowResult> => {
          options.onEvent({
            schemaVersion: 3,
            sessionId: 'session-reconnect',
            turnId: 'turn-reconnect',
            sequence: 1,
            emittedAtMs: 2_000,
            event: { type: 'text-delta', delta: ' recovered' },
          });
          options.onEvent({
            schemaVersion: 3,
            sessionId: 'session-reconnect',
            turnId: 'turn-reconnect',
            sequence: 2,
            emittedAtMs: 3_000,
            event: { type: 'stop', reason: 'end-turn' },
          });
          const run = managedRun('completed', 2);
          options.onSnapshot({ run, events: [], nextAfterSequence: 2 });
          return { run, lastSequence: 2 };
        },
      );

      await runtime.sendMessage('conv_reconnect', 'Do the work');

      expect(followRun).toHaveBeenCalledWith(
        MANAGED_RUN_ID,
        expect.objectContaining({ afterSequence: 0 }),
      );
      expect(
        events.filter((event) => event.type === 'content').map((event) => event.content),
      ).toEqual(['Partial answer', ' recovered']);
      expect(events.some((event) => event.type === 'error')).toBe(false);
      expect(events.some((event) => event.type === 'done')).toBe(true);
      await vi.waitFor(() => expect(saveMessage).toHaveBeenCalledTimes(2));
      expect(saveMessage).toHaveBeenNthCalledWith(
        2,
        'conv_reconnect',
        expect.objectContaining({
          role: 'assistant',
          content: 'Partial answer recovered',
          metadata: expect.objectContaining({
            cloudAgentRun: {
              runId: MANAGED_RUN_ID,
              runPath: MANAGED_RUN_PATH,
              lastSequence: 2,
              state: 'completed',
              cancellationRequestedAt: null,
            },
          }),
        }),
      );
    });

    it('does not duplicate public text already rendered before reconnect', async () => {
      const runtime = new CloudRuntime();
      const events = collectEvents(runtime);

      sendCloudMessage.mockImplementation(async (...args: unknown[]) => {
        const onChunk = args[3] as (text: string) => void;
        const onError = args[5] as (err: Error) => void;
        const onRunHandle = args[14] as (handle: { runId: string; runPath: string }) => void;
        onRunHandle({ runId: MANAGED_RUN_ID, runPath: MANAGED_RUN_PATH });
        onChunk('Already visible');
        onError(new Error('connection reset'));
      });
      followRun.mockImplementation(
        async (
          _runId: string,
          options: TestFollowOptions,
        ): Promise<ManagedCloudAgentRunFollowResult> => {
          options.onEvent({
            schemaVersion: 3,
            sessionId: 'session-overlap',
            turnId: 'turn-overlap',
            sequence: 0,
            emittedAtMs: 1_000,
            event: { type: 'text-delta', delta: 'Already visible' },
          });
          options.onEvent({
            schemaVersion: 3,
            sessionId: 'session-overlap',
            turnId: 'turn-overlap',
            sequence: 1,
            emittedAtMs: 2_000,
            event: { type: 'text-delta', delta: ' once' },
          });
          const run = managedRun('completed', 1);
          return { run, lastSequence: 1 };
        },
      );

      await runtime.sendMessage('conv_overlap', 'Continue');

      expect(
        events.filter((event) => event.type === 'content').map((event) => event.content),
      ).toEqual(['Already visible', ' once']);
      await vi.waitFor(() => expect(saveMessage).toHaveBeenCalledTimes(2));
      expect(saveMessage).toHaveBeenNthCalledWith(
        2,
        'conv_overlap',
        expect.objectContaining({ content: 'Already visible once' }),
      );
    });
  });

  describe('stopGeneration', () => {
    it('aborts the in-flight controller passed to sendCloudMessage', async () => {
      const runtime = new CloudRuntime();
      let capturedSignal: AbortSignal | undefined;

      sendCloudMessage.mockImplementation(
        async (
          _conversationId: string,
          _content: string,
          _model: string,
          _onChunk: (text: string) => void,
          _onDone: () => void,
          _onError: (err: Error) => void,
          signal: AbortSignal,
        ) => {
          capturedSignal = signal;
          // Simulate a long-running stream that never resolves within the test.
          await new Promise(() => {});
        },
      );

      void runtime.sendMessage('conv_1', 'Hi');
      await vi.waitFor(() => expect(capturedSignal).toBeDefined());

      runtime.stopGeneration('conv_1');

      expect(capturedSignal?.aborted).toBe(true);
    });

    it('persists an in-flight canonical activity as cancelled when the user stops', async () => {
      const runtime = new CloudRuntime();

      sendCloudMessage.mockImplementation(
        async (
          _conversationId: string,
          _content: string,
          _model: string,
          _onChunk: (text: string) => void,
          _onDone: () => void,
          _onError: (err: Error) => void,
          _signal: AbortSignal,
          onEvent: (payload: Record<string, unknown>) => void,
        ) => {
          onEvent({
            choices: [
              {
                delta: {
                  x_agent_event: {
                    schemaVersion: 3,
                    sessionId: 'session-cancel',
                    turnId: 'turn-cancel',
                    sequence: 0,
                    emittedAtMs: 1_000,
                    event: { type: 'lifecycle', phase: 'started' },
                  },
                },
              },
            ],
          });
          await new Promise(() => {});
        },
      );

      void runtime.sendMessage('conv_cancel', 'Start a long task');
      await vi.waitFor(() => expect(saveMessage).toHaveBeenCalledTimes(1));

      runtime.stopGeneration('conv_cancel');

      await vi.waitFor(() => expect(saveMessage).toHaveBeenCalledTimes(2));
      expect(saveMessage).toHaveBeenNthCalledWith(
        2,
        'conv_cancel',
        expect.objectContaining({
          role: 'assistant',
          metadata: expect.objectContaining({
            agentActivity: expect.objectContaining({
              turnId: 'turn-cancel',
              status: 'cancelled',
            }),
          }),
        }),
      );
    });

    it('requests cancellation of the server-owned run when the user stops', async () => {
      const runtime = new CloudRuntime();

      sendCloudMessage.mockImplementation(async (...args: unknown[]) => {
        const onRunHandle = args[14] as (handle: { runId: string; runPath: string }) => void;
        onRunHandle({ runId: MANAGED_RUN_ID, runPath: MANAGED_RUN_PATH });
        await new Promise(() => {});
      });
      cancelRun.mockResolvedValue({ id: MANAGED_RUN_ID, state: 'cancelled' });

      void runtime.sendMessage('conv_server_cancel', 'Start a long task');
      await vi.waitFor(() => expect(sendCloudMessage).toHaveBeenCalledOnce());

      runtime.stopGeneration('conv_server_cancel');

      await vi.waitFor(() => expect(cancelRun).toHaveBeenCalledWith(MANAGED_RUN_ID));
    });
  });

  describe('runtime lifecycle', () => {
    it('disposes an active Cloud turn without emitting or persisting a synthetic failure', async () => {
      sendCloudMessage.mockImplementation(async (...args: unknown[]) => {
        const signal = args[6] as AbortSignal;
        const onRunHandle = args[14] as (handle: { runId: string; runPath: string }) => void;
        onRunHandle({ runId: MANAGED_RUN_ID, runPath: MANAGED_RUN_PATH });
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
      });

      const runtime = new CloudRuntime();
      const events = collectEvents(runtime);
      const send = runtime.sendMessage('conv_dispose', 'keep this private');
      await vi.waitFor(() => expect(sendCloudMessage).toHaveBeenCalledOnce());
      const savesBeforeDispose = saveMessage.mock.calls.length;
      const eventsBeforeDispose = [...events];

      await runtime.dispose();
      await send;

      expect(cancelRun).toHaveBeenCalledWith(
        MANAGED_RUN_ID,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(saveMessage).toHaveBeenCalledTimes(savesBeforeDispose);
      expect(events).toEqual(eventsBeforeDispose);
      await expect(runtime.sendMessage('conv_after_dispose', 'must not send')).rejects.toThrow(
        'no longer active',
      );
    });
  });

  describe('conversation CRUD', () => {
    it('createConversation sends a client-supplied UUID and maps the response', async () => {
      createConversation.mockResolvedValue({
        id: 'conv_1',
        title: 'New Conversation',
        model: 'claude-sonnet-5',
        projectId: null,
        pinned: false,
        isTemporary: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      const runtime = new CloudRuntime();
      const result = await runtime.createConversation('New Conversation');

      expect(createConversation).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'New Conversation', id: expect.any(String) }),
      );
      const callArg = createConversation.mock.calls[0]?.[0] as { id: string };
      expect(callArg.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(result.id).toBe('conv_1');
      expect(result.title).toBe('New Conversation');
    });

    it('deleteConversation delegates to the persistence client', async () => {
      const runtime = new CloudRuntime();
      await runtime.deleteConversation('conv_1');
      expect(deleteConversation).toHaveBeenCalledWith('conv_1');
    });

    it('renameConversation delegates to updateConversation', async () => {
      const runtime = new CloudRuntime();
      await runtime.renameConversation('conv_1', 'New title');
      expect(updateConversation).toHaveBeenCalledWith('conv_1', { title: 'New title' });
    });

    it('listConversations maps the normalized DTO to the lightweight shape', async () => {
      listConversations.mockResolvedValue({
        conversations: [
          {
            id: 'conv_1',
            title: 'Chat 1',
            projectId: null,
            pinned: false,
            isTemporary: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
        ],
        hasMore: false,
        nextOffset: 1,
      });

      const runtime = new CloudRuntime();
      const result = await runtime.listConversations();

      expect(result).toEqual([
        { id: 'conv_1', title: 'Chat 1', updatedAt: '2026-01-02T00:00:00.000Z' },
      ]);
    });
  });

  describe('message loading', () => {
    it('getMessages maps normalized contract messages', async () => {
      getConversation.mockResolvedValue({
        conversation: {
          id: 'conv_1',
          title: 'Chat 1',
          projectId: null,
          pinned: false,
          isTemporary: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        messages: [
          {
            id: 'm1',
            conversationId: 'conv_1',
            role: 'user',
            content: 'hi',
            inputTokens: 0,
            outputTokens: 0,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      });

      const runtime = new CloudRuntime();
      const messages = await runtime.getMessages('conv_1');

      expect(messages[0]).toEqual({
        id: 'm1',
        conversationId: 'conv_1',
        role: 'user',
        content: 'hi',
        createdAt: '2026-01-01T00:00:00.000Z',
        model: undefined,
      });
    });

    it('getMessages preserves persisted canonical activity metadata', async () => {
      const agentActivity = {
        schemaVersion: 1,
        sessionId: 'session-1',
        turnId: 'turn-1',
        status: 'completed',
        startedAtMs: 1_000,
        updatedAtMs: 2_000,
        completedAtMs: 2_000,
        lastSequence: 1,
        usage: {},
        entries: [],
      };
      getConversation.mockResolvedValue({
        conversation: {
          id: 'conv_1',
          title: 'Chat 1',
          projectId: null,
          pinned: false,
          isTemporary: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        messages: [
          {
            id: 'm1',
            conversationId: 'conv_1',
            role: 'assistant',
            content: String.fromCharCode(0x200b),
            inputTokens: 0,
            outputTokens: 0,
            createdAt: '2026-01-01T00:00:00.000Z',
            metadata: { agentActivity },
          },
        ],
      });

      const messages = await new CloudRuntime().getMessages('conv_1');

      expect(messages[0]?.metadata).toEqual({ agentActivity });
    });

    it('rehydrates pending approval cards from the validated cross-surface projection', async () => {
      const runId = '0190a000-0000-7000-8000-000000000099';
      const metadata = {
        cloudAgentRun: {
          runId,
          runPath: `/api/llm/v1/chat/completions/runs/${runId}`,
          lastSequence: 7,
          state: 'awaiting_input',
        },
        cloudApproval: {
          schemaVersion: 1,
          runId,
          calls: [
            {
              toolCallId: 'call_1',
              name: 'write_file',
              input: '{"path":"/REPORT.md"}',
              approvalDecision: 'approved',
            },
          ],
        },
      };
      getConversation.mockResolvedValue({
        conversation: {
          id: 'conv_1',
          title: 'Chat 1',
          projectId: null,
          pinned: false,
          isTemporary: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        messages: [
          {
            id: 'm1',
            conversationId: 'conv_1',
            role: 'assistant',
            content: 'Waiting.',
            model: 'gpt-5',
            inputTokens: 0,
            outputTokens: 0,
            createdAt: '2026-01-01T00:00:00.000Z',
            metadata,
          },
        ],
      });

      const [message] = await new CloudRuntime().getMessages('conv_1');

      expect(message?.toolCalls).toEqual([
        {
          id: 'call_1',
          name: 'write_file',
          args: { path: '/REPORT.md' },
          status: 'awaiting_approval',
          requiresApproval: true,
          approvalDecision: 'approved',
        },
      ]);
      expect(message?.metadata).toEqual(metadata);
    });

    it('loadMessages is an alias for getMessages', async () => {
      getConversation.mockResolvedValue({
        conversation: {
          id: 'conv_1',
          title: 'Chat 1',
          projectId: null,
          pinned: false,
          isTemporary: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        messages: [],
      });

      const runtime = new CloudRuntime();
      await expect(runtime.loadMessages('conv_1')).resolves.toEqual([]);
    });
  });

  describe('getPlatform', () => {
    it('returns desktop', () => {
      expect(new CloudRuntime().getPlatform()).toBe('desktop');
    });
  });

  describe('hasLiveApprovalTurn', () => {
    it('hydrates a server-owned approval checkpoint on a fresh runtime instance', () => {
      const runtime = new CloudRuntime();
      expect(
        runtime.hasLiveApprovalTurn('conv_1', {
          assistantMessageId: 'assistant-1',
          runId: '0190a000-0000-7000-8000-000000000099',
          model: 'gpt-5',
          assistantContent: '',
          calls: [{ toolCallId: 'call_1', name: 'read_file', args: {} }],
        }),
      ).toBe(true);
    });
  });
});

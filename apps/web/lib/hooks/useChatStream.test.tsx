import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import {
  FREE_QUOTA_FALLBACK_REQUEST_KEY,
  managedCloudAgentRunPath,
  MANAGED_CLOUD_AGENT_RUNS_BASE_PATH,
} from '@agiworkforce/cloud-contracts';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useThinkingStore } from '@shared/stores/thinking-store';
import { useStreamPhaseStore } from '@/features/chat/stores/stream-phase-store';
import { useFreeTrialStore } from '@/features/chat/stores/freeTrialStore';
import {
  listCanonicalModels,
  getProviderOfferings,
  getRoutingSlotModel,
  AGENT_EVENT_SCHEMA_VERSION,
} from '@agiworkforce/types';
import { EXPLICIT_ARTIFACT_DERIVATION_POLICY } from '@agiworkforce/artifacts';
import { savedMessageId } from '@/features/chat/lib/pending-message-saves';
import { useChatStream, saveMessageToDb } from './useChatStream';
import { IN_FLIGHT_TURN_RECHECK_MS } from './inFlightTurnRecovery';

const NON_REASONING_CHAT_MODEL = (() => {
  const model = listCanonicalModels().find(
    (candidate) =>
      ['chat', 'search', 'multimodal'].includes(candidate.modelType) &&
      candidate.reasoning?.capable !== true,
  );
  if (!model) throw new Error('Canonical non-reasoning chat fixture is missing');
  return model.id;
})();
const MINIMAL_EFFORT_CHAT_MODEL = (() => {
  const model = listCanonicalModels().find((candidate) =>
    candidate.reasoning?.supportedEfforts?.includes('minimal'),
  );
  if (!model) throw new Error('Canonical minimal-effort chat fixture is missing');
  return model.id;
})();

const authMocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  userId: 'user-1',
  isSignedIn: true,
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: authMocks.getToken,
    userId: authMocks.userId,
    isSignedIn: authMocks.isSignedIn,
    isLoaded: true,
  }),
}));

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: async () => 'csrf-token',
  addCsrfHeaders: async (headers: HeadersInit = {}) => ({
    ...headers,
    'x-csrf-token': 'csrf-token',
  }),
}));

const TEMP_CONVERSATION = {
  id: 'conv-temp',
  title: 'Temporary chat',
  createdAt: '2026-06-05T00:00:00.000Z',
  updatedAt: '2026-06-05T00:00:00.000Z',
  isTemporary: true,
};

const MANAGED_RUN_ID = '11111111-1111-4111-8111-111111111111';
const MANAGED_RUN_PATH = `/api/llm/v1/chat/completions/runs/${MANAGED_RUN_ID}`;

function managedRunHeaders(): Headers {
  return new Headers({
    'X-AGI-Agent-Run-Id': MANAGED_RUN_ID,
    'X-AGI-Agent-Run-URL': MANAGED_RUN_PATH,
  });
}

function managedRunSnapshot(
  state: 'running' | 'ready_for_review' | 'completed' | 'cancelled',
  events: unknown[],
  lastEventSequence: number,
) {
  return {
    run: {
      id: MANAGED_RUN_ID,
      userId: 'user-1',
      requestId: 'request-1',
      conversationId: TEMP_CONVERSATION.id,
      originSurface: 'web',
      workMode: 'agiwork',
      state,
      provider: 'openai',
      model: 'model-1',
      lastEventSequence,
      cancellationRequestedAt: state === 'cancelled' ? '2026-07-17T20:00:00.000Z' : null,
      completedAt:
        state === 'ready_for_review' || state === 'completed' || state === 'cancelled'
          ? '2026-07-17T20:00:00.000Z'
          : null,
      createdAt: '2026-07-17T19:00:00.000Z',
      updatedAt: '2026-07-17T20:00:00.000Z',
    },
    events,
    nextAfterSequence: lastEventSequence,
  };
}

const RECOVERED_CONVERSATION_ID = '8f2d3f5a-1c4e-4c3a-9f2b-6b0f9d3c1a77';
const NEXT_RUN_ID = '22222222-2222-4222-8222-222222222222';
const RECOVERY_PATH = `${MANAGED_CLOUD_AGENT_RUNS_BASE_PATH}?conversationId=${RECOVERED_CONVERSATION_ID}`;

function restoreRecoveredConversation(conversationId = RECOVERED_CONVERSATION_ID): void {
  useChatStore.setState({
    conversations: [{ ...TEMP_CONVERSATION, id: conversationId, isTemporary: false }],
  });
  useChatStore.getState().setActiveConversationWithMessages(conversationId, [
    {
      id: 'recovered-user',
      role: 'user',
      content: 'Still working?',
      createdAt: TEMP_CONVERSATION.createdAt,
    },
  ]);
}

function recoveredRunSnapshot(
  state: Parameters<typeof managedRunSnapshot>[0] = 'running',
  runId = MANAGED_RUN_ID,
) {
  const snapshot = managedRunSnapshot(state, [], -1);
  return {
    ...snapshot,
    run: { ...snapshot.run, id: runId, conversationId: RECOVERED_CONVERSATION_ID, staleForMs: 0 },
  };
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((resolveResponse) => {
    resolve = resolveResponse;
  });
  return { promise, resolve };
}

function mockLlmErrorResponse(body: unknown, status = 503) {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: new Headers(),
    }),
  );
}

function mockSseStream(events: unknown[]) {
  const lines = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  const body = lines + 'data: [DONE]\n\n';
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(stream, { status: 200, headers: new Headers() }),
  );
}

describe('useChatStream', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    useThinkingStore.getState().setEnabled(false);
    useFreeTrialStore.getState().clearLimitReached();
    useChatStore.setState({
      activeConversationId: TEMP_CONVERSATION.id,
      conversations: [TEMP_CONVERSATION],
    });
    authMocks.getToken.mockResolvedValue('session-token');
    authMocks.userId = 'user-1';
    authMocks.isSignedIn = true;
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps the specific conversation-start failure instead of replacing it with a generic notice', async () => {
    const { result } = renderHook(() => useChatStream());
    const message = 'This account is sending requests too quickly. Try again in about 60 seconds.';

    await act(async () => {
      await result.current.sendMessage('Hello', {
        conversationId: TEMP_CONVERSATION.id,
        ensureConversationId: async () => {
          useChatStore.getState().setError(message, TEMP_CONVERSATION.id);
          return null;
        },
      });
    });

    expect(useChatStore.getState().error).toBe(message);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows a reached free limit as a limit card, never as an error row', async () => {
    const chatOfferings = Object.entries(getProviderOfferings()).filter(
      ([, offering]) => offering.quotaProbeProtocol === 'chat',
    );
    const [limitedKey, limited] = chatOfferings[0]!;
    const [alternativeKey, alternative] = chatOfferings[1]!;
    const message = `${limited.displayName} has reached its free limit.`;
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'free_quota_exhausted',
            message,
            free_limit: {
              model: limitedKey,
              reason: 'allowance_used',
              alternative_model: alternativeKey,
            },
          },
        }),
        { status: 409 },
      ),
    );
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('Hello', {
        conversationId: TEMP_CONVERSATION.id,
        model: limitedKey,
      });
    });
    const assistant = useChatStore
      .getState()
      .messagesByConversation[TEMP_CONVERSATION.id]?.find((entry) => entry.role === 'assistant');
    expect(assistant?.content).toBe('');
    expect(assistant?.error).toBe(false);
    expect(assistant?.metadata?.paywall).toMatchObject({
      reason: message,
      freeLimit: {
        modelId: limitedKey,
        modelName: limited.displayName,
        reason: 'allowance_used',
        alternativeModel: { id: alternativeKey, name: alternative.displayName },
      },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('saves a reached free limit with its card, so a reload keeps the reply and the resend guard', async () => {
    const conversation = { ...TEMP_CONVERSATION, id: 'conv-free-limit', isTemporary: false };
    useChatStore.setState({ activeConversationId: conversation.id, conversations: [conversation] });
    const [limitedKey, limited] = Object.entries(getProviderOfferings()).find(
      ([, offering]) => offering.quotaProbeProtocol === 'chat',
    )!;
    const message = `${limited.displayName} has reached its free limit.`;
    const saves: Array<Record<string, unknown>> = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input).includes('/messages')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        saves.push(body);
        return new Response(JSON.stringify({ message: { id: body['id'] } }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          error: {
            code: 'free_quota_exhausted',
            message,
            free_limit: { model: limitedKey, reason: 'allowance_used' },
          },
        }),
        { status: 409 },
      );
    });

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('Hello', {
        conversationId: conversation.id,
        model: limitedKey,
      });
    });

    await vi.waitFor(() => expect(saves.some((body) => body['role'] === 'assistant')).toBe(true));
    const saved = saves.find((body) => body['role'] === 'assistant')!;
    expect(saved['content']).toBe(message);
    expect(saved['metadata']).toMatchObject({
      errorCode: 'free_quota_exhausted',
      paywall: {
        reason: message,
        freeLimit: { modelId: limitedKey, reason: 'allowance_used' },
      },
    });
    expect(saves.some((body) => body['role'] === 'user')).toBe(true);
  });

  it('lets a dismissal of the free limit card wait until the card has been saved', async () => {
    const conversation = { ...TEMP_CONVERSATION, id: 'conv-free-limit-save', isTemporary: false };
    useChatStore.setState({ activeConversationId: conversation.id, conversations: [conversation] });
    const [limitedKey, limited] = Object.entries(getProviderOfferings()).find(
      ([, offering]) => offering.quotaProbeProtocol === 'chat',
    )!;
    let answerCardSave!: () => void;
    const cardSaveAnswered = new Promise<void>((resolve) => {
      answerCardSave = resolve;
    });
    let cardSaveSent = false;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input).includes('/messages')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        if (body['role'] === 'assistant') {
          cardSaveSent = true;
          await cardSaveAnswered;
        }
        return new Response(JSON.stringify({ message: { id: body['id'] } }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          error: {
            code: 'free_quota_exhausted',
            message: `${limited.displayName} has reached its free limit.`,
            free_limit: { model: limitedKey, reason: 'allowance_used' },
          },
        }),
        { status: 409 },
      );
    });

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('Hello', {
        conversationId: conversation.id,
        model: limitedKey,
      });
    });
    await vi.waitFor(() => expect(cardSaveSent).toBe(true));
    const card = useChatStore
      .getState()
      .messagesByConversation[conversation.id]!.find(
        (message) => message.metadata?.paywall?.freeLimit !== undefined,
      )!;
    let settled = false;
    const saved = savedMessageId(card.id).then((id) => {
      settled = true;
      return id;
    });

    await act(async () => {
      await new Promise((settle) => setTimeout(settle, 20));
    });
    expect(settled).toBe(false);

    answerCardSave();
    await expect(saved).resolves.toBe(card.id);
  });

  it('shows the answer a ready free model gave when Free Auto had reached its limit', async () => {
    const freeRouter = getRoutingSlotModel('router_zero_cost');
    const [fallbackKey] = Object.entries(getProviderOfferings()).find(
      ([, offering]) => offering.provider === 'qwen' && offering.quotaProbeProtocol === 'chat',
    )!;
    const encoder = new TextEncoder();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  choices: [
                    { delta: { content: 'Answered by a free model.' }, finish_reason: 'stop' },
                  ],
                })}\n\ndata: [DONE]\n\n`,
              ),
            );
            controller.close();
          },
        }),
        {
          status: 200,
          headers: new Headers({
            'X-AGI-Fallback-Reason': 'free_limit_reached',
            'X-AGI-Resolved-Model': fallbackKey,
          }),
        },
      ),
    );

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('Hello', {
        conversationId: TEMP_CONVERSATION.id,
        model: freeRouter,
      });
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toBe('/api/llm/v1/chat/completions');
    const assistant = useChatStore
      .getState()
      .messagesByConversation[TEMP_CONVERSATION.id]?.find((entry) => entry.role === 'assistant');
    expect(assistant?.content).toBe('Answered by a free model.');
    expect(assistant?.model).toBe(fallbackKey);
    expect(assistant?.requestedModel).toBe(freeRouter);
    expect(assistant?.fallbackReason).toBe('free_limit_reached');
    expect(assistant?.metadata?.paywall).toBeUndefined();
  });

  it('tells the server it shows another free model answering for Free Auto', async () => {
    mockSseStream([{ choices: [{ delta: { content: 'Ready.' } }] }]);
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('Hello', {
        conversationId: TEMP_CONVERSATION.id,
        model: getRoutingSlotModel('router_zero_cost'),
      });
    });

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)) as Record<
      string,
      unknown
    >;
    expect(body[FREE_QUOTA_FALLBACK_REQUEST_KEY]).toBe(true);
  });

  it('shows the free limit card, without reading the free catalogue, when Free Auto is refused', async () => {
    const freeRouter = getRoutingSlotModel('router_zero_cost');
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 'free_allowance_exhausted',
            message: 'The free model has used up the allowance everyone on the Free plan shares.',
          },
        }),
        { status: 429 },
      ),
    );

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('Hello', {
        conversationId: TEMP_CONVERSATION.id,
        model: freeRouter,
      });
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const assistant = useChatStore
      .getState()
      .messagesByConversation[TEMP_CONVERSATION.id]?.find((entry) => entry.role === 'assistant');
    expect(assistant?.metadata?.paywall?.freeLimit).toMatchObject({
      modelId: freeRouter,
      reason: 'shared_pool_used',
    });
  });

  it('carries the reset time a usage refusal names onto its card', async () => {
    const resetsAt = '2099-01-01T00:00:00.000Z';
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'monthly_limit_exceeded',
            message: 'Usage budget exhausted for this billing period.',
            resets_at: resetsAt,
          },
        }),
        { status: 402 },
      ),
    );
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('Hello', { conversationId: TEMP_CONVERSATION.id });
    });
    const assistant = useChatStore
      .getState()
      .messagesByConversation[TEMP_CONVERSATION.id]?.find((entry) => entry.role === 'assistant');
    expect(assistant?.metadata?.paywall?.resetAt).toBe(resetsAt);
  });

  it('keeps artifact formatting instructions out of the visible and persisted user turn', async () => {
    mockSseStream([{ choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] }]);
    const prompt = 'Create an HTML artifact that says hello.';
    const artifactInstruction =
      'Answer with one ```html block. Put <!-- @artifact --> on the first line.';

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage(prompt, {
        conversationId: TEMP_CONVERSATION.id,
        artifactInstruction,
      });
    });

    const userMessage = useChatStore.getState().messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toBe(prompt);
    const completionCall = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input).includes('/api/llm/'));
    const request = JSON.parse(String(completionCall?.[1]?.body ?? '{}')) as {
      messages?: Array<{ role: string; content: string }>;
    };
    expect(request.messages?.[0]).toEqual({ role: 'system', content: artifactInstruction });
    expect(request.messages?.at(-1)).toMatchObject({ role: 'user', content: prompt });
  });

  it('sends only the current text prompt to a promotional media route in a long conversation', async () => {
    const offeringKey = Object.entries(getProviderOfferings()).find(
      ([, offering]) => offering.quotaProbeProtocol === 'image-sync',
    )![0];
    useChatStore.getState().addMessage(
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: 'Earlier conversation context must not become a generation prompt.',
        createdAt: new Date().toISOString(),
      },
      TEMP_CONVERSATION.id,
    );
    mockSseStream([
      {
        choices: [
          { delta: { content: '![Generated image](</api/files/fixture>)' }, finish_reason: 'stop' },
        ],
      },
    ]);

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('Draw a blue paper boat', {
        conversationId: TEMP_CONVERSATION.id,
        model: offeringKey,
      });
    });

    const completionCall = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input).includes('/api/models/free-quota/completions'));
    expect(completionCall).toBeDefined();
    const request = JSON.parse(String(completionCall?.[1]?.body ?? '{}')) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(request.model).toBe(offeringKey);
    expect(request.messages).toEqual([{ role: 'user', content: 'Draw a blue paper boat' }]);
  });

  it('omits prior attachment parts when a new text turn switches to a promotional chat route', async () => {
    const offeringKey = Object.entries(getProviderOfferings()).find(
      ([, offering]) => offering.quotaProbeProtocol === 'chat' && offering.provider === 'qwen',
    )![0];
    useChatStore.getState().addMessage(
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: 'What does the image say?',
        attachments: [
          { id: 'fixture-image', assetId: 'fixture-asset', type: 'image', name: 'fixture.png' },
        ],
        createdAt: new Date().toISOString(),
      },
      TEMP_CONVERSATION.id,
    );
    mockSseStream([{ choices: [{ delta: { content: 'hello' }, finish_reason: 'stop' }] }]);

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('Reply with hello.', {
        conversationId: TEMP_CONVERSATION.id,
        model: offeringKey,
      });
    });

    const completionCall = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input).includes('/api/models/free-quota/completions'));
    const request = JSON.parse(String(completionCall?.[1]?.body ?? '{}')) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(request.messages.every((message) => typeof message.content === 'string')).toBe(true);
    expect(request.messages[0]?.content).toContain(
      'attachment in this earlier message is unavailable',
    );
    expect(request.messages.at(-1)).toMatchObject({ role: 'user', content: 'Reply with hello.' });
  });

  it('projects a generated Free video file into the existing inline video player', async () => {
    const offeringKey = Object.entries(getProviderOfferings()).find(
      ([, offering]) => offering.quotaProbeProtocol === 'video-async',
    )![0];
    const videoUrl = '/api/files/00000000-0000-4000-8000-000000000001';
    mockSseStream([
      {
        choices: [
          {
            delta: { content: `[View generated video](<${videoUrl}>)` },
            finish_reason: 'stop',
          },
        ],
      },
    ]);

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('Animate a blue paper boat', {
        conversationId: TEMP_CONVERSATION.id,
        model: offeringKey,
      });
    });

    const assistant = useChatStore
      .getState()
      .messagesByConversation[TEMP_CONVERSATION.id]?.find((entry) => entry.role === 'assistant');
    expect(assistant?.content).toBe('Video generated.');
    expect(assistant?.metadata).toMatchObject({
      toolType: 'video-generation',
      videoStatus: 'completed',
      videoUrl,
    });
  });

  it('does not turn an arbitrary provider video link into a generated-file player', async () => {
    const offeringKey = Object.entries(getProviderOfferings()).find(
      ([, offering]) => offering.quotaProbeProtocol === 'video-async',
    )![0];
    const link = '[View generated video](<https://untrusted.example/video.mp4>)';
    mockSseStream([{ choices: [{ delta: { content: link }, finish_reason: 'stop' }] }]);

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('Animate a blue paper boat', {
        conversationId: TEMP_CONVERSATION.id,
        model: offeringKey,
      });
    });

    const assistant = useChatStore
      .getState()
      .messagesByConversation[TEMP_CONVERSATION.id]?.find((entry) => entry.role === 'assistant');
    expect(assistant?.content).toBe(link);
    expect(assistant?.metadata?.videoUrl).toBeUndefined();
  });

  describe('auth failure at send time', () => {
    it('surfaces an error but keeps the optimistically painted message when the token is unavailable', async () => {
      authMocks.getToken.mockResolvedValueOnce(null);
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('this must not vanish silently', {
          conversationId: TEMP_CONVERSATION.id,
        });
      });

      expect(useChatStore.getState().error).toBeTruthy();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(
        useChatStore.getState().messages.some((m) => m.content === 'this must not vanish silently'),
      ).toBe(true);
    });
  });

  // A dropped connection used to reach the transcript as the browser's own
  // wording, so someone whose wifi died read "Error: Failed to fetch" and had
  // nothing to act on. The funnel now names the condition instead.
  describe('network failure wording', () => {
    it('says the connection failed rather than leaking "Failed to fetch"', async () => {
      vi.mocked(fetch).mockImplementation(async (input) => {
        if (String(input).includes('/api/llm/v1/chat/completions')) {
          throw new TypeError('Failed to fetch');
        }
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      });

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('does the wifi matter', {
          conversationId: TEMP_CONVERSATION.id,
        });
      });

      const visible = [
        useChatStore.getState().error ?? '',
        ...useChatStore.getState().messages.map((m) => m.content ?? ''),
      ].join('\n');

      expect(visible).not.toContain('Failed to fetch');
      expect(visible).toContain('Could not reach the server.');
    });
  });

  describe('durable user-turn admission', () => {
    const persistedConversation = {
      ...TEMP_CONVERSATION,
      id: 'conv-durable-admission',
      isTemporary: false,
    };

    it('admits the durable user row through the completion request without a client save round trip', async () => {
      useChatStore.setState({
        activeConversationId: persistedConversation.id,
        conversations: [persistedConversation],
      });
      const calls: string[] = [];
      let completionBody: Record<string, unknown> | undefined;
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes('/messages')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
          calls.push(`save:${String(body['role'])}`);
          return new Response(JSON.stringify({ message: { id: body['id'] } }), { status: 200 });
        }
        if (url.includes('/api/llm/')) {
          calls.push('completion');
          completionBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  `data: ${JSON.stringify({ choices: [{ delta: { content: 'Admitted.' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
                ),
              );
              controller.close();
            },
          });
          return new Response(stream, { status: 200, headers: new Headers() });
        }
        return new Response('{}', { status: 200 });
      });

      const { result } = renderHook(() => useChatStream());
      const onTurnCommitted = vi.fn();
      await act(async () => {
        await result.current.sendMessage('admit this exact turn', {
          conversationId: persistedConversation.id,
          onTurnCommitted,
        });
      });

      await vi.waitFor(() => expect(calls).toEqual(['completion', 'save:assistant']));
      expect(completionBody?.['user_message']).toMatchObject({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      });
      expect(onTurnCommitted).toHaveBeenCalledOnce();
    });

    it('surfaces a server-side admission failure without falling back to the old message endpoint', async () => {
      useChatStore.setState({
        activeConversationId: persistedConversation.id,
        conversations: [persistedConversation],
      });
      const calls: string[] = [];
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes('/api/llm/')) {
          calls.push('completion');
          return new Response(
            JSON.stringify({
              error: {
                message: 'Your message could not be saved. No model request was sent.',
                code: 'user_message_persistence_failed',
              },
            }),
            { status: 503 },
          );
        }
        if (url.includes('/messages')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
          calls.push(`save:${String(body['role'])}`);
        }
        return new Response('{}', { status: 200 });
      });

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('do not bill this', {
          conversationId: persistedConversation.id,
        });
      });

      expect(calls).toEqual(['completion', 'save:user', 'save:assistant']);
      expect(
        useChatStore
          .getState()
          .messagesByConversation[persistedConversation.id]?.some(
            (message) => message.content === 'do not bill this',
          ),
      ).toBe(true);
      expect(useChatStore.getState().error).toBe(
        'Your message could not be saved. No model request was sent.',
      );
    });
  });

  describe('canonical x_agent_event activity', () => {
    it('renders a retried canonical text event exactly once', async () => {
      const textEnvelope = {
        schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
        sessionId: TEMP_CONVERSATION.id,
        turnId: 'turn-retried-text',
        sequence: 0,
        emittedAtMs: 1_000,
        event: { type: 'text-delta', delta: 'Verified once.' },
      } as const;
      const retriedText = {
        choices: [{ delta: { content: 'Verified once.', x_agent_event: textEnvelope } }],
      };
      mockSseStream([
        retriedText,
        retriedText,
        {
          choices: [
            {
              delta: {
                x_agent_event: {
                  ...textEnvelope,
                  sequence: 1,
                  emittedAtMs: 1_100,
                  event: { type: 'stop', reason: 'end-turn' },
                },
              },
              finish_reason: 'stop',
            },
          ],
        },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('retry safely', {
          conversationId: TEMP_CONVERSATION.id,
        });
      });

      const assistant = useChatStore
        .getState()
        .messages.find((message) => message.role === 'assistant');
      expect(assistant?.content).toBe('Verified once.');
      expect(assistant?.metadata?.agentActivity?.lastSequence).toBe(1);
    });

    it('settles activity the stream never stopped, so a finished turn stops saying "Working"', async () => {
      const base = {
        schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
        sessionId: TEMP_CONVERSATION.id,
        turnId: 'turn-activity-unstopped',
      };
      mockSseStream([
        {
          choices: [
            {
              delta: {
                x_agent_event: {
                  ...base,
                  sequence: 0,
                  emittedAtMs: 1_000,
                  event: { type: 'lifecycle', phase: 'started' },
                },
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                content: 'Research complete.',
                x_agent_event: {
                  ...base,
                  sequence: 1,
                  emittedAtMs: 1_500,
                  event: { type: 'text-delta', delta: 'Research complete.' },
                },
              },
              finish_reason: 'stop',
            },
          ],
        },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('research this', {
          conversationId: TEMP_CONVERSATION.id,
        });
      });

      const assistant = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      expect(assistant?.metadata?.agentActivity).toMatchObject({
        turnId: 'turn-activity-unstopped',
        status: 'completed',
        stopReason: 'end-turn',
      });
    });

    it('validates, reduces, and keeps canonical activity on the assistant message', async () => {
      const base = {
        schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
        sessionId: TEMP_CONVERSATION.id,
        turnId: 'turn-activity-1',
      };
      mockSseStream([
        {
          choices: [
            {
              delta: {
                x_agent_event: {
                  ...base,
                  sequence: 0,
                  emittedAtMs: 1_000,
                  event: { type: 'lifecycle', phase: 'started' },
                },
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                x_agent_event: {
                  ...base,
                  sequence: 1,
                  emittedAtMs: 1_100,
                  event: {
                    type: 'tool-execution-start',
                    toolCallId: 'search-1',
                    name: 'web_search',
                    category: 'web-search',
                    summary: 'Searching official sources',
                    input: { query: 'official docs' },
                  },
                },
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                x_agent_event: {
                  ...base,
                  sequence: 1,
                  emittedAtMs: 1_150,
                  event: { type: 'error', message: 'duplicate must be ignored' },
                },
              },
            },
          ],
        },
        { choices: [{ delta: { x_agent_event: { schemaVersion: 999 } } }] },
        {
          choices: [
            {
              delta: {
                x_agent_event: {
                  ...base,
                  sequence: 2,
                  emittedAtMs: 1_900,
                  event: {
                    type: 'tool-execution-end',
                    toolCallId: 'search-1',
                    name: 'web_search',
                    output: { matches: 3 },
                    isError: false,
                    elapsedMs: 800,
                  },
                },
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                content: 'Verified answer.',
                x_agent_event: {
                  ...base,
                  sequence: 3,
                  emittedAtMs: 2_000,
                  event: { type: 'stop', reason: 'end-turn' },
                },
              },
              finish_reason: 'stop',
            },
          ],
        },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('research this', {
          conversationId: TEMP_CONVERSATION.id,
        });
      });

      const assistant = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      expect(assistant?.metadata?.agentActivity).toMatchObject({
        sessionId: TEMP_CONVERSATION.id,
        turnId: 'turn-activity-1',
        lastSequence: 3,
        status: 'completed',
        stopReason: 'end-turn',
      });
      expect(assistant?.metadata?.agentActivity?.entries).toEqual([
        expect.objectContaining({
          kind: 'tool',
          toolCallId: 'search-1',
          summary: 'Searching official sources',
          status: 'completed',
          elapsedMs: 800,
        }),
      ]);
      expect(JSON.stringify(assistant?.metadata?.agentActivity)).not.toContain(
        'duplicate must be ignored',
      );
    });

    it('persists canonical activity in the assistant message payload', async () => {
      const conversation = {
        ...TEMP_CONVERSATION,
        id: 'conv-agent-activity-persist',
        isTemporary: false,
      };
      useChatStore.setState({
        conversations: [conversation],
        activeConversationId: conversation.id,
      });

      const base = {
        schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
        sessionId: conversation.id,
        turnId: 'turn-persisted-activity',
      };
      const streamBody =
        [
          {
            choices: [
              {
                delta: {
                  x_agent_event: {
                    ...base,
                    sequence: 0,
                    emittedAtMs: 1_000,
                    event: { type: 'lifecycle', phase: 'started' },
                  },
                },
              },
            ],
          },
          {
            choices: [
              {
                delta: {
                  content: 'Done.',
                  x_agent_event: {
                    ...base,
                    sequence: 1,
                    emittedAtMs: 1_500,
                    event: { type: 'stop', reason: 'end-turn' },
                  },
                },
                finish_reason: 'stop',
              },
            ],
          },
        ]
          .map((event) => `data: ${JSON.stringify(event)}\n\n`)
          .join('') + 'data: [DONE]\n\n';

      const saveBodies: Array<Record<string, unknown>> = [];
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes('/api/llm/')) {
          const encoder = new TextEncoder();
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(encoder.encode(streamBody));
                controller.close();
              },
            }),
            { status: 200, headers: new Headers() },
          );
        }
        if (url.includes('/messages')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
          saveBodies.push(body);
          return new Response(JSON.stringify({ message: { id: body['id'] ?? 'saved-message' } }), {
            status: 200,
          });
        }
        return new Response('{}', { status: 200 });
      });

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('persist this run', { conversationId: conversation.id });
      });

      await vi.waitFor(() =>
        expect(saveBodies.some((body) => body['role'] === 'assistant')).toBe(true),
      );
      const assistant = saveBodies.find((body) => body['role'] === 'assistant');
      expect((assistant?.['metadata'] as Record<string, unknown>)?.['agentActivity']).toMatchObject(
        {
          schemaVersion: 1,
          sessionId: conversation.id,
          turnId: 'turn-persisted-activity',
          status: 'completed',
          stopReason: 'end-turn',
        },
      );
    });
  });

  describe('durable Managed Cloud runs', () => {
    it('shows an action status for ordinary chat before the provider responds', async () => {
      let resolveResponse: ((response: Response) => void) | undefined;
      vi.mocked(fetch).mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveResponse = resolve;
          }),
      );
      // The first response below is a content-free completion, so it trips the
      // silent empty-turn retry (see useChatStream's isEmptyAssistantTurn) --
      // this default covers that second, retried provider call.
      vi.mocked(fetch).mockResolvedValue(new Response('data: [DONE]\n\n', { status: 200 }));

      const { result } = renderHook(() => useChatStream());
      let send: Promise<boolean> | undefined;
      act(() => {
        send = result.current.sendMessage('answer this question', {
          conversationId: TEMP_CONVERSATION.id,
        });
      });

      await vi.waitFor(() => {
        const assistant = useChatStore.getState().messages.find((m) => m.role === 'assistant');
        expect(assistant?.metadata?.agentActivity).toMatchObject({
          status: 'running',
          entries: [
            expect.objectContaining({
              kind: 'progress',
              summary: 'Connecting to the model',
              status: 'running',
            }),
          ],
        });
      });

      await vi.waitFor(() => expect(resolveResponse).toBeTypeOf('function'));
      resolveResponse?.(new Response('data: [DONE]\n\n', { status: 200 }));
      await send;

      const assistant = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      expect(assistant?.metadata?.agentActivity).toMatchObject({
        status: 'completed',
        entries: [expect.objectContaining({ summary: 'Response ready', status: 'completed' })],
      });
    });

    it('shows an AGI Work action state before the provider emits its first event', async () => {
      let resolveResponse: ((response: Response) => void) | undefined;
      vi.mocked(fetch).mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveResponse = resolve;
          }),
      );

      const { result } = renderHook(() => useChatStream());
      let send: Promise<boolean> | undefined;
      act(() => {
        send = result.current.sendMessage('start the workspace task', {
          conversationId: TEMP_CONVERSATION.id,
          workMode: 'agiwork',
        });
      });

      await vi.waitFor(() => {
        const assistant = useChatStore.getState().messages.find((m) => m.role === 'assistant');
        expect(assistant?.metadata?.agentActivity).toMatchObject({
          status: 'running',
          entries: [
            expect.objectContaining({
              kind: 'progress',
              summary: 'Starting AGI Work',
              status: 'running',
            }),
          ],
        });
      });

      await vi.waitFor(() => expect(resolveResponse).toBeTypeOf('function'));
      resolveResponse?.(
        new Response('data: [DONE]\n\n', { status: 200, headers: managedRunHeaders() }),
      );
      await send;
    });

    it('keeps the validated run handle and replay cursor on the assistant message', async () => {
      const base = {
        schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
        sessionId: TEMP_CONVERSATION.id,
        turnId: 'turn-run-reference',
      };
      const body =
        `data: ${JSON.stringify({
          choices: [
            {
              delta: {
                content: 'Done.',
                x_agent_event: {
                  ...base,
                  sequence: 0,
                  emittedAtMs: 1_000,
                  event: { type: 'stop', reason: 'end-turn' },
                },
              },
              finish_reason: 'stop',
            },
          ],
        })}\n\n` + 'data: [DONE]\n\n';
      const encoder = new TextEncoder();
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(body));
              controller.close();
            },
          }),
          { status: 200, headers: managedRunHeaders() },
        ),
      );

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('finish this', {
          conversationId: TEMP_CONVERSATION.id,
          workMode: 'agiwork',
        });
      });

      const assistant = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      expect(assistant?.metadata?.cloudAgentRun).toEqual({
        runId: MANAGED_RUN_ID,
        runPath: MANAGED_RUN_PATH,
        state: 'ready_for_review',
        lastSequence: 0,
        detachable: false,
      });
      expect(useChatStore.getState().isLoading).toBe(false);
      const requests = vi.mocked(fetch).mock.calls.length;
      act(() => result.current.stopGeneration());
      await act(async () => {});
      expect(fetch).toHaveBeenCalledTimes(requests);
      expect(useChatStore.getState().isLoading).toBe(false);
    });

    it('replays only missing journal events when the initial SSE connection drops', async () => {
      const base = {
        schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
        sessionId: TEMP_CONVERSATION.id,
        turnId: 'turn-reconnect',
      };
      const event = (sequence: number, agentEvent: Record<string, unknown>) => ({
        ...base,
        sequence,
        emittedAtMs: 1_000 + sequence,
        event: agentEvent,
      });
      const encoder = new TextEncoder();
      let streamPulls = 0;

      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url === '/api/llm/v1/chat/completions') {
          return new Response(
            new ReadableStream({
              pull(controller) {
                if (streamPulls === 0) {
                  streamPulls += 1;
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        choices: [
                          {
                            delta: {
                              content: 'Partial ',
                              x_agent_event: event(0, {
                                type: 'lifecycle',
                                phase: 'started',
                              }),
                            },
                          },
                        ],
                      })}\n\n`,
                    ),
                  );
                  return;
                }
                controller.error(new TypeError('network connection lost'));
              },
            }),
            { status: 200, headers: managedRunHeaders() },
          );
        }
        if (url === `${MANAGED_RUN_PATH}?after=0&limit=100`) {
          expect(init?.headers).toEqual({ Authorization: 'Bearer session-token' });
          return new Response(
            JSON.stringify(
              managedRunSnapshot(
                'ready_for_review',
                [
                  event(1, { type: 'text-delta', delta: 'Partial ' }),
                  event(2, { type: 'text-delta', delta: 'recovered answer' }),
                  event(3, {
                    type: 'task-state-changed',
                    taskId: 'turn-reconnect',
                    state: 'ready_for_review',
                    previousState: 'running',
                    summary: 'Ready for review.',
                  }),
                  event(4, { type: 'stop', reason: 'end-turn' }),
                ],
                4,
              ),
            ),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      });

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('keep working', {
          conversationId: TEMP_CONVERSATION.id,
          workMode: 'agiwork',
        });
      });

      const assistant = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      expect(assistant?.content).toBe('Partial recovered answer');
      expect(assistant?.error).not.toBe(true);
      expect(assistant?.metadata?.cloudAgentRun).toEqual({
        runId: MANAGED_RUN_ID,
        runPath: MANAGED_RUN_PATH,
        lastSequence: 4,
        state: 'ready_for_review',
        cancellationRequestedAt: null,
        detachable: false,
      });
      expect(assistant?.metadata?.agentActivity).toMatchObject({
        lastSequence: 4,
        status: 'completed',
      });
    });

    /**
     * The route detaches on its own budget rather than riding to the platform
     * kill at 800 s. A clean SSE close with no terminal frame reads to the
     * client as a finished turn, so the detach is explicit and the client picks
     * the run up from the journal.
     */
    it('re-attaches through the journal when the server detaches a still-working run', async () => {
      const base = {
        schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
        sessionId: TEMP_CONVERSATION.id,
        turnId: 'turn-detach',
      };
      const event = (sequence: number, agentEvent: Record<string, unknown>) => ({
        ...base,
        sequence,
        emittedAtMs: 2_000 + sequence,
        event: agentEvent,
      });
      const encoder = new TextEncoder();

      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === '/api/llm/v1/chat/completions') {
          const frames =
            `data: ${JSON.stringify({
              choices: [
                {
                  delta: {
                    content: 'Still ',
                    x_agent_event: event(0, { type: 'lifecycle', phase: 'started' }),
                  },
                },
              ],
            })}\n\n` +
            `data: ${JSON.stringify({
              choices: [{ delta: { x_run_detached: { reason: 'function_budget' } }, index: 0 }],
            })}\n\n` +
            'data: [DONE]\n\n';
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(encoder.encode(frames));
                controller.close();
              },
            }),
            { status: 200, headers: managedRunHeaders() },
          );
        }
        if (url.startsWith(MANAGED_RUN_PATH)) {
          return new Response(
            JSON.stringify(
              managedRunSnapshot(
                'ready_for_review',
                [
                  event(1, { type: 'text-delta', delta: 'Still ' }),
                  event(2, { type: 'text-delta', delta: 'working, then done' }),
                  event(3, { type: 'stop', reason: 'end-turn' }),
                ],
                3,
              ),
            ),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      });

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('keep working', {
          conversationId: TEMP_CONVERSATION.id,
          workMode: 'agiwork',
        });
      });

      const assistant = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      expect(assistant?.content).toBe('Still working, then done');
      expect(assistant?.error).not.toBe(true);
      expect(assistant?.metadata?.cloudAgentRun?.state).toBe('ready_for_review');
      expect(
        vi.mocked(fetch).mock.calls.filter(([url]) => String(url).startsWith(MANAGED_RUN_PATH)),
      ).not.toHaveLength(0);
    });

    it('sends Stop to the active server run instead of cancelling only the browser stream', async () => {
      const encoder = new TextEncoder();
      let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
      const cancellationCalls: Array<{ url: string; init?: RequestInit }> = [];

      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url === '/api/llm/v1/chat/completions') {
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              streamController = controller;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ choices: [{ delta: { content: 'Working' } }] })}\n\n`,
                ),
              );
              init?.signal?.addEventListener(
                'abort',
                () => controller.error(new DOMException('Stopped', 'AbortError')),
                { once: true },
              );
            },
          });
          return new Response(stream, { status: 200, headers: managedRunHeaders() });
        }
        if (url === MANAGED_RUN_PATH && init?.method === 'POST') {
          cancellationCalls.push({ url, init });
          return new Response(
            JSON.stringify({ run: managedRunSnapshot('cancelled', [], -1).run }),
            { status: 202, headers: { 'Content-Type': 'application/json' } },
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      });

      const { result } = renderHook(() => useChatStream());
      let send: Promise<boolean> | undefined;
      act(() => {
        send = result.current.sendMessage('do a long task', {
          conversationId: TEMP_CONVERSATION.id,
          workMode: 'agiwork',
        });
      });
      await vi.waitFor(() => {
        const assistant = useChatStore.getState().messages.find((m) => m.role === 'assistant');
        expect(assistant?.metadata?.cloudAgentRun?.runId).toBe(MANAGED_RUN_ID);
      });

      act(() => result.current.stopGeneration());
      await send;
      await vi.waitFor(() => expect(cancellationCalls).toHaveLength(1));
      const headers = cancellationCalls[0]?.init?.headers as Record<string, string>;
      expect(headers).toEqual({
        Authorization: 'Bearer session-token',
        'x-csrf-token': 'csrf-token',
      });
      expect(streamController).toBeDefined();
    });
  });

  describe('Stop after recovering a cloud turn', () => {
    beforeEach(() => {
      restoreRecoveredConversation();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('cancels the recovered server run with auth and csrf without a browser stream', async () => {
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        if (String(input) === RECOVERY_PATH) {
          return new Response(JSON.stringify({ runs: [recoveredRunSnapshot().run] }));
        }
        if (String(input) === MANAGED_RUN_PATH && init?.method === 'POST') {
          return new Response(JSON.stringify({ run: recoveredRunSnapshot('cancelled').run }), {
            status: 202,
          });
        }
        throw new Error(`Unexpected request: ${String(input)}`);
      });
      const { result } = renderHook(() => useChatStream());
      await vi.waitFor(() => expect(useChatStore.getState().isLoading).toBe(true));
      expect(useChatStore.getState().messages.map((message) => message.role)).toEqual(['user']);

      act(() => result.current.stopGeneration());

      await vi.waitFor(() => expect(useChatStore.getState().isLoading).toBe(false));
      const cancellationCalls = vi
        .mocked(fetch)
        .mock.calls.filter(
          ([input, init]) => String(input) === MANAGED_RUN_PATH && init?.method === 'POST',
        );
      expect(cancellationCalls).toHaveLength(1);
      expect(cancellationCalls[0]?.[1]?.headers).toEqual({
        Authorization: 'Bearer session-token',
        'x-csrf-token': 'csrf-token',
      });
      expect(useChatStore.getState().messages[0]?.turnDetachable).toBeUndefined();
    });

    it('claims one cancellation while repeated Stop waits for a terminal server response', async () => {
      const cancellation = deferredResponse();
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        if (String(input) === RECOVERY_PATH) {
          return new Response(JSON.stringify({ runs: [recoveredRunSnapshot().run] }));
        }
        if (String(input) === MANAGED_RUN_PATH && init?.method === 'POST')
          return cancellation.promise;
        throw new Error(`Unexpected request: ${String(input)}`);
      });
      const { result } = renderHook(() => useChatStream());
      await vi.waitFor(() => expect(useChatStore.getState().isLoading).toBe(true));
      act(() => {
        result.current.stopGeneration();
        result.current.stopGeneration();
      });
      await vi.waitFor(() =>
        expect(
          vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST'),
        ).toHaveLength(1),
      );
      expect(useChatStore.getState().isLoading).toBe(true);

      await act(async () =>
        cancellation.resolve(
          new Response(JSON.stringify({ run: recoveredRunSnapshot('cancelled').run })),
        ),
      );

      await vi.waitFor(() => expect(useChatStore.getState().isLoading).toBe(false));
    });

    it('retires a recovered run that completes naturally before Stop', async () => {
      vi.useFakeTimers();
      let probes = 0;
      vi.mocked(fetch).mockImplementation(async (input) => {
        if (String(input) !== RECOVERY_PATH)
          throw new Error(`Unexpected request: ${String(input)}`);
        return new Response(
          JSON.stringify({ runs: probes++ === 0 ? [recoveredRunSnapshot().run] : [] }),
        );
      });
      const { result } = renderHook(() => useChatStream());
      await act(async () => {});
      expect(useChatStore.getState().isLoading).toBe(true);

      await act(async () => vi.advanceTimersByTimeAsync(IN_FLIGHT_TURN_RECHECK_MS));

      expect(probes).toBe(2);
      expect(useChatStore.getState().isLoading).toBe(false);
      act(() => result.current.stopGeneration());
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it.each(['http failure', 'invalid listing', 'invalid json', 'network failure'] as const)(
      'keeps a recovered run uncertain after a %s until a verified terminal listing',
      async (failure) => {
        vi.useFakeTimers();
        let probes = 0;
        vi.mocked(fetch).mockImplementation(async (input) => {
          if (String(input) !== RECOVERY_PATH)
            throw new Error(`Unexpected request: ${String(input)}`);
          probes += 1;
          if (probes === 1)
            return new Response(JSON.stringify({ runs: [recoveredRunSnapshot().run] }));
          if (probes === 2) {
            if (failure === 'network failure') throw new TypeError('Network request failed');
            if (failure === 'http failure') return new Response('unavailable', { status: 503 });
            if (failure === 'invalid json') return new Response('{');
            return new Response(JSON.stringify({ runs: { state: 'completed' } }));
          }
          return new Response(JSON.stringify({ runs: [recoveredRunSnapshot('completed').run] }));
        });
        const { result } = renderHook(() => useChatStream());
        await act(async () => {});
        expect(useChatStore.getState().isLoading).toBe(true);

        await act(async () => vi.advanceTimersByTimeAsync(IN_FLIGHT_TURN_RECHECK_MS));

        expect(probes).toBe(2);
        expect(useChatStore.getState().isLoading).toBe(true);
        expect(useChatStore.getState().error).toBeNull();
        await act(async () => vi.advanceTimersByTimeAsync(IN_FLIGHT_TURN_RECHECK_MS));
        expect(probes).toBe(3);
        expect(useChatStore.getState().isLoading).toBe(false);
        act(() => result.current.stopGeneration());
        expect(fetch).toHaveBeenCalledTimes(3);
      },
    );

    it('can cancel the verified recovered handle after a failed recheck', async () => {
      vi.useFakeTimers();
      let probes = 0;
      let cancellations = 0;
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        if (String(input) === RECOVERY_PATH)
          return probes++ === 0
            ? new Response(JSON.stringify({ runs: [recoveredRunSnapshot().run] }))
            : new Response('unavailable', { status: 503 });
        if (String(input) === MANAGED_RUN_PATH && init?.method === 'POST') {
          cancellations += 1;
          return new Response(JSON.stringify({ run: recoveredRunSnapshot('cancelled').run }));
        }
        throw new Error(`Unexpected request: ${String(input)}`);
      });
      const { result } = renderHook(() => useChatStream());
      await act(async () => {});
      await act(async () => vi.advanceTimersByTimeAsync(IN_FLIGHT_TURN_RECHECK_MS));

      await act(async () => result.current.stopGeneration());

      expect(probes).toBe(2);
      expect(cancellations).toBe(1);
      expect(useChatStore.getState().isLoading).toBe(false);
    });

    it('keeps a failed cancellation retryable and reports the failure', async () => {
      const error = vi.spyOn(toast, 'error').mockReturnValue('stop-error');
      let attempts = 0;
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        if (String(input) === RECOVERY_PATH) {
          return new Response(JSON.stringify({ runs: [recoveredRunSnapshot().run] }));
        }
        if (String(input) === MANAGED_RUN_PATH && init?.method === 'POST') {
          attempts += 1;
          return attempts === 1
            ? new Response('not stopped', { status: 503 })
            : new Response(JSON.stringify({ run: recoveredRunSnapshot('cancelled').run }));
        }
        throw new Error(`Unexpected request: ${String(input)}`);
      });
      const { result } = renderHook(() => useChatStream());
      await vi.waitFor(() => expect(useChatStore.getState().isLoading).toBe(true));
      await act(async () => result.current.stopGeneration());
      await vi.waitFor(() =>
        expect(error).toHaveBeenCalledWith(
          'Could not stop the Cloud task. Check its activity before retrying.',
        ),
      );
      expect(useChatStore.getState().isLoading).toBe(true);

      await act(async () => result.current.stopGeneration());

      await vi.waitFor(() => expect(useChatStore.getState().isLoading).toBe(false));
      expect(attempts).toBe(2);
    });

    it.each(['terminal', 'failed read', 'not confirmed'] as const)(
      'preserves the server confirmation boundary for a %s poll',
      async (outcome) => {
        vi.useFakeTimers();
        const error = vi.spyOn(toast, 'error').mockReturnValue('stop-error');
        let reads = 0;
        let cancellations = 0;
        vi.mocked(fetch).mockImplementation(async (input, init) => {
          if (String(input) === RECOVERY_PATH) {
            return new Response(JSON.stringify({ runs: [recoveredRunSnapshot().run] }));
          }
          if (String(input) === MANAGED_RUN_PATH && init?.method === 'POST') {
            cancellations += 1;
            return new Response(
              JSON.stringify({
                run: recoveredRunSnapshot(cancellations > 1 ? 'cancelled' : 'running').run,
              }),
            );
          }
          if (String(input).startsWith(`${MANAGED_RUN_PATH}?`)) {
            reads += 1;
            return outcome === 'failed read'
              ? new Response('no confirmation', { status: 503 })
              : new Response(
                  JSON.stringify(
                    recoveredRunSnapshot(outcome === 'terminal' ? 'cancelled' : 'running'),
                  ),
                );
          }
          throw new Error(`Unexpected request: ${String(input)}`);
        });
        const { result } = renderHook(() => useChatStream());
        await act(async () => {});
        expect(useChatStore.getState().isLoading).toBe(true);
        await act(async () => result.current.stopGeneration());
        expect(useChatStore.getState().isLoading).toBe(true);

        await act(async () => {
          await vi.advanceTimersByTimeAsync(outcome === 'not confirmed' ? 30_000 : 1_000);
        });

        expect(reads).toBe(outcome === 'not confirmed' ? 30 : 1);
        expect(useChatStore.getState().isLoading).toBe(outcome !== 'terminal');
        if (outcome === 'terminal') expect(error).not.toHaveBeenCalled();
        else
          expect(error).toHaveBeenCalledWith(
            outcome === 'failed read'
              ? 'Could not stop the Cloud task. Check its activity before retrying.'
              : 'The Cloud task has not confirmed it stopped. Check its activity before retrying.',
          );
        if (outcome !== 'terminal') {
          await act(async () => result.current.stopGeneration());
          expect(cancellations).toBe(2);
          expect(useChatStore.getState().isLoading).toBe(false);
        }
      },
    );

    it('does not restore a recovered run after Stop invalidates an unanswered probe', async () => {
      const recovery = deferredResponse();
      vi.mocked(fetch).mockReturnValue(recovery.promise);
      const { result } = renderHook(() => useChatStream());
      expect(fetch).toHaveBeenCalledTimes(1);
      act(() => result.current.stopGeneration());

      await act(async () =>
        recovery.resolve(new Response(JSON.stringify({ runs: [recoveredRunSnapshot().run] }))),
      );

      expect(useChatStore.getState().isLoading).toBe(false);
      act(() => result.current.stopGeneration());
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('clears an idle recovered handle when returning to the conversation', async () => {
      let probes = 0;
      vi.mocked(fetch).mockImplementation(async (input) => {
        if (String(input) === RECOVERY_PATH && probes++ === 0) {
          return new Response(JSON.stringify({ runs: [recoveredRunSnapshot().run] }));
        }
        return new Response(JSON.stringify({ runs: [] }));
      });
      const { result } = renderHook(() => useChatStream());
      await vi.waitFor(() => expect(useChatStore.getState().isLoading).toBe(true));
      act(() => restoreRecoveredConversation('33333333-3333-4333-8333-333333333333'));
      act(() => {
        useChatStore.getState().setLoading(false, RECOVERED_CONVERSATION_ID);
        restoreRecoveredConversation();
      });
      await vi.waitFor(() => expect(probes).toBe(2));
      await act(async () => {});

      act(() => result.current.stopGeneration());

      expect(
        vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST'),
      ).toHaveLength(0);
      expect(useChatStore.getState().isLoading).toBe(false);
    });

    it('discards a cancellation failure when the same account signs out in place', async () => {
      const cancellation = deferredResponse();
      const error = vi.spyOn(toast, 'error').mockReturnValue('stop-error');
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        if (String(input) === RECOVERY_PATH)
          return new Response(
            JSON.stringify({ runs: authMocks.isSignedIn ? [recoveredRunSnapshot().run] : [] }),
          );
        if (String(input) === MANAGED_RUN_PATH && init?.method === 'POST')
          return cancellation.promise;
        throw new Error(`Unexpected request: ${String(input)}`);
      });
      const { result, rerender } = renderHook(() => useChatStream());
      await vi.waitFor(() => expect(useChatStore.getState().isLoading).toBe(true));
      act(() => result.current.stopGeneration());
      await vi.waitFor(() =>
        expect(
          vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST'),
        ).toHaveLength(1),
      );
      act(() => {
        authMocks.isSignedIn = false;
        useChatStore.getState().setLoading(false, RECOVERED_CONVERSATION_ID);
        rerender();
      });

      await act(async () => cancellation.resolve(new Response('not stopped', { status: 503 })));

      expect(useChatStore.getState().isLoading).toBe(false);
      expect(error).not.toHaveBeenCalled();
    });

    it('does not let a former account cancellation affect a new account run', async () => {
      const oldCancellation = deferredResponse();
      const newCancellation = deferredResponse();
      const error = vi.spyOn(toast, 'error').mockReturnValue('stop-error');
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url === RECOVERY_PATH) {
          const run = recoveredRunSnapshot(
            'running',
            authMocks.userId === 'user-1' ? MANAGED_RUN_ID : NEXT_RUN_ID,
          ).run;
          return new Response(JSON.stringify({ runs: [{ ...run, userId: authMocks.userId }] }));
        }
        if (url === MANAGED_RUN_PATH && init?.method === 'POST') return oldCancellation.promise;
        if (url === managedCloudAgentRunPath(NEXT_RUN_ID) && init?.method === 'POST')
          return newCancellation.promise;
        throw new Error(`Unexpected request: ${url}`);
      });
      const { result, rerender } = renderHook(() => useChatStream());
      await vi.waitFor(() => expect(useChatStore.getState().isLoading).toBe(true));
      act(() => result.current.stopGeneration());
      await vi.waitFor(() =>
        expect(
          vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST'),
        ).toHaveLength(1),
      );
      act(() => {
        authMocks.userId = 'user-2';
        authMocks.getToken.mockResolvedValue('next-session-token');
        useChatStore.getState().setLoading(false, RECOVERED_CONVERSATION_ID);
        rerender();
      });
      await vi.waitFor(() => expect(useChatStore.getState().isLoading).toBe(true));
      act(() => result.current.stopGeneration());
      await vi.waitFor(() =>
        expect(
          vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST'),
        ).toHaveLength(2),
      );

      await act(async () => oldCancellation.resolve(new Response('not stopped', { status: 503 })));

      expect(useChatStore.getState().isLoading).toBe(true);
      expect(error).not.toHaveBeenCalled();
      await act(async () =>
        newCancellation.resolve(
          new Response(
            JSON.stringify({
              run: { ...recoveredRunSnapshot('cancelled', NEXT_RUN_ID).run, userId: 'user-2' },
            }),
          ),
        ),
      );
      await vi.waitFor(() => expect(useChatStore.getState().isLoading).toBe(false));
      expect(
        vi
          .mocked(fetch)
          .mock.calls.find(
            ([input, init]) =>
              String(input) === managedCloudAgentRunPath(NEXT_RUN_ID) && init?.method === 'POST',
          )?.[1]?.headers,
      ).toEqual({ Authorization: 'Bearer next-session-token', 'x-csrf-token': 'csrf-token' });
    });

    it('keeps the same recovered run cancellation claimed after an old owner settles', async () => {
      const oldCancellation = deferredResponse();
      const newCancellation = deferredResponse();
      const error = vi.spyOn(toast, 'error').mockReturnValue('stop-error');
      let attempts = 0;
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        if (String(input) === RECOVERY_PATH)
          return new Response(
            JSON.stringify({
              runs: [{ ...recoveredRunSnapshot().run, userId: authMocks.userId }],
            }),
          );
        if (String(input) === MANAGED_RUN_PATH && init?.method === 'POST') {
          attempts += 1;
          return attempts === 1 ? oldCancellation.promise : newCancellation.promise;
        }
        throw new Error(`Unexpected request: ${String(input)}`);
      });
      const { result, rerender } = renderHook(() => useChatStream());
      await vi.waitFor(() => expect(useChatStore.getState().isLoading).toBe(true));
      act(() => result.current.stopGeneration());
      await vi.waitFor(() => expect(attempts).toBe(1));
      act(() => {
        authMocks.userId = 'user-2';
        authMocks.getToken.mockResolvedValue('next-session-token');
        useChatStore.getState().setLoading(false, RECOVERED_CONVERSATION_ID);
        rerender();
      });
      await vi.waitFor(() => expect(useChatStore.getState().isLoading).toBe(true));
      act(() => result.current.stopGeneration());
      await vi.waitFor(() => expect(attempts).toBe(2));

      await act(async () => oldCancellation.resolve(new Response('not stopped', { status: 503 })));
      act(() => result.current.stopGeneration());
      await act(async () => {});

      expect(attempts).toBe(2);
      expect(useChatStore.getState().isLoading).toBe(true);
      expect(error).not.toHaveBeenCalled();
      await act(async () =>
        newCancellation.resolve(
          new Response(
            JSON.stringify({
              run: { ...recoveredRunSnapshot('cancelled').run, userId: 'user-2' },
            }),
          ),
        ),
      );
      await vi.waitFor(() => expect(useChatStore.getState().isLoading).toBe(false));
    });

    it.each(['switch', 'unmount'] as const)('discards a late recovery after %s', async (action) => {
      const recovery = deferredResponse();
      vi.mocked(fetch).mockImplementation(async (input) =>
        String(input) === RECOVERY_PATH
          ? recovery.promise
          : new Response(JSON.stringify({ runs: [] })),
      );
      const { result, unmount } = renderHook(() => useChatStream());
      if (action === 'switch')
        act(() => restoreRecoveredConversation('33333333-3333-4333-8333-333333333333'));
      else unmount();

      await act(async () =>
        recovery.resolve(new Response(JSON.stringify({ runs: [recoveredRunSnapshot().run] }))),
      );

      expect(useChatStore.getState().loadingConversationIds).not.toContain(
        RECOVERED_CONVERSATION_ID,
      );
      if (action === 'switch') act(() => result.current.stopGeneration());
      expect(
        vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST'),
      ).toHaveLength(0);
    });

    it.each(['terminal', 'failure'] as const)(
      'does not let an unmounted cancellation %s change the new owner',
      async (outcome) => {
        const oldCancellation = deferredResponse();
        const newCancellation = deferredResponse();
        const error = vi.spyOn(toast, 'error').mockReturnValue('stop-error');
        const assistantMessageId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        const encoder = new TextEncoder();
        let generations = 0;
        vi.mocked(fetch).mockImplementation(async (input, init) => {
          const url = String(input);
          if (url === '/api/llm/v1/chat/completions') {
            const runId = generations++ === 0 ? MANAGED_RUN_ID : NEXT_RUN_ID;
            return new Response(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ choices: [{ delta: { content: 'Working' } }] })}\n\n`,
                    ),
                  );
                  init?.signal?.addEventListener(
                    'abort',
                    () => controller.error(new DOMException('Stopped', 'AbortError')),
                    { once: true },
                  );
                },
              }),
              {
                headers: {
                  'X-AGI-Agent-Run-Id': runId,
                  'X-AGI-Agent-Run-URL': managedCloudAgentRunPath(runId),
                },
              },
            );
          }
          if (url === MANAGED_RUN_PATH && init?.method === 'POST') return oldCancellation.promise;
          if (url === managedCloudAgentRunPath(NEXT_RUN_ID) && init?.method === 'POST')
            return newCancellation.promise;
          if (url.endsWith('/messages') && init?.method === 'POST') return new Response('{}');
          throw new Error(`Unexpected request: ${url}`);
        });
        const oldOwner = renderHook(() => useChatStream({ followActiveConversation: false }));
        let oldSend: Promise<boolean> | undefined;
        act(() => {
          oldSend = oldOwner.result.current.sendMessage('Original turn', {
            conversationId: RECOVERED_CONVERSATION_ID,
            assistantMessageId,
            workMode: 'agiwork',
          });
        });
        await vi.waitFor(() =>
          expect(
            useChatStore.getState().messages.find((message) => message.id === assistantMessageId)
              ?.metadata?.cloudAgentRun?.runId,
          ).toBe(MANAGED_RUN_ID),
        );
        act(() => oldOwner.result.current.stopGeneration());
        await oldSend;
        oldOwner.unmount();
        act(() => {
          restoreRecoveredConversation();
          useChatStore.getState().setLoading(false, RECOVERED_CONVERSATION_ID);
        });
        const newOwner = renderHook(() => useChatStream({ followActiveConversation: false }));
        let newSend: Promise<boolean> | undefined;
        act(() => {
          newSend = newOwner.result.current.sendMessage('Restored owner turn', {
            conversationId: RECOVERED_CONVERSATION_ID,
            assistantMessageId,
            workMode: 'agiwork',
          });
        });
        await vi.waitFor(() =>
          expect(
            useChatStore.getState().messages.find((message) => message.id === assistantMessageId)
              ?.metadata?.cloudAgentRun?.runId,
          ).toBe(NEXT_RUN_ID),
        );
        act(() => newOwner.result.current.stopGeneration());
        await newSend;
        expect(useChatStore.getState().isLoading).toBe(true);
        expect(useStreamPhaseStore.getState().phases[assistantMessageId]).toBe('stopping');

        await act(async () =>
          oldCancellation.resolve(
            outcome === 'failure'
              ? new Response('not stopped', { status: 503 })
              : new Response(JSON.stringify({ run: recoveredRunSnapshot('cancelled').run })),
          ),
        );

        expect(useChatStore.getState().isLoading).toBe(true);
        expect(useChatStore.getState().error).toBeNull();
        expect(error).not.toHaveBeenCalled();
        expect(useStreamPhaseStore.getState().phases[assistantMessageId]).toBe('stopping');
        await act(async () =>
          newCancellation.resolve(
            new Response(
              JSON.stringify({ run: recoveredRunSnapshot('cancelled', NEXT_RUN_ID).run }),
            ),
          ),
        );
        await vi.waitFor(() => expect(useChatStore.getState().isLoading).toBe(false));
        expect(useStreamPhaseStore.getState().phases[assistantMessageId]).toBeUndefined();
      },
    );

    it('does not overwrite a fresh run with the old recovery response', async () => {
      const recovery = deferredResponse();
      const encoder = new TextEncoder();
      const nextPath = managedCloudAgentRunPath(NEXT_RUN_ID);
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url === RECOVERY_PATH) return recovery.promise;
        if (url === '/api/llm/v1/chat/completions') {
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ choices: [{ delta: { content: 'New turn' } }] })}\n\n`,
                  ),
                );
                init?.signal?.addEventListener(
                  'abort',
                  () => controller.error(new DOMException('Stopped', 'AbortError')),
                  { once: true },
                );
              },
            }),
            { headers: { 'X-AGI-Agent-Run-Id': NEXT_RUN_ID, 'X-AGI-Agent-Run-URL': nextPath } },
          );
        }
        if (url === nextPath && init?.method === 'POST') {
          return new Response(
            JSON.stringify({ run: recoveredRunSnapshot('cancelled', NEXT_RUN_ID).run }),
          );
        }
        if (url.endsWith('/messages') && init?.method === 'POST') return new Response('{}');
        throw new Error(`Unexpected request: ${url}`);
      });
      const { result } = renderHook(() => useChatStream());
      let send: Promise<boolean> | undefined;
      act(() => {
        send = result.current.sendMessage('Start another turn', {
          conversationId: RECOVERED_CONVERSATION_ID,
          workMode: 'agiwork',
        });
      });
      await vi.waitFor(() =>
        expect(
          useChatStore
            .getState()
            .messages.some((message) => message.metadata?.cloudAgentRun?.runId === NEXT_RUN_ID),
        ).toBe(true),
      );
      await act(async () =>
        recovery.resolve(new Response(JSON.stringify({ runs: [recoveredRunSnapshot().run] }))),
      );

      act(() => result.current.stopGeneration());
      await send;

      await vi.waitFor(() =>
        expect(
          vi
            .mocked(fetch)
            .mock.calls.filter(
              ([input, init]) => String(input) === nextPath && init?.method === 'POST',
            ),
        ).toHaveLength(1),
      );
      expect(
        vi
          .mocked(fetch)
          .mock.calls.filter(
            ([input, init]) => String(input) === MANAGED_RUN_PATH && init?.method === 'POST',
          ),
      ).toHaveLength(0);
    });

    it('does not let a retired cancellation clear a new browser run', async () => {
      const oldCancellation = deferredResponse();
      const newCancellation = deferredResponse();
      const error = vi.spyOn(toast, 'error').mockReturnValue('stop-error');
      const assistantMessageId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const nextPath = managedCloudAgentRunPath(NEXT_RUN_ID);
      const encoder = new TextEncoder();
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url === RECOVERY_PATH)
          return new Response(JSON.stringify({ runs: [recoveredRunSnapshot().run] }));
        if (url === MANAGED_RUN_PATH && init?.method === 'POST') return oldCancellation.promise;
        if (url === nextPath && init?.method === 'POST') return newCancellation.promise;
        if (url === '/api/llm/v1/chat/completions')
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ choices: [{ delta: { content: 'New turn' } }] })}\n\n`,
                  ),
                );
                init?.signal?.addEventListener(
                  'abort',
                  () => controller.error(new DOMException('Stopped', 'AbortError')),
                  { once: true },
                );
              },
            }),
            { headers: { 'X-AGI-Agent-Run-Id': NEXT_RUN_ID, 'X-AGI-Agent-Run-URL': nextPath } },
          );
        if (url.endsWith('/messages') && init?.method === 'POST') return new Response('{}');
        throw new Error(`Unexpected request: ${url}`);
      });
      const { result } = renderHook(() => useChatStream());
      await vi.waitFor(() => expect(useChatStore.getState().isLoading).toBe(true));
      act(() => result.current.stopGeneration());
      await vi.waitFor(() =>
        expect(
          vi.mocked(fetch).mock.calls.filter(([input]) => String(input) === MANAGED_RUN_PATH),
        ).toHaveLength(1),
      );
      let send: Promise<boolean> | undefined;
      act(() => {
        send = result.current.sendMessage('Start a new turn', {
          conversationId: RECOVERED_CONVERSATION_ID,
          assistantMessageId,
          workMode: 'agiwork',
        });
      });
      await vi.waitFor(() =>
        expect(
          useChatStore.getState().messages.find((message) => message.id === assistantMessageId)
            ?.metadata?.cloudAgentRun?.runId,
        ).toBe(NEXT_RUN_ID),
      );
      act(() => result.current.stopGeneration());
      await send;

      await act(async () => oldCancellation.resolve(new Response('not stopped', { status: 503 })));

      expect(useChatStore.getState().isLoading).toBe(true);
      expect(error).not.toHaveBeenCalled();
      expect(useStreamPhaseStore.getState().phases[assistantMessageId]).toBe('stopping');
      await act(async () =>
        newCancellation.resolve(
          new Response(JSON.stringify({ run: recoveredRunSnapshot('cancelled', NEXT_RUN_ID).run })),
        ),
      );
      await vi.waitFor(() => expect(useChatStore.getState().isLoading).toBe(false));
      expect(useStreamPhaseStore.getState().phases[assistantMessageId]).toBeUndefined();
    });
  });

  describe('x_tool_result / mcp_tool_use wiring', () => {
    it('populates tool result and survives a trailing finishRunningTools flush', async () => {
      mockSseStream([
        {
          choices: [
            {
              delta: {
                x_tool_status: { type: 'mcp_tool_use', name: 'bash', status: 'running' },
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                x_tool_result: {
                  tool_call_id: 'tc-1',
                  name: 'bash',
                  content: 'Hello from E2B',
                  is_error: false,
                },
              },
            },
          ],
        },
        { choices: [{ delta: { content: 'Done.' }, finish_reason: 'stop' }] },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('run bash', {
          conversationId: TEMP_CONVERSATION.id,
        });
      });

      const state = useChatStore.getState();
      const assistantMsg = state.messages.find((m) => m.role === 'assistant');
      const tools = assistantMsg?.metadata?.tools ?? [];
      const bashEntry = tools.find((t) => t.name === 'bash');
      expect(bashEntry, 'bash tool entry should exist').toBeDefined();
      expect(bashEntry?.result).toBe('Hello from E2B');
      expect(bashEntry?.status).toBe('completed');
    });

    it('accepts mcp_tool_use failed status and marks tool failed', async () => {
      mockSseStream([
        {
          choices: [
            {
              delta: {
                x_tool_status: { type: 'mcp_tool_use', name: 'bash', status: 'running' },
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                x_tool_status: { type: 'mcp_tool_use', name: 'bash', status: 'failed' },
              },
            },
          ],
        },
        { choices: [{ delta: { content: 'Error.' }, finish_reason: 'stop' }] },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('run bash', {
          conversationId: TEMP_CONVERSATION.id,
        });
      });

      const state = useChatStore.getState();
      const assistantMsg = state.messages.find((m) => m.role === 'assistant');
      const bashEntry = assistantMsg?.metadata?.tools?.find((t) => t.name === 'bash');
      expect(bashEntry?.status).toBe('failed');
    });

    it('still handles server_tool_use events (regression)', async () => {
      mockSseStream([
        {
          choices: [
            {
              delta: {
                x_tool_status: {
                  type: 'server_tool_use',
                  name: 'web_search',
                  status: 'searching',
                },
              },
            },
          ],
        },
        { choices: [{ delta: { content: 'Results.' }, finish_reason: 'stop' }] },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('search', {
          conversationId: TEMP_CONVERSATION.id,
        });
      });

      const state = useChatStore.getState();
      const assistantMsg = state.messages.find((m) => m.role === 'assistant');
      const searchEntry = assistantMsg?.metadata?.tools?.find((t) => t.name === 'web_search');
      expect(searchEntry, 'web_search tool entry should exist').toBeDefined();
    });

    it('persists user-visible tool status so the action trail survives reload', async () => {
      const conversation = {
        ...TEMP_CONVERSATION,
        id: 'conv-tool-status-persist',
        isTemporary: false,
      };
      useChatStore.setState({
        activeConversationId: conversation.id,
        conversations: [conversation],
      });

      const streamBody =
        `data: ${JSON.stringify({ choices: [{ delta: { x_tool_status: { type: 'mcp_tool_use', name: 'skill', status: 'running', status_phrase: 'Reading skill' } } }] })}\n\n` +
        `data: ${JSON.stringify({ choices: [{ delta: { x_tool_status: { type: 'mcp_tool_use', name: 'skill', status: 'completed' } } }] })}\n\n` +
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'Done.' }, finish_reason: 'stop' }] })}\n\n` +
        'data: [DONE]\n\n';
      const savedBodies: Array<Record<string, unknown>> = [];

      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes('/messages')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
          savedBodies.push(body);
          return new Response(JSON.stringify({ message: { id: body['id'] } }), { status: 200 });
        }
        if (url.includes('/api/llm/')) {
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(streamBody));
              controller.close();
            },
          });
          return new Response(stream, { status: 200, headers: new Headers() });
        }
        return new Response('{}', { status: 200 });
      });

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('use the selected skill', {
          conversationId: conversation.id,
        });
      });
      await vi.waitFor(() =>
        expect(savedBodies.some((body) => body['role'] === 'assistant')).toBe(true),
      );

      const assistantSave = savedBodies.find((body) => body['role'] === 'assistant');
      expect(assistantSave?.['metadata']).toMatchObject({
        tools: [
          {
            name: 'skill',
            status: 'completed',
            statusPhrase: 'Reading skill',
          },
        ],
      });
    });
  });

  describe('x_code_result wiring', () => {
    it('reads stdout, stderr, and return_code from the real code_execution_result shape', async () => {
      mockSseStream([
        {
          choices: [
            {
              delta: {
                x_tool_status: {
                  type: 'server_tool_use',
                  name: 'code_execution',
                  status: 'executing',
                },
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                x_code_result: {
                  content: {
                    type: 'code_execution_result',
                    content: [],
                    stdout: 'hello from python\n',
                    stderr: '',
                    return_code: 0,
                  },
                },
              },
            },
          ],
        },
        { choices: [{ delta: { content: 'Done.' }, finish_reason: 'stop' }] },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('run some code', {
          conversationId: TEMP_CONVERSATION.id,
        });
      });

      const state = useChatStore.getState();
      const assistantMsg = state.messages.find((m) => m.role === 'assistant');
      expect(assistantMsg?.metadata?.codeExecutionResult).toEqual({
        stdout: 'hello from python\n',
        stderr: '',
        returnCode: 0,
      });
      const codeEntry = assistantMsg?.metadata?.tools?.find((t) => t.name === 'code_execution');
      expect(codeEntry?.status).toBe('completed');
    });

    it('marks the tool failed on a code_execution_tool_result_error instead of a false success', async () => {
      mockSseStream([
        {
          choices: [
            {
              delta: {
                x_tool_status: {
                  type: 'server_tool_use',
                  name: 'code_execution',
                  status: 'executing',
                },
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                x_code_result: {
                  content: {
                    type: 'code_execution_tool_result_error',
                    error_code: 'execution_time_exceeded',
                  },
                },
              },
            },
          ],
        },
        { choices: [{ delta: { content: 'The script timed out.' }, finish_reason: 'stop' }] },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('run some code', {
          conversationId: TEMP_CONVERSATION.id,
        });
      });

      const state = useChatStore.getState();
      const assistantMsg = state.messages.find((m) => m.role === 'assistant');
      const codeEntry = assistantMsg?.metadata?.tools?.find((t) => t.name === 'code_execution');
      expect(codeEntry?.status).toBe('failed');
      expect(codeEntry?.error).toBe('Code execution failed: execution_time_exceeded');
      expect(assistantMsg?.metadata?.codeExecutionResult).toBeUndefined();
    });
  });

  describe('completions retry fetches a fresh token', () => {
    it('does not reuse the send-time token for the silent empty-turn retry', async () => {
      authMocks.getToken
        .mockResolvedValueOnce('token-at-send')
        .mockResolvedValueOnce('token-at-send')
        .mockResolvedValue('token-after-expiry');

      mockSseStream([]);
      mockSseStream([{ choices: [{ delta: { content: 'answer' }, finish_reason: 'stop' }] }]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('a slow question', {
          conversationId: TEMP_CONVERSATION.id,
        });
      });

      const completionCalls = vi
        .mocked(fetch)
        .mock.calls.filter(([input]) => String(input).includes('/api/llm/v1/chat/completions'));
      expect(completionCalls).toHaveLength(2);

      const authorization = (call: (typeof completionCalls)[number]) =>
        ((call[1]?.headers ?? {}) as Record<string, string>)['Authorization'];

      expect(authorization(completionCalls[0]!)).toBe('Bearer token-at-send');
      expect(authorization(completionCalls[1]!)).toBe('Bearer token-after-expiry');
    });
  });

  describe('saveMessageToDb durability (persist after a long stream)', () => {
    function headerRecord(init: RequestInit | undefined): Record<string, string> {
      return (init?.headers ?? {}) as Record<string, string>;
    }

    it('fetches a FRESH auth token at save time instead of reusing a stale one', async () => {
      const getToken = vi
        .fn<() => Promise<string>>()
        .mockResolvedValueOnce('token-stale')
        .mockResolvedValue('token-fresh');
      const getAuthToken = async () => getToken();

      await getAuthToken();

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ message: { id: 'saved-1' } }), { status: 200 }),
      );

      const saved = await saveMessageToDb(
        'conv-1',
        { id: 'msg-1', role: 'assistant', content: 'answer' },
        getAuthToken,
      );

      expect(saved.id).toBe('saved-1');
      expect(fetch).toHaveBeenCalledTimes(1);
      const [, init] = vi.mocked(fetch).mock.calls[0]!;
      const headers = headerRecord(init);
      expect(headers['Authorization']).toBe('Bearer token-fresh');
      expect(headers['x-csrf-token']).toBe('csrf-token');
    });

    it('re-fetches the token on each retry so an expiry between attempts self-heals', async () => {
      const getToken = vi.fn<() => Promise<string>>().mockResolvedValue('token-fresh');
      const getAuthToken = async () => getToken();

      vi.mocked(fetch)
        .mockResolvedValueOnce(new Response('err', { status: 500 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ message: { id: 'saved-2' } }), { status: 200 }),
        );

      const saved = await saveMessageToDb(
        'conv-1',
        { id: 'msg-2', role: 'assistant', content: 'answer' },
        getAuthToken,
        { retryDelayMs: 1 },
      );

      expect(saved.id).toBe('saved-2');
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(getToken).toHaveBeenCalledTimes(2);
    });

    it('lands saves of one message in the order they were made, even when the first one retries', async () => {
      const messageId = '0b5f1f8e-2a3c-4d6e-9f10-1a2b3c4d5e6f';
      const landed: string[] = [];
      let refusedOnce = false;
      vi.mocked(fetch).mockImplementation(async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { id: string; content: string };
        if (body.content === 'the attempt that was discarded' && !refusedOnce) {
          refusedOnce = true;
          return new Response('unavailable', { status: 503 });
        }
        landed.push(body.content);
        return new Response(JSON.stringify({ message: { id: body.id } }), { status: 200 });
      });
      const getAuthToken = async () => 'token-fresh';

      await Promise.all([
        saveMessageToDb(
          'conv-1',
          { id: messageId, role: 'assistant', content: 'the attempt that was discarded' },
          getAuthToken,
          { retryDelayMs: 20 },
        ),
        saveMessageToDb(
          'conv-1',
          { id: messageId, role: 'assistant', content: 'the answer the reader saw' },
          getAuthToken,
          { retryDelayMs: 20 },
        ),
      ]);

      expect(landed).toEqual(['the attempt that was discarded', 'the answer the reader saw']);
    });

    it('surfaces a 403 CSRF/auth rejection instead of silently dropping the turn', async () => {
      const getAuthToken = async () => 'token-fresh';
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'CSRF_VALIDATION_FAILED' }), { status: 403 }),
      );

      let rejection: unknown;
      try {
        await saveMessageToDb(
          'conv-1',
          { id: 'msg-3', role: 'assistant', content: 'answer' },
          getAuthToken,
        );
      } catch (error) {
        rejection = error;
      }
      expect(rejection).toBeInstanceOf(Error);
      expect((rejection as Error).message).toContain('Failed to save message to DB: 403');
    });
  });

  describe('reasoning (thinking) accumulation + persistence', () => {
    it('keeps thinkingContent after the block closes (no metadata wipe) and leaves single-block turns un-segmented', async () => {
      mockSseStream([
        { choices: [{ delta: { content: '<thinking>reasoning here</thinking>' } }] },
        { choices: [{ delta: { content: 'final answer' }, finish_reason: 'stop' }] },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('think then answer', {
          conversationId: TEMP_CONVERSATION.id,
        });
      });

      const assistantMsg = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      expect(assistantMsg?.metadata?.thinkingContent).toBe('reasoning here');
      expect(assistantMsg?.metadata?.isThinkingStreaming).toBe(false);
      expect(assistantMsg?.metadata?.thinkingCompletedAt).toBeTruthy();
      expect(assistantMsg?.metadata?.thinkingSegments).toBeUndefined();
      expect(assistantMsg?.content).toBe('final answer');
    });

    it('renders multiple sequential thinking blocks as an ordered segment flow', async () => {
      mockSseStream([
        { choices: [{ delta: { content: '<thinking>first thought</thinking>' } }] },
        { choices: [{ delta: { content: 'partial ' } }] },
        { choices: [{ delta: { content: '<thinking>second thought</thinking>' } }] },
        { choices: [{ delta: { content: 'the answer' }, finish_reason: 'stop' }] },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('interleaved thinking', {
          conversationId: TEMP_CONVERSATION.id,
        });
      });

      const assistantMsg = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      const segments = assistantMsg?.metadata?.thinkingSegments ?? [];
      expect(segments).toHaveLength(2);
      expect(segments[0]?.content).toBe('first thought');
      expect(segments[1]?.content).toBe('second thought');
      expect(segments.every((s) => s.isStreaming === false)).toBe(true);
      expect(segments.every((s) => typeof s.completedAt === 'string')).toBe(true);
    });

    it('persists reasoning to the DB so it survives reload', async () => {
      const CONV = { ...TEMP_CONVERSATION, id: 'conv-persist', isTemporary: false };
      useChatStore.setState({ conversations: [CONV], activeConversationId: CONV.id });

      const streamBody =
        `data: ${JSON.stringify({ choices: [{ delta: { content: '<thinking>my reasoning</thinking>' } }] })}\n\n` +
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'answer' }, finish_reason: 'stop' }] })}\n\n` +
        'data: [DONE]\n\n';

      const saveBodies: Array<Record<string, unknown>> = [];
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes('/api/llm/')) {
          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(streamBody));
              controller.close();
            },
          });
          return new Response(stream, { status: 200, headers: new Headers() });
        }
        if (url.includes('/messages')) {
          try {
            saveBodies.push(JSON.parse(String(init?.body ?? '{}')));
          } catch {
            /* ignore */
          }
          return new Response(JSON.stringify({ message: { id: 'saved-reasoning' } }), {
            status: 200,
          });
        }
        return new Response('{}', { status: 200 });
      });

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('persist my reasoning', {
          conversationId: CONV.id,
        });
      });
      await vi.waitFor(() => expect(saveBodies.some((b) => b['role'] === 'assistant')).toBe(true));

      const assistantSave = saveBodies.find((b) => b['role'] === 'assistant');
      const savedMeta = assistantSave?.['metadata'] as Record<string, unknown> | undefined;
      expect(savedMeta?.['thinkingContent']).toBe('my reasoning');
      expect(savedMeta?.['isThinkingStreaming']).toBe(false);
      expect(savedMeta?.['thinkingCompletedAt']).toBeTruthy();
    });
  });

  describe('continue generation', () => {
    const PERSISTED_CONV = { ...TEMP_CONVERSATION, id: 'conv-continue', isTemporary: false };

    function mockRoutedFetch(streamBody: string) {
      const saveBodies: Array<Record<string, unknown>> = [];
      const llmBodies: Array<Record<string, unknown>> = [];
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes('/api/llm/')) {
          try {
            llmBodies.push(JSON.parse(String(init?.body ?? '{}')));
          } catch {
            /* ignore */
          }
          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(streamBody));
              controller.close();
            },
          });
          return new Response(stream, { status: 200, headers: new Headers() });
        }
        if (url.includes('/messages')) {
          let body: Record<string, unknown> = {};
          try {
            body = JSON.parse(String(init?.body ?? '{}'));
            saveBodies.push(body);
          } catch {
            /* ignore */
          }
          return new Response(JSON.stringify({ message: { id: body['id'] ?? 'saved-row' } }), {
            status: 200,
          });
        }
        return new Response('{}', { status: 200 });
      });
      return { saveBodies, llmBodies };
    }

    function sse(events: unknown[], done = true): string {
      return (
        events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') +
        (done ? 'data: [DONE]\n\n' : '')
      );
    }

    it("records finish_reason 'length' on the assistant metadata (continuable truncation)", async () => {
      mockSseStream([
        { choices: [{ delta: { content: 'truncated ans' }, finish_reason: 'length' }] },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('long question', {
          conversationId: TEMP_CONVERSATION.id,
        });
      });

      const assistantMsg = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      expect(assistantMsg?.metadata?.finishReason).toBe('length');
    });

    it('captures an additive x_stream_error delta into metadata.streamError and still persists the partial content', async () => {
      mockSseStream([
        { choices: [{ delta: { content: 'partial answer before' } }] },
        {
          choices: [
            {
              delta: {
                x_stream_error: {
                  message: 'Anthropic API overloaded',
                  code: '529',
                  retryable: true,
                },
              },
              finish_reason: 'error',
            },
          ],
        },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('long question', {
          conversationId: TEMP_CONVERSATION.id,
        });
      });

      const assistantMsg = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      expect(assistantMsg?.metadata?.streamError).toEqual({
        message: 'Anthropic API overloaded',
        code: '529',
        retryable: true,
      });
      expect(assistantMsg?.content).toBe('partial answer before');
    });

    it('accepts a bare-string x_stream_error defensively (wraps it as {message})', async () => {
      mockSseStream([
        { choices: [{ delta: { content: 'partial' } }] },
        { choices: [{ delta: { x_stream_error: 'rate limited' }, finish_reason: 'error' }] },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('hi', { conversationId: TEMP_CONVERSATION.id });
      });

      const assistantMsg = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      expect(assistantMsg?.metadata?.streamError).toEqual({ message: 'rate limited' });
    });

    it('never retries a completion the server classified content_blocked, and keeps the notice', async () => {
      mockSseStream([
        {
          choices: [
            {
              delta: {
                x_stream_error: {
                  message: 'The model blocked this response.',
                  code: 'content_blocked',
                },
              },
              finish_reason: 'error',
            },
          ],
        },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('hello', { conversationId: TEMP_CONVERSATION.id });
      });

      const completionCalls = vi
        .mocked(fetch)
        .mock.calls.filter(([input]) => String(input).includes('/api/llm/v1/chat/completions'));
      expect(completionCalls).toHaveLength(1);
      const assistantMsg = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      expect(assistantMsg?.metadata?.streamError?.code).toBe('content_blocked');
    });

    it('still retries once a completion the server classified empty_response', async () => {
      mockSseStream([
        {
          choices: [
            {
              delta: {
                x_stream_error: {
                  message: 'The model finished without a response.',
                  code: 'empty_response',
                },
              },
              finish_reason: 'error',
            },
          ],
        },
      ]);
      mockSseStream([{ choices: [{ delta: { content: 'answer' }, finish_reason: 'stop' }] }]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('hello', { conversationId: TEMP_CONVERSATION.id });
      });

      const completionCalls = vi
        .mocked(fetch)
        .mock.calls.filter(([input]) => String(input).includes('/api/llm/v1/chat/completions'));
      expect(completionCalls).toHaveLength(2);
      const assistantMsg = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      expect(assistantMsg?.content).toBe('answer');
    });

    it('retries a max-tokens finish with nothing visible on the exact model requested', async () => {
      mockSseStream([{ choices: [{ delta: {}, finish_reason: 'length' }] }]);
      mockSseStream([{ choices: [{ delta: { content: 'answer' }, finish_reason: 'stop' }] }]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('hello', {
          conversationId: TEMP_CONVERSATION.id,
          model: 'exact-model',
        });
      });

      const completionCalls = vi
        .mocked(fetch)
        .mock.calls.filter(([input]) => String(input).includes('/api/llm/v1/chat/completions'));
      expect(completionCalls).toHaveLength(2);
      const assistantMsg = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      expect(assistantMsg?.content).toBe('answer');
    });

    function mockAttemptsAndSaves(streams: string[], headers?: HeadersInit) {
      const assistantSaves: Array<{
        content?: string;
        metadata?: { finishReason?: string; thinkingContent?: string };
      }> = [];
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes('/api/llm/')) {
          const encoder = new TextEncoder();
          const body = streams.shift() ?? sse([]);
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(encoder.encode(body));
                controller.close();
              },
            }),
            { status: 200, headers: new Headers(headers) },
          );
        }
        if (url.includes('/messages')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as {
            id?: string;
            role?: string;
            content?: string;
            metadata?: { finishReason?: string; thinkingContent?: string };
          };
          if (body.role === 'assistant') assistantSaves.push(body);
          return new Response(JSON.stringify({ message: { id: body.id ?? 'saved-row' } }), {
            status: 200,
          });
        }
        return new Response('{}', { status: 200 });
      });
      return assistantSaves;
    }

    const REASONING_THAT_RAN_OUT = sse([
      {
        choices: [
          {
            delta: { content: '<thinking>Weighing how to introduce myself in a sentence' },
            finish_reason: 'length',
          },
        ],
      },
    ]);

    it('saves only the retried answer, never the empty attempt the retry discarded', async () => {
      useChatStore.setState({
        conversations: [PERSISTED_CONV],
        activeConversationId: PERSISTED_CONV.id,
      });
      const assistantSaves = mockAttemptsAndSaves([
        REASONING_THAT_RAN_OUT,
        sse([{ choices: [{ delta: { content: 'I am AGI Workforce.' }, finish_reason: 'stop' }] }]),
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('In one sentence, who are you?', {
          conversationId: PERSISTED_CONV.id,
          model: 'exact-model',
        });
      });

      await vi.waitFor(() =>
        expect(assistantSaves.map((save) => save.content)).toContain('I am AGI Workforce.'),
      );
      expect(assistantSaves).toHaveLength(1);
      expect(assistantSaves[0]?.metadata?.finishReason).toBe('stop');
      expect(assistantSaves[0]?.metadata?.thinkingContent).toBeUndefined();
      expect(
        useChatStore.getState().messages.find((message) => message.role === 'assistant')?.content,
      ).toBe('I am AGI Workforce.');
    });

    it('still saves an empty turn the retry does not take, as it was shown', async () => {
      useChatStore.setState({
        conversations: [PERSISTED_CONV],
        activeConversationId: PERSISTED_CONV.id,
      });
      const assistantSaves = mockAttemptsAndSaves([REASONING_THAT_RAN_OUT], {
        'X-AGI-Resolved-Model': 'fallback-model',
      });

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('In one sentence, who are you?', {
          conversationId: PERSISTED_CONV.id,
          model: 'exact-model',
        });
      });

      await vi.waitFor(() => expect(assistantSaves).toHaveLength(1));
      expect(assistantSaves[0]?.metadata?.finishReason).toBe('length');
      expect(assistantSaves[0]?.metadata?.thinkingContent).toContain('Weighing how to introduce');
      expect(
        vi
          .mocked(fetch)
          .mock.calls.filter(([input]) => String(input).includes('/api/llm/v1/chat/completions')),
      ).toHaveLength(1);
    });

    it('does not retry a max-tokens finish with nothing visible once the served model differs from the request', async () => {
      const encoder = new TextEncoder();
      const body =
        `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'length' }] })}\n\n` +
        'data: [DONE]\n\n';
      const headers = new Headers();
      headers.set('X-AGI-Resolved-Model', 'fallback-model');
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(body));
              controller.close();
            },
          }),
          { status: 200, headers },
        ),
      );

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('hello', {
          conversationId: TEMP_CONVERSATION.id,
          model: 'requested-model',
        });
      });

      const completionCalls = vi
        .mocked(fetch)
        .mock.calls.filter(([input]) => String(input).includes('/api/llm/v1/chat/completions'));
      expect(completionCalls).toHaveLength(1);
      const assistantMsg = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      expect(assistantMsg?.model).toBe('fallback-model');
    });

    it('does NOT record streamError on a normal completion (no x_stream_error delta)', async () => {
      mockSseStream([
        { choices: [{ delta: { content: 'complete answer' }, finish_reason: 'stop' }] },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('hello', { conversationId: TEMP_CONVERSATION.id });
      });

      const assistantMsg = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      expect(assistantMsg?.metadata?.streamError).toBeUndefined();
    });

    it('records the FINAL finish_reason, not an intermediate tool_calls, on normal completion', async () => {
      mockSseStream([
        { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
        { choices: [{ delta: { content: 'complete answer' }, finish_reason: 'stop' }] },
      ]);

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('hello', { conversationId: TEMP_CONVERSATION.id });
      });

      const assistantMsg = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      expect(assistantMsg?.metadata?.finishReason).toBe('stop');
    });

    it("marks a user-stopped turn 'stopped' and persists the partial content", async () => {
      useChatStore.setState({
        conversations: [PERSISTED_CONV],
        activeConversationId: PERSISTED_CONV.id,
      });

      const saveBodies: Array<Record<string, unknown>> = [];
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes('/api/llm/')) {
          const encoder = new TextEncoder();
          let pulls = 0;
          const stream = new ReadableStream({
            pull(controller) {
              if (pulls === 0) {
                pulls += 1;
                const activityBase = {
                  schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
                  sessionId: PERSISTED_CONV.id,
                  turnId: 'turn-user-stopped',
                };
                controller.enqueue(
                  encoder.encode(
                    [
                      {
                        choices: [
                          {
                            delta: {
                              x_agent_event: {
                                ...activityBase,
                                sequence: 0,
                                emittedAtMs: 1_000,
                                event: { type: 'lifecycle', phase: 'started' },
                              },
                            },
                          },
                        ],
                      },
                      {
                        choices: [
                          {
                            delta: {
                              content: 'partial answer',
                              x_agent_event: {
                                ...activityBase,
                                sequence: 1,
                                emittedAtMs: 1_100,
                                event: {
                                  type: 'tool-execution-start',
                                  toolCallId: 'search-stop',
                                  name: 'web_search',
                                  category: 'web-search',
                                  summary: 'Searching official sources',
                                  input: { query: 'official sources' },
                                },
                              },
                            },
                          },
                        ],
                      },
                    ]
                      .map((event) => `data: ${JSON.stringify(event)}\n\n`)
                      .join(''),
                  ),
                );
                return;
              }
              controller.error(new DOMException('The user aborted a request.', 'AbortError'));
            },
          });
          return new Response(stream, { status: 200, headers: new Headers() });
        }
        if (url.includes('/messages')) {
          try {
            saveBodies.push(JSON.parse(String(init?.body ?? '{}')));
          } catch {
            /* ignore */
          }
          return new Response(JSON.stringify({ message: { id: 'saved-stop' } }), { status: 200 });
        }
        return new Response('{}', { status: 200 });
      });

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('question', { conversationId: PERSISTED_CONV.id });
      });

      const assistantMsg = useChatStore.getState().messages.find((m) => m.role === 'assistant');
      expect(assistantMsg?.content).toBe('partial answer');
      expect(assistantMsg?.metadata?.finishReason).toBe('stopped');
      expect(assistantMsg?.metadata?.agentActivity).toMatchObject({
        status: 'cancelled',
        stopReason: 'cancelled',
        entries: [expect.objectContaining({ kind: 'tool', status: 'cancelled' })],
      });
      expect(assistantMsg?.isStreaming).toBe(false);

      await vi.waitFor(() =>
        expect(
          saveBodies.some((b) => b['role'] === 'assistant' && b['content'] === 'partial answer'),
        ).toBe(true),
      );
      const assistantSave = saveBodies.find((b) => b['role'] === 'assistant');
      expect((assistantSave?.['metadata'] as Record<string, unknown>)?.['finishReason']).toBe(
        'stopped',
      );
      expect(
        (assistantSave?.['metadata'] as Record<string, unknown>)?.['agentActivity'],
      ).toMatchObject({ status: 'cancelled', stopReason: 'cancelled' });
    });

    it('lands a stopped turn whose first save is rate-limited, with no toast', async () => {
      useChatStore.setState({
        conversations: [PERSISTED_CONV],
        activeConversationId: PERSISTED_CONV.id,
      });

      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const saveBodies: Array<Record<string, unknown>> = [];
      let saveAttempts = 0;
      let providerStarted!: () => void;
      const providerStartedPromise = new Promise<void>((resolve) => {
        providerStarted = resolve;
      });
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes('/messages')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
          if (body['role'] === 'assistant') {
            saveAttempts += 1;
            if (saveAttempts === 1) {
              return new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 });
            }
          }
          saveBodies.push(body);
          return new Response(JSON.stringify({ message: { id: body['id'] } }), { status: 200 });
        }
        if (url.includes('/api/llm/')) {
          providerStarted();
          return await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () => reject(new DOMException('The user aborted a request.', 'AbortError')),
              { once: true },
            );
          });
        }
        return new Response('{}', { status: 200 });
      });

      try {
        const { result } = renderHook(() => useChatStream());
        let send!: Promise<boolean>;
        act(() => {
          send = result.current.sendMessage('question', { conversationId: PERSISTED_CONV.id });
        });
        await providerStartedPromise;

        act(() => result.current.stopGeneration(PERSISTED_CONV.id));
        await act(async () => {
          await send;
        });

        await vi.waitFor(() =>
          expect(saveBodies.some((body) => body['role'] === 'assistant')).toBe(true),
        );
        expect(saveAttempts).toBeGreaterThan(1);
        expect(errorLog).not.toHaveBeenCalled();
      } finally {
        errorLog.mockRestore();
      }
    });

    it('persists a cancelled assistant row when stopped before the first response byte', async () => {
      useChatStore.setState({
        conversations: [PERSISTED_CONV],
        activeConversationId: PERSISTED_CONV.id,
      });

      const saveBodies: Array<Record<string, unknown>> = [];
      let providerStarted!: () => void;
      const providerStartedPromise = new Promise<void>((resolve) => {
        providerStarted = resolve;
      });
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes('/messages')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
          saveBodies.push(body);
          return new Response(JSON.stringify({ message: { id: body['id'] } }), { status: 200 });
        }
        if (url.includes('/api/llm/')) {
          providerStarted();
          return await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () => reject(new DOMException('The user aborted a request.', 'AbortError')),
              { once: true },
            );
          });
        }
        return new Response('{}', { status: 200 });
      });

      const { result } = renderHook(() => useChatStream());
      let send!: Promise<boolean>;
      act(() => {
        send = result.current.sendMessage('question', { conversationId: PERSISTED_CONV.id });
      });
      await providerStartedPromise;

      act(() => result.current.stopGeneration(PERSISTED_CONV.id));
      await act(async () => {
        await send;
      });

      const assistantSave = saveBodies.find((body) => body['role'] === 'assistant');
      expect(assistantSave?.['content']).toBe(String.fromCharCode(0x200b));
      expect(
        (assistantSave?.['metadata'] as Record<string, unknown>)?.['agentActivity'],
      ).toMatchObject({
        status: 'cancelled',
        stopReason: 'cancelled',
        entries: [
          expect.objectContaining({
            progressId: 'local-starting',
            status: 'cancelled',
            summary: 'Response cancelled',
          }),
        ],
      });
    });

    it('APPENDS the continuation to the same assistant message and persists the merged text', async () => {
      useChatStore.setState({
        conversations: [PERSISTED_CONV],
        activeConversationId: PERSISTED_CONV.id,
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: 'write a long story',
            createdAt: '2026-07-01T00:00:00.000Z',
          },
          {
            id: '0190a000-0000-7000-8000-0000000000aa',
            role: 'assistant',
            content: 'Once upon a time',
            createdAt: '2026-07-01T00:00:01.000Z',
            model: 'test/model-1',
            metadata: { finishReason: 'length' },
          },
        ],
      });

      const { saveBodies, llmBodies } = mockRoutedFetch(
        sse([
          { choices: [{ delta: { content: ', the story continued.' }, finish_reason: 'stop' }] },
        ]),
      );

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.continueGeneration('0190a000-0000-7000-8000-0000000000aa');
      });

      const state = useChatStore.getState();
      const assistantMessages = state.messages.filter((m) => m.role === 'assistant');
      expect(assistantMessages).toHaveLength(1);
      expect(assistantMessages[0]?.id).toBe('0190a000-0000-7000-8000-0000000000aa');
      expect(assistantMessages[0]?.content).toBe('Once upon a time, the story continued.');
      expect(assistantMessages[0]?.metadata?.finishReason).toBe('stop');
      expect(assistantMessages[0]?.metadata?.artifactDerivation).toBe(
        EXPLICIT_ARTIFACT_DERIVATION_POLICY,
      );

      const llmRequest = llmBodies[0]!;
      expect(llmRequest['model']).toBe('test/model-1');
      const requestMessages = llmRequest['messages'] as Array<Record<string, unknown>>;
      const last = requestMessages[requestMessages.length - 1]!;
      const secondToLast = requestMessages[requestMessages.length - 2]!;
      expect(secondToLast['role']).toBe('assistant');
      expect(secondToLast['content']).toBe('Once upon a time');
      expect(last['role']).toBe('user');
      expect(String(last['content'])).toMatch(/continue/i);
      expect(state.messages.some((m) => m.content === last['content'])).toBe(false);

      await vi.waitFor(() =>
        expect(
          saveBodies.some(
            (b) =>
              b['role'] === 'assistant' &&
              b['content'] === 'Once upon a time, the story continued.',
          ),
        ).toBe(true),
      );
    });

    it("carries the conversation's memory and connector opt-outs on Continue", async () => {
      useChatStore.setState({
        conversations: [PERSISTED_CONV],
        activeConversationId: PERSISTED_CONV.id,
        memoryDisabledByConversation: { [PERSISTED_CONV.id]: true },
        disabledConnectorIdsByConversation: { [PERSISTED_CONV.id]: ['gmail'] },
        messages: [
          { id: 'user-1', role: 'user', content: 'go on', createdAt: '2026-07-01T00:00:00.000Z' },
          {
            id: '0190a000-0000-7000-8000-0000000000cc',
            role: 'assistant',
            content: 'part one',
            createdAt: '2026-07-01T00:00:01.000Z',
            metadata: { finishReason: 'length' },
          },
        ],
      });
      const { llmBodies } = mockRoutedFetch(
        sse([{ choices: [{ delta: { content: ' part two' }, finish_reason: 'stop' }] }]),
      );

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.continueGeneration('0190a000-0000-7000-8000-0000000000cc');
      });

      expect(llmBodies[0]).toMatchObject({
        memory_enabled: false,
        disabled_connector_ids: ['gmail'],
      });
      expect(llmBodies[0]).not.toHaveProperty('personalization');
    });

    it('keeps personalization off on Continue in an unpersonalized temporary chat', async () => {
      const temporary = { ...PERSISTED_CONV, id: 'conv-continue-temp', isTemporary: true };
      useChatStore.setState({
        conversations: [temporary],
        activeConversationId: temporary.id,
        temporaryChatPersonalized: false,
        messages: [
          { id: 'user-1', role: 'user', content: 'go on', createdAt: '2026-07-01T00:00:00.000Z' },
          {
            id: '0190a000-0000-7000-8000-0000000000dd',
            role: 'assistant',
            content: 'part one',
            createdAt: '2026-07-01T00:00:01.000Z',
            metadata: { finishReason: 'length' },
          },
        ],
      });
      const { llmBodies } = mockRoutedFetch(
        sse([{ choices: [{ delta: { content: ' part two' }, finish_reason: 'stop' }] }]),
      );

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.continueGeneration('0190a000-0000-7000-8000-0000000000dd');
      });

      expect(llmBodies[0]).toMatchObject({ personalization: false });
    });

    it('re-offers Continue when the continuation truncates again', async () => {
      useChatStore.setState({
        conversations: [PERSISTED_CONV],
        activeConversationId: PERSISTED_CONV.id,
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: 'go on',
            createdAt: '2026-07-01T00:00:00.000Z',
          },
          {
            id: '0190a000-0000-7000-8000-0000000000bb',
            role: 'assistant',
            content: 'part one',
            createdAt: '2026-07-01T00:00:01.000Z',
            metadata: { finishReason: 'length' },
          },
        ],
      });

      mockRoutedFetch(
        sse([{ choices: [{ delta: { content: ' part two' }, finish_reason: 'length' }] }]),
      );

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.continueGeneration('0190a000-0000-7000-8000-0000000000bb');
      });

      const assistantMsg = useChatStore
        .getState()
        .messages.find((m) => m.id === '0190a000-0000-7000-8000-0000000000bb');
      expect(assistantMsg?.content).toBe('part one part two');
      expect(assistantMsg?.metadata?.finishReason).toBe('length');
    });

    it('is a NO-OP on a normally-completed turn (no request fired)', async () => {
      useChatStore.setState({
        conversations: [PERSISTED_CONV],
        activeConversationId: PERSISTED_CONV.id,
        messages: [
          {
            id: 'assistant-done',
            role: 'assistant',
            content: 'complete answer',
            createdAt: '2026-07-01T00:00:01.000Z',
            metadata: { finishReason: 'stop' },
          },
        ],
      });

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.continueGeneration('assistant-done');
      });

      expect(fetch).not.toHaveBeenCalled();
      expect(useChatStore.getState().messages[0]?.content).toBe('complete answer');
    });

    it('is a NO-OP when the partial content is empty (nothing to continue)', async () => {
      useChatStore.setState({
        conversations: [PERSISTED_CONV],
        activeConversationId: PERSISTED_CONV.id,
        messages: [
          {
            id: 'assistant-empty',
            role: 'assistant',
            content: '',
            createdAt: '2026-07-01T00:00:01.000Z',
            metadata: { finishReason: 'stopped' },
          },
        ],
      });

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.continueGeneration('assistant-empty');
      });

      expect(fetch).not.toHaveBeenCalled();
    });

    it('keeps the partial text and appends an honest error note when the continuation fails', async () => {
      useChatStore.setState({
        conversations: [PERSISTED_CONV],
        activeConversationId: PERSISTED_CONV.id,
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            content: 'partial before failure',
            createdAt: '2026-07-01T00:00:01.000Z',
            metadata: { finishReason: 'stopped' },
          },
        ],
      });

      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('/api/llm/')) {
          return new Response(
            JSON.stringify({ error: { code: 'server_overloaded', message: 'Provider down' } }),
            { status: 503 },
          );
        }
        return new Response(JSON.stringify({ message: { id: 'saved-x' } }), { status: 200 });
      });

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.continueGeneration('assistant-1');
      });

      const assistantMsg = useChatStore.getState().messages.find((m) => m.id === 'assistant-1');
      expect(assistantMsg?.content).toContain('partial before failure');
      expect(assistantMsg?.content).toContain('Error: Provider down');
      expect(assistantMsg?.error).toBe(true);
      expect(useChatStore.getState().error).toBe('Provider down');
    });
  });

  it('renders failed LLM responses as visible assistant errors without console-directed copy', async () => {
    mockLlmErrorResponse({
      error: {
        code: 'server_overloaded',
        message: 'Provider overloaded',
      },
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('hello', { conversationId: TEMP_CONVERSATION.id });
    });

    const state = useChatStore.getState();
    const assistantMessage = state.messages.find((message) => message.role === 'assistant');
    expect(assistantMessage?.error).toBe(true);
    expect(assistantMessage?.content).toBe(
      'Error: Provider overloaded\n\nTry again, or start a new chat if this response is stuck.',
    );
    expect(assistantMessage?.content).not.toContain('console');
    expect(assistantMessage?.content).not.toContain('⚠');
    expect(state.error).toBe('Provider overloaded');
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('keeps the classified error code on the failed message for the incomplete-turn notice', async () => {
    mockLlmErrorResponse({
      error: {
        code: 'provider_unreachable',
        message: 'Provider unreachable',
      },
    });
    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('hello', { conversationId: TEMP_CONVERSATION.id });
    });

    const state = useChatStore.getState();
    const assistantMessage = state.messages.find((message) => message.role === 'assistant');
    expect(assistantMessage?.metadata?.errorCode).toBe('provider_unreachable');
  });

  it('keeps the streamed-in partial answer when an ordinary (non-durable) stream dies mid-response', async () => {
    const encoder = new TextEncoder();
    let pulls = 0;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/llm/v1/chat/completions') {
        return new Response(
          new ReadableStream({
            pull(controller) {
              if (pulls === 0) {
                pulls += 1;
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      choices: [
                        { delta: { content: 'Here is the partial answer before things broke.' } },
                      ],
                    })}\n\n`,
                  ),
                );
                return;
              }
              controller.error(new TypeError('network connection lost'));
            },
          }),
          { status: 200, headers: new Headers() },
        );
      }
      return new Response(JSON.stringify({ message: { id: 'saved-x' } }), { status: 200 });
    });

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('tell me something long', {
        conversationId: TEMP_CONVERSATION.id,
      });
    });

    const assistant = useChatStore.getState().messages.find((m) => m.role === 'assistant');
    expect(assistant?.content).toContain('Here is the partial answer before things broke.');
    expect(assistant?.content).toContain('Error: Could not reach the server.');
    expect(assistant?.error).toBe(true);
  });

  it('does not surface a late failed request in the conversation opened afterward', async () => {
    let finishRequest!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finishRequest = resolve;
        }),
    );
    const { result } = renderHook(() => useChatStream());

    let sendPromise!: Promise<boolean>;
    act(() => {
      sendPromise = result.current.sendMessage('slow request', {
        conversationId: TEMP_CONVERSATION.id,
      });
    });
    await vi.waitFor(() => expect(finishRequest).toBeTypeOf('function'));

    act(() => {
      useChatStore.getState().setActiveConversationWithMessages('conv-next', []);
    });
    finishRequest(
      new Response(JSON.stringify({ error: { message: 'Request failed: 504' } }), {
        status: 504,
      }),
    );
    await act(async () => {
      await sendPromise;
    });

    expect(useChatStore.getState().activeConversationId).toBe('conv-next');
    expect(useChatStore.getState().error).toBeNull();
  });

  it('marks the AGI Work action state failed when the provider request returns an error', async () => {
    mockLlmErrorResponse({ error: { message: 'Upstream timed out' } }, 504);
    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('create the file', {
        conversationId: TEMP_CONVERSATION.id,
        workMode: 'agiwork',
      });
    });

    const assistant = useChatStore
      .getState()
      .messages.find((message) => message.role === 'assistant');
    expect(assistant?.metadata?.agentActivity).toMatchObject({
      status: 'failed',
      stopReason: 'error',
      entries: expect.arrayContaining([expect.objectContaining({ status: 'failed' })]),
    });
  });

  it('binds a Managed Cloud send to the durable assistant turn id', async () => {
    mockSseStream([{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }]);
    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('hello', { conversationId: TEMP_CONVERSATION.id });
    });

    const assistant = useChatStore
      .getState()
      .messages.find((message) => message.role === 'assistant');
    const llmCall = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input).includes('/api/llm/v1/chat/completions'));
    expect(assistant?.id).toBeTruthy();
    expect((llmCall?.[1]?.headers as Record<string, string>)['Idempotency-Key']).toBe(
      `agi.chat.web.send.${assistant?.id}`,
    );
  });

  it('sends the browser time zone so the server can derive the local date', async () => {
    mockSseStream([{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }]);
    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('What date is it?', {
        conversationId: TEMP_CONVERSATION.id,
      });
    });

    const llmCall = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input).includes('/api/llm/v1/chat/completions'));
    const body = JSON.parse(String(llmCall?.[1]?.body)) as Record<string, unknown>;
    expect(body['client_timezone']).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it('sends the AGI Work execution mode to the managed cloud engine', async () => {
    mockSseStream([{ choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] }]);
    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('research and build this', {
        conversationId: TEMP_CONVERSATION.id,
        workMode: 'agiwork',
      });
    });

    const llmCall = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input).includes('/api/llm/v1/chat/completions'));
    const body = JSON.parse(String(llmCall?.[1]?.body)) as Record<string, unknown>;
    expect(body['work_mode']).toBe('agiwork');
    expect(body['agent_mode']).toBeUndefined();
  });

  it('does not send stale thinking options to a model that cannot reason', async () => {
    useThinkingStore.getState().setEffort('high');
    mockSseStream([{ choices: [{ delta: { content: 'searched' }, finish_reason: 'stop' }] }]);
    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('latest news', {
        conversationId: TEMP_CONVERSATION.id,
        model: NON_REASONING_CHAT_MODEL,
        thinkingEnabled: true,
        thinkingEffort: 'high',
      });
    });

    const llmCall = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input).includes('/api/llm/v1/chat/completions'));
    const body = JSON.parse(String(llmCall?.[1]?.body)) as Record<string, unknown>;
    expect(body['thinking_mode']).toBeUndefined();
    expect(body['effort']).toBeUndefined();
  });

  it('sends a catalog-supported minimal effort even when no separate thinking toggle is selected', async () => {
    mockSseStream([{ choices: [{ delta: { content: 'fast' }, finish_reason: 'stop' }] }]);
    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('classify this', {
        conversationId: TEMP_CONVERSATION.id,
        model: MINIMAL_EFFORT_CHAT_MODEL,
        thinkingEnabled: false,
        thinkingEffort: 'minimal' as never,
      });
    });

    const llmCall = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input).includes('/api/llm/v1/chat/completions'));
    const body = JSON.parse(String(llmCall?.[1]?.body)) as Record<string, unknown>;
    expect(body['effort']).toBe('minimal');
  });
});

describe('the transcript says what the turn is actually waiting for', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    useThinkingStore.getState().setEnabled(false);
    useFreeTrialStore.getState().clearLimitReached();
    useChatStore.setState({
      activeConversationId: TEMP_CONVERSATION.id,
      conversations: [TEMP_CONVERSATION],
    });
    authMocks.getToken.mockResolvedValue('session-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function openStreamThatSendsNothing(headers: Headers = new Headers()): () => void {
    let close: (() => void) | undefined;
    const stream = new ReadableStream({
      start(controller) {
        close = () => controller.close();
      },
    });
    vi.mocked(fetch).mockResolvedValue(new Response(stream, { status: 200, headers }));
    return () => close?.();
  }

  function activitySummaries(status?: 'running'): string[] {
    const assistant = useChatStore.getState().messages.find((m) => m.role === 'assistant');
    return (assistant?.metadata?.agentActivity?.entries ?? [])
      .filter(
        (entry): entry is Extract<typeof entry, { summary: string; status: string }> =>
          'summary' in entry &&
          'status' in entry &&
          (status === undefined || entry.status === status),
      )
      .map((entry) => entry.summary);
  }

  function runningSummaries(): string[] {
    return activitySummaries('running');
  }

  it('stops saying it is connecting once the route has accepted the request', async () => {
    const close = openStreamThatSendsNothing();
    const { result } = renderHook(() => useChatStream());

    act(() => {
      void result.current.sendMessage('hi', { conversationId: TEMP_CONVERSATION.id });
    });

    await vi.waitFor(() => {
      expect(runningSummaries()).toContain('Waiting for the first token');
    });
    expect(runningSummaries().some((summary) => summary.includes('Connecting'))).toBe(false);

    close();
  });

  it('says the router moved on when the response reports a route switch', async () => {
    const close = openStreamThatSendsNothing(
      new Headers({ 'X-AGI-Fallback-Reason': 'managed_failover' }),
    );
    const { result } = renderHook(() => useChatStream());

    act(() => {
      void result.current.sendMessage('hi', { conversationId: TEMP_CONVERSATION.id });
    });

    await vi.waitFor(() => {
      expect(activitySummaries()).toContain('Switched to a backup model');
    });

    close();
  });

  function respondWith(body: string, headers: Headers = new Headers()): void {
    const encoder = new TextEncoder();
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(body));
            controller.close();
          },
        }),
        { status: 200, headers },
      ),
    );
  }

  const ROTATED = new Headers({ 'X-AGI-Fallback-Reason': 'managed_failover' });
  const ANSWERED = 'data: {"choices":[{"delta":{"content":"answered"}}]}\n\ndata: [DONE]\n\n';

  /**
   * The rotation step is worth a row of its own, but a rotated turn is still an
   * ordinary turn and must settle like one. The first version appended the step
   * through the activity reducer, which drops the local starting entry the
   * moment a real entry appears, so a rotated turn lost the "Response ready"
   * every other turn ends on.
   */
  it('keeps the starting step a rotated turn still needs to settle on', async () => {
    const close = openStreamThatSendsNothing(ROTATED);
    const { result } = renderHook(() => useChatStream());

    act(() => {
      void result.current.sendMessage('hi', { conversationId: TEMP_CONVERSATION.id });
    });

    await vi.waitFor(() => {
      expect(activitySummaries()).toContain('Switched to a backup model');
    });
    expect(runningSummaries()).toContain('Waiting for the first token');

    close();
  });

  it('adds the switch row and nothing else to a rotated turn that answered', async () => {
    respondWith(ANSWERED);
    const first = renderHook(() => useChatStream());
    await act(async () => {
      await first.result.current.sendMessage('hi', { conversationId: TEMP_CONVERSATION.id });
    });
    const unrotated = activitySummaries();

    useChatStore.getState().reset();
    useChatStore.setState({
      activeConversationId: TEMP_CONVERSATION.id,
      conversations: [TEMP_CONVERSATION],
    });
    respondWith(ANSWERED, ROTATED);
    const second = renderHook(() => useChatStream());
    await act(async () => {
      await second.result.current.sendMessage('hi', { conversationId: TEMP_CONVERSATION.id });
    });

    expect(activitySummaries()).toEqual([...unrotated, 'Switched to a backup model']);
  });

  const FREE_LIMIT_FALLBACK = new Headers({ 'X-AGI-Fallback-Reason': 'free_limit_reached' });

  function assistantRow() {
    return useChatStore.getState().messages.find((message) => message.role === 'assistant');
  }

  it('says another free model answered once its reply arrives', async () => {
    respondWith(ANSWERED, FREE_LIMIT_FALLBACK);
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('hi', { conversationId: TEMP_CONVERSATION.id });
    });

    expect(assistantRow()?.fallbackReason).toBe('free_limit_reached');
  });

  it('does not say another free model answered when that model produced no reply', async () => {
    respondWith(
      `data: ${JSON.stringify({
        choices: [
          {
            index: 0,
            delta: {
              x_stream_error: {
                message: 'The free model returned no answer.',
                code: 'free_model_empty_response',
                retryable: false,
              },
            },
            finish_reason: null,
          },
        ],
      })}\n\ndata: [DONE]\n\n`,
      FREE_LIMIT_FALLBACK,
    );
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('hi', { conversationId: TEMP_CONVERSATION.id });
    });

    expect(assistantRow()?.metadata?.streamError).toBeDefined();
    expect(assistantRow()?.fallbackReason).toBeUndefined();
  });

  it('closes the waiting step as soon as the first token arrives', async () => {
    mockSseStream([{ choices: [{ delta: { content: 'hello' } }] }]);
    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('hi', { conversationId: TEMP_CONVERSATION.id });
    });

    expect(runningSummaries()).toEqual([]);
  });
});

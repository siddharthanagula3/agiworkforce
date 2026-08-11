import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getModelsForProvider } from '@agiworkforce/types';
import { cloudAccountAuth } from '../../services/cloudAccountAuth';
import {
  CLOUD_MAX_CONVERSATIONS,
  CLOUD_MAX_MESSAGES_PER_CONVERSATION,
  CLOUD_SSE_IDLE_TIMEOUT_MS,
  CLOUD_SSE_MAX_EVENT_CHARS,
  createCloudConversation,
  createCloudChatPersistenceClient,
  generateCloudImage,
  getCloudConversation,
  listCloudConversations,
  sendCloudApprovalResume,
  sendCloudMessage,
} from '../cloudApi';

const FIXTURE_MODEL_ID = 'fixture-model';
const GOOGLE_IMAGE_MODEL_ID = getModelsForProvider('google', {
  modelTypes: ['image'],
})[0]?.id;
if (!GOOGLE_IMAGE_MODEL_ID) {
  throw new Error('Cloud image tests require a Google image model in the canonical catalog');
}

const RAW_CONVERSATION = {
  id: 'conv_1',
  user_id: 'user_1',
  title: 'Test',
  model: 'claude',
  project_id: null,
  pinned: false,
  starred: false,
  archived: false,
  is_temporary: false,
  created_at: '2026-03-20T00:00:00.000Z',
  updated_at: '2026-03-20T00:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

describe('cloudApi', () => {
  beforeEach(() => {
    vi.spyOn(cloudAccountAuth, 'getSession').mockReturnValue({
      access_token: 'token',
    } as never);
    vi.spyOn(cloudAccountAuth, 'getValidSession').mockResolvedValue({
      access_token: 'token',
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('unwraps list responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          conversations: [
            {
              id: 'conv_1',
              user_id: 'user_1',
              title: 'Test',
              model: 'claude',
              project_id: null,
              pinned: false,
              starred: false,
              archived: false,
              is_temporary: false,
              created_at: '2026-03-20T00:00:00.000Z',
              updated_at: '2026-03-20T00:00:00.000Z',
            },
          ],
          hasMore: false,
          nextOffset: 1,
        }),
      ),
    );

    const conversations = await listCloudConversations();

    expect(conversations).toHaveLength(1);
    expect(conversations[0]?.id).toBe('conv_1');
  });

  it('rejects a non-advancing conversation page instead of looping forever', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        conversations: [RAW_CONVERSATION],
        hasMore: true,
        nextOffset: 0,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(listCloudConversations()).rejects.toMatchObject({
      code: 'managed_cloud_pagination_non_advancing',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects conversation history that exceeds the aggregate renderer limit', async () => {
    let pageIndex = 0;
    const fetchMock = vi.fn(async () => {
      const isOverflowPage = pageIndex * 100 >= CLOUD_MAX_CONVERSATIONS;
      const conversations = Array.from({ length: isOverflowPage ? 1 : 100 }, (_, index) => ({
        ...RAW_CONVERSATION,
        id: `conversation-${pageIndex}-${index}`,
      }));
      pageIndex += 1;
      return jsonResponse({
        conversations,
        hasMore: !isOverflowPage,
        nextOffset: pageIndex * 100,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(listCloudConversations()).rejects.toMatchObject({
      code: 'managed_cloud_pagination_item_limit',
      limit: CLOUD_MAX_CONVERSATIONS,
    });
    expect(fetchMock).toHaveBeenCalledTimes(CLOUD_MAX_CONVERSATIONS / 100);
  });

  it('allows same-account credential rotation at the final persistence transport boundary', async () => {
    vi.mocked(cloudAccountAuth.getValidSession)
      .mockResolvedValueOnce({
        access_token: 'stale-token',
        user: { id: 'account-a' },
      } as never)
      .mockResolvedValue({
        access_token: 'rotated-token',
        user: { id: 'account-a' },
      } as never);
    vi.mocked(cloudAccountAuth.getSession).mockReturnValue({
      access_token: 'rotated-token',
      user: { id: 'account-a' },
    } as never);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ conversations: [], hasMore: false, nextOffset: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    await createCloudChatPersistenceClient('account-a').listConversations();

    const headers = new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers);
    expect(headers.get('Authorization')).toBe('Bearer rotated-token');
  });

  it('blocks a queued persistence request when auth resolution switches accounts', async () => {
    vi.mocked(cloudAccountAuth.getValidSession).mockResolvedValue({
      access_token: 'account-b-token',
      user: { id: 'account-b' },
    } as never);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(createCloudChatPersistenceClient('account-a').listConversations()).rejects.toThrow(
      'account changed',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('discards a persistence response when the account switches in flight', async () => {
    vi.mocked(cloudAccountAuth.getValidSession).mockResolvedValue({
      access_token: 'account-a-token',
      user: { id: 'account-a' },
    } as never);
    vi.mocked(cloudAccountAuth.getSession).mockReturnValue({
      access_token: 'account-a-token',
      user: { id: 'account-a' },
    } as never);
    const fetchMock = vi.fn(async () => {
      vi.mocked(cloudAccountAuth.getSession).mockReturnValue({
        access_token: 'account-b-token',
        user: { id: 'account-b' },
      } as never);
      return jsonResponse({ conversations: [], hasMore: false, nextOffset: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(createCloudChatPersistenceClient('account-a').listConversations()).rejects.toThrow(
      'account changed',
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('unwraps create responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          conversation: {
            id: 'conv_1',
            user_id: 'user_1',
            title: 'Test',
            model: 'claude',
            project_id: null,
            pinned: false,
            starred: false,
            archived: false,
            is_temporary: false,
            created_at: '2026-03-20T00:00:00.000Z',
            updated_at: '2026-03-20T00:00:00.000Z',
          },
        }),
      ),
    );

    const conversation = await createCloudConversation('Test', 'claude');

    expect(conversation.id).toBe('conv_1');
  });

  it('merges conversation payload with messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          conversation: {
            id: 'conv_1',
            user_id: 'user_1',
            title: 'Test',
            model: 'claude',
            project_id: null,
            pinned: false,
            starred: false,
            archived: false,
            is_temporary: false,
            created_at: '2026-03-20T00:00:00.000Z',
            updated_at: '2026-03-20T00:00:00.000Z',
          },
          messages: [
            {
              id: 'msg_1',
              conversation_id: 'conv_1',
              role: 'user',
              content: 'Hello',
              model: null,
              provider: null,
              input_tokens: 0,
              output_tokens: 0,
              metadata: {},
              created_at: '2026-03-20T00:00:00.000Z',
            },
          ],
          total: 1,
          hasMore: false,
        }),
      ),
    );

    const conversation = await getCloudConversation('conv_1');

    expect(conversation.id).toBe('conv_1');
    expect(conversation.messages).toHaveLength(1);
  });

  it('rejects a transcript that exceeds the aggregate renderer limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          conversation: RAW_CONVERSATION,
          messages: [],
          total: CLOUD_MAX_MESSAGES_PER_CONVERSATION + 1,
          hasMore: true,
        }),
      ),
    );

    await expect(getCloudConversation('conv_1')).rejects.toMatchObject({
      code: 'managed_cloud_pagination_item_limit',
      limit: CLOUD_MAX_MESSAGES_PER_CONVERSATION,
    });
  });

  it('generates a durable Cloud image through the managed-media endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        persisted: true,
        images: [{ url: '/api/files/image-asset-1' }],
        provider: 'google',
        model: GOOGLE_IMAGE_MODEL_ID,
        latency_ms: 12_000,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateCloudImage({
      prompt: 'Create an image of a glass lighthouse',
      provider: 'google',
      model: GOOGLE_IMAGE_MODEL_ID,
      idempotencyKey: 'agi.media.desktop.image.0190a000-0000-7000-8000-000000000001',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/media/image/generate'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
          'Idempotency-Key': 'agi.media.desktop.image.0190a000-0000-7000-8000-000000000001',
        }),
        body: JSON.stringify({
          prompt: 'Create an image of a glass lighthouse',
          provider: 'google',
          model: GOOGLE_IMAGE_MODEL_ID,
          size: '1024x1024',
          n: 1,
          quality: 'standard',
          // Additive image-edit fields with safe defaults. The desktop client
          // builds this payload through the shared contract schema, so a plain
          // text-to-image request now carries them explicitly.
          operation: 'generate',
          transparent_background: false,
        }),
      }),
    );
    expect(result).toEqual({
      id: 'image-asset-1',
      uri: expect.stringContaining('/api/files/image-asset-1'),
      provider: 'google',
      model: GOOGLE_IMAGE_MODEL_ID,
    });
  });

  it('rejects an image result that cannot survive a reload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: true,
          persisted: false,
          images: [{ b64_json: 'inline-bytes' }],
          provider: 'google',
          model: GOOGLE_IMAGE_MODEL_ID,
        }),
      ),
    );

    await expect(
      generateCloudImage({
        prompt: 'Create an image',
        provider: 'google',
        model: GOOGLE_IMAGE_MODEL_ID,
        idempotencyKey: 'agi.media.desktop.image.0190a000-0000-7000-8000-000000000002',
      }),
    ).rejects.toThrow('durable Cloud media storage is not configured');
  });

  it('posts message payloads and streams SSE chunks', async () => {
    const runId = '019c3330-02b7-7000-8000-000000000001';
    const runPath = `/api/llm/v1/chat/completions/runs/${runId}`;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"id":"chatcmpl-1","choices":[{"delta":{"role":"assistant"}}]}\n\n',
          ),
        );
        controller.enqueue(
          encoder.encode('data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"Hello"}}]}\n\n'),
        );
        controller.enqueue(
          encoder.encode(
            'data: {"id":"chatcmpl-1","choices":[{"delta":{"content":" world"}}]}\n\n',
          ),
        );
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'X-AGI-Agent-Run-Id': runId,
          'X-AGI-Agent-Run-URL': runPath,
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const chunks: string[] = [];
    const onDone = vi.fn();
    const onError = vi.fn();
    const onEvent = vi.fn();
    const onRunHandle = vi.fn();

    await sendCloudMessage(
      'conv_1',
      'Ping',
      FIXTURE_MODEL_ID,
      (chunk) => chunks.push(chunk),
      onDone,
      onError,
      undefined,
      onEvent,
      undefined,
      undefined,
      undefined,
      undefined,
      'agi.chat.desktop.send.0190a000-0000-7000-8000-000000000001',
      undefined,
      onRunHandle,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/llm/v1/chat/completions'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': 'agi.chat.desktop.send.0190a000-0000-7000-8000-000000000001',
          'X-AGI-Surface': 'desktop',
        }),
        body: JSON.stringify({
          model: FIXTURE_MODEL_ID,
          messages: [{ role: 'user', content: 'Ping' }],
          conversation_id: 'conv_1',
          stream: true,
          // DES-C25: the route reads `client_timezone` and drops the whole
          // "use that local calendar date for 'today'" clause without it.
          client_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          use_prompt_cache: true,
        }),
      }),
    );
    expect(chunks.join('')).toBe('Hello world');
    expect(onEvent).toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(onRunHandle).toHaveBeenCalledWith({ runId, runPath });
    expect(onRunHandle).toHaveBeenCalledOnce();
  });

  it('cancels an open response body as soon as the DONE sentinel arrives', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
      },
      cancel,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 200 })));

    const onDone = vi.fn();
    const onError = vi.fn();
    await sendCloudMessage(
      'conv_done',
      'Continue',
      FIXTURE_MODEL_ID,
      vi.fn(),
      onDone,
      onError,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'agi.chat.desktop.send.0190a000-0000-7000-8000-000000000070',
    );

    expect(onDone).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('times out and cancels a half-open successful SSE response', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();
    const onError = vi.fn();

    const pending = sendCloudMessage(
      'conv_idle',
      'Continue',
      FIXTURE_MODEL_ID,
      vi.fn(),
      onDone,
      onError,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'agi.chat.desktop.send.0190a000-0000-7000-8000-000000000071',
    );
    for (let index = 0; index < 10; index += 1) await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(CLOUD_SSE_IDLE_TIMEOUT_MS);
    await pending;

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('idle for 90 seconds') }),
    );
    expect(onDone).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('rejects and cancels an oversized unfinished SSE line', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(`data: ${'x'.repeat(CLOUD_SSE_MAX_EVENT_CHARS + 1)}`),
        );
      },
      cancel,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 200 })));
    const onError = vi.fn();

    await sendCloudMessage(
      'conv_oversized',
      'Continue',
      FIXTURE_MODEL_ID,
      vi.fn(),
      vi.fn(),
      onError,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'agi.chat.desktop.send.0190a000-0000-7000-8000-000000000072',
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('safe renderer limit') }),
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('bounds the aggregate data fields of a multi-line SSE event', async () => {
    const cancel = vi.fn();
    const half = 'x'.repeat(Math.floor(CLOUD_SSE_MAX_EVENT_CHARS / 2) + 1);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`data: ${half}\ndata: ${half}\n`));
      },
      cancel,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 200 })));
    const onError = vi.fn();

    await sendCloudMessage(
      'conv_aggregate',
      'Continue',
      FIXTURE_MODEL_ID,
      vi.fn(),
      vi.fn(),
      onError,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'agi.chat.desktop.send.0190a000-0000-7000-8000-000000000073',
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('safe renderer limit') }),
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('cancels the response when managed run headers are invalid', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { 'X-AGI-Agent-Run-Id': '019c3330-02b7-7000-8000-000000000001' },
        }),
      ),
    );
    const onDone = vi.fn();
    const onError = vi.fn();

    await sendCloudMessage(
      'conv_bad_run',
      'Continue',
      FIXTURE_MODEL_ID,
      vi.fn(),
      onDone,
      onError,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'agi.chat.desktop.send.0190a000-0000-7000-8000-000000000074',
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('headers are incomplete') }),
    );
    expect(onDone).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('dispatches a retried canonical event and its text projection exactly once', async () => {
    const envelope = {
      schemaVersion: 3,
      sessionId: 'session-desktop-1',
      turnId: 'turn-desktop-1',
      sequence: 4,
      emittedAtMs: 1_000,
      event: { type: 'text-delta', delta: 'Durable answer.' },
    };
    const payload = JSON.stringify({
      choices: [{ delta: { content: 'Durable answer.', x_agent_event: envelope } }],
    });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`data: ${payload}\n\ndata: ${payload}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 200 })));

    const chunks: string[] = [];
    const onEvent = vi.fn();
    await sendCloudMessage(
      'conv_retry',
      'Continue',
      FIXTURE_MODEL_ID,
      (chunk) => chunks.push(chunk),
      vi.fn(),
      vi.fn(),
      undefined,
      onEvent,
      undefined,
      undefined,
      undefined,
      undefined,
      'agi.chat.desktop.send.0190a000-0000-7000-8000-000000000099',
    );

    expect(chunks).toEqual(['Durable answer.']);
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it('treats a malformed data event as terminal instead of reporting success', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode('data: {not-json}\n\n'));
      },
      cancel,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 200 })));

    const onDone = vi.fn();
    const onError = vi.fn();
    await sendCloudMessage(
      'conv_malformed',
      'Continue',
      FIXTURE_MODEL_ID,
      vi.fn(),
      onDone,
      onError,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'agi.chat.desktop.send.0190a000-0000-7000-8000-000000000077',
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'AGI Cloud returned a malformed stream event.' }),
    );
    expect(onDone).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('treats a structured Cloud error event as terminal instead of reporting success', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode('data: {"error":{"message":"Provider stream failed"}}\n\n'),
        );
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 200 })));

    const onDone = vi.fn();
    const onError = vi.fn();
    await sendCloudMessage(
      'conv_error',
      'Continue',
      FIXTURE_MODEL_ID,
      vi.fn(),
      onDone,
      onError,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'agi.chat.desktop.send.0190a000-0000-7000-8000-000000000078',
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Provider stream failed' }),
    );
    expect(onDone).not.toHaveBeenCalled();
  });

  it('includes managed runtime options without resolving skill content on Desktop', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await sendCloudMessage(
      'conv_research',
      'Investigate',
      FIXTURE_MODEL_ID,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      undefined,
      undefined,
      true,
      undefined,
      true,
      true,
      'agi.chat.desktop.send.0190a000-0000-7000-8000-000000000002',
      { research: true, workMode: 'agiwork', skillName: 'frontend-design', effort: 'high' },
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual(
      expect.objectContaining({
        research: true,
        web_search: true,
        web_fetch: true,
        thinking_mode: true,
        code_execution: true,
        work_mode: 'agiwork',
        skill_name: 'frontend-design',
        effort: 'high',
      }),
    );
  });

  it('resumes a server-owned approval checkpoint without replaying model messages', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await sendCloudApprovalResume(
      '0190a000-0000-7000-8000-000000000099',
      [{ tool_call_id: 'call_1', decision: 'approved' }],
      vi.fn(),
      vi.fn(),
      vi.fn(),
      undefined,
      undefined,
      'agi.chat.desktop.tool-resume.0190a000-0000-7000-8000-000000000098',
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual({
      run_id: '0190a000-0000-7000-8000-000000000099',
      tool_approvals: [{ tool_call_id: 'call_1', decision: 'approved' }],
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloudAccountAuth } from '../../services/cloudAccountAuth';
import {
  createCloudConversation,
  getCloudConversation,
  listCloudConversations,
  sendCloudApprovalResume,
  sendCloudMessage,
} from '../cloudApi';

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
  });

  afterEach(() => {
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
              created_at: '2026-03-20T00:00:00.000Z',
              updated_at: '2026-03-20T00:00:00.000Z',
            },
          ],
        }),
      ),
    );

    const conversations = await listCloudConversations();

    expect(conversations).toHaveLength(1);
    expect(conversations[0]?.id).toBe('conv_1');
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
            created_at: '2026-03-20T00:00:00.000Z',
            updated_at: '2026-03-20T00:00:00.000Z',
          },
          messages: [
            {
              id: 'msg_1',
              conversation_id: 'conv_1',
              role: 'user',
              content: 'Hello',
              created_at: '2026-03-20T00:00:00.000Z',
            },
          ],
        }),
      ),
    );

    const conversation = await getCloudConversation('conv_1');

    expect(conversation.id).toBe('conv_1');
    expect(conversation.messages).toHaveLength(1);
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
      'claude-haiku-4-5-20251001',
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
          model: 'claude-haiku-4-5-20251001',
          messages: [{ role: 'user', content: 'Ping' }],
          stream: true,
        }),
      }),
    );
    expect(chunks.join('')).toBe('Hello world');
    expect(onEvent).toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(onRunHandle).toHaveBeenCalledWith({ runId, runPath });
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
      'gpt-5.6-sol',
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
      'claude-sonnet-5',
      vi.fn(),
      vi.fn(),
      vi.fn(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'agi.chat.desktop.send.0190a000-0000-7000-8000-000000000002',
      { research: true, workMode: 'agiwork', skillName: 'frontend-design' },
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual(
      expect.objectContaining({
        research: true,
        work_mode: 'agiwork',
        skill_name: 'frontend-design',
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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseAuth } from '../../services/supabaseAuth';
import {
  createCloudConversation,
  getCloudConversation,
  listCloudConversations,
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
    vi.spyOn(supabaseAuth, 'getSession').mockReturnValue({
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
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"conversation_id":"conv_1"}\n\n'));
        controller.enqueue(encoder.encode('data: {"text":"Hello"}\n\n'));
        controller.enqueue(encoder.encode('data: {"text":" world"}\n\n'));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const chunks: string[] = [];
    const onDone = vi.fn();
    const onError = vi.fn();
    const onEvent = vi.fn();

    await sendCloudMessage(
      'conv_1',
      'Ping',
      'claude-haiku-4-5-20251001',
      (chunk) => chunks.push(chunk),
      onDone,
      onError,
      undefined,
      onEvent,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/cloud-chat/send'),
      expect.objectContaining({
        body: JSON.stringify({
          conversation_id: 'conv_1',
          message: 'Ping',
          model: 'claude-haiku-4-5-20251001',
        }),
      }),
    );
    expect(chunks.join('')).toBe('Hello world');
    expect(onEvent).toHaveBeenCalledWith({ conversation_id: 'conv_1' });
    expect(onDone).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });
});


import { sendCloudMessage } from '../api/cloudApi';
import { createManagedChatIdempotencyKey } from '@agiworkforce/utils';

function dispatchCloudEvent(event: string, payload: unknown): void {
  const eventKey = `__cloud_web_${event}`;
  window.dispatchEvent(new CustomEvent(eventKey, { detail: payload }));
}

interface StreamStartPayload {
  conversation_id: string;
  message_id: string;
  created_at: string;
}

interface StreamChunkPayload {
  conversation_id: string;
  message_id: string;
  delta: string;
  content: string;
}

interface StreamEndPayload {
  conversation_id: string;
  message_id: string;
}

interface StreamErrorPayload {
  conversation_id: string;
  message_id: string;
  error: string;
}

interface StartCloudChatStreamOptions {
  conversationId?: string;
  content: string;
  model: string;
  messageId?: string;
  signal?: AbortSignal;
}

/**
 * Initiates a cloud chat message send and bridges the SSE stream into
 * synthetic Tauri events that the existing stream listener hooks consume.
 *
 * @param conversationId - The conversation to send the message in
 * @param content        - The user's message text
 * @param model          - The model identifier to use
 * @param signal         - Optional AbortSignal for cancellation
 * @returns Promise that resolves when the stream completes
 */
export async function startCloudChatStream(options: StartCloudChatStreamOptions): Promise<void> {
  const messageId = options.messageId ?? `cloud_${crypto.randomUUID()}`;
  let conversationId = options.conversationId ?? `cloud_${crypto.randomUUID()}`;
  let fullContent = '';
  let started = false;

  const emitStart = () => {
    if (started) {
      return;
    }
    started = true;
    dispatchCloudEvent('chat:stream-start', {
      conversation_id: conversationId,
      message_id: messageId,
      created_at: new Date().toISOString(),
    } satisfies StreamStartPayload);
  };

  return new Promise<void>((resolve, reject) => {
    sendCloudMessage(
      conversationId,
      options.content,
      options.model,
      (text: string) => {
        emitStart();
        fullContent += text;
        dispatchCloudEvent('chat:stream-chunk', {
          conversation_id: conversationId,
          message_id: messageId,
          delta: text,
          content: fullContent,
        } satisfies StreamChunkPayload);
      },
      () => {
        emitStart();
        dispatchCloudEvent('chat:stream-end', {
          conversation_id: conversationId,
          message_id: messageId,
        } satisfies StreamEndPayload);
        resolve();
      },
      (err: Error) => {
        emitStart();
        dispatchCloudEvent('chat:stream-error', {
          conversation_id: conversationId,
          message_id: messageId,
          error: err.message,
        } satisfies StreamErrorPayload);

        reject(err);
      },
      options.signal,
      (payload) => {
        const nextConversationId = payload['conversation_id'];
        if (typeof nextConversationId === 'string' && nextConversationId.length > 0) {
          conversationId = nextConversationId;
        }
      },
      undefined,
      undefined,
      undefined,
      undefined,
      createManagedChatIdempotencyKey({
        surface: 'desktop',
        purpose: 'send',
        operationId: messageId.replace(/^cloud_/, ''),
      }),
    ).catch((err) => {
      const error = err instanceof Error ? err : new Error(String(err));
      emitStart();
      dispatchCloudEvent('chat:stream-error', {
        conversation_id: conversationId,
        message_id: messageId,
        error: error.message,
      } satisfies StreamErrorPayload);
      reject(error);
    });
  });
}

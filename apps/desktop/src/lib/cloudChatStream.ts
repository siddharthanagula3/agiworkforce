/**
 * Cloud Chat Stream Emitter
 *
 * Bridges SSE streaming from the cloud API gateway into synthetic Tauri events
 * so that `useTauriStreamListeners` works identically in web mode.
 *
 * Event flow:
 *   cloudApi.sendCloudMessage(onChunk, onDone, onError)
 *     → dispatchCloudEvent('stream:start', ...)
 *     → dispatchCloudEvent('stream:delta', ...) × N
 *     → dispatchCloudEvent('stream:end', ...)
 */

import { sendCloudMessage } from '../api/cloudApi';

// ---------------------------------------------------------------------------
// Event Dispatcher — mirrors Tauri emit() for cloud web mode
// ---------------------------------------------------------------------------

function dispatchCloudEvent(event: string, payload: unknown): void {
  const eventKey = `__cloud_web_${event}`;
  window.dispatchEvent(new CustomEvent(eventKey, { detail: payload }));
}

// ---------------------------------------------------------------------------
// Stream Types — match what useTauriStreamListeners expects
// ---------------------------------------------------------------------------

interface StreamStartPayload {
  conversationId: string;
  messageId: string;
  model: string;
}

interface StreamDeltaPayload {
  conversationId: string;
  messageId: string;
  delta: string;
}

interface StreamEndPayload {
  conversationId: string;
  messageId: string;
  fullContent: string;
  model: string;
  tokens?: number;
  cost?: number;
}

interface StreamErrorPayload {
  conversationId: string;
  messageId: string;
  error: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
export async function startCloudChatStream(
  conversationId: string,
  content: string,
  model: string,
  signal?: AbortSignal,
): Promise<void> {
  const messageId = `cloud_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  let fullContent = '';

  // Emit stream:start
  dispatchCloudEvent('stream:start', {
    conversationId,
    messageId,
    model,
  } satisfies StreamStartPayload);

  return new Promise<void>((resolve, reject) => {
    sendCloudMessage(
      conversationId,
      content,
      model,
      // onChunk — called for each text delta
      (text: string) => {
        fullContent += text;
        dispatchCloudEvent('stream:delta', {
          conversationId,
          messageId,
          delta: text,
        } satisfies StreamDeltaPayload);
      },
      // onDone — called when the stream ends successfully
      () => {
        dispatchCloudEvent('stream:end', {
          conversationId,
          messageId,
          fullContent,
          model,
        } satisfies StreamEndPayload);
        resolve();
      },
      // onError — called if the stream encounters an error
      (err: Error) => {
        dispatchCloudEvent('stream:error', {
          conversationId,
          messageId,
          error: err.message,
        } satisfies StreamErrorPayload);

        // Also emit stream:end so listeners clean up
        dispatchCloudEvent('stream:end', {
          conversationId,
          messageId,
          fullContent,
          model,
        } satisfies StreamEndPayload);

        reject(err);
      },
      signal,
    ).catch((err) => {
      // Catch any unhandled errors from sendCloudMessage itself
      const error = err instanceof Error ? err : new Error(String(err));
      dispatchCloudEvent('stream:error', {
        conversationId,
        messageId,
        error: error.message,
      } satisfies StreamErrorPayload);
      dispatchCloudEvent('stream:end', {
        conversationId,
        messageId,
        fullContent,
        model,
      } satisfies StreamEndPayload);
      reject(error);
    });
  });
}

import { API_URL, TIMEOUTS } from '@/lib/constants';
import { combineAbortSignals } from '@/lib/abortSignal';
import { AbortError } from '@agiworkforce/utils';
import { supabase } from './supabase';

export interface StreamDelta {
  content?: string;
  reasoning?: string;
  role?: string;
  finish_reason?: string | null;
}

export interface StreamCallbacks {
  onDelta: (delta: StreamDelta) => void;
  onDone: () => void;
  onError: (error: Error) => void;
  /** Optional: called when a reconnect attempt is starting (attempt number, 1-based) */
  onReconnecting?: (attempt: number) => void;
}

/** Maximum number of reconnect attempts on a network interruption */
const MAX_RECONNECT_ATTEMPTS = 3;

/** Exponential backoff delays (ms) for reconnect attempts */
const RECONNECT_DELAYS = [1_000, 2_500, 5_000];

/**
 * Returns true if the error looks like a transient network interruption
 * (as opposed to a deliberate abort or an application-level HTTP error).
 */
function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) {
    // fetch throws TypeError on network failure / stream read failure
    return true;
  }
  if (
    err instanceof AbortError ||
    (typeof DOMException !== 'undefined' &&
      err instanceof DOMException &&
      err.name === 'AbortError')
  ) {
    // AbortError from the user or timeout controller — not a network error
    return false;
  }
  return false;
}

/**
 * Attempt a single streaming fetch and consume the SSE stream.
 * Returns true when the stream ends cleanly (onDone was called),
 * or throws on network-level errors so the caller can retry.
 */
async function attemptStream(
  body: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    stream: true;
    thinking?: boolean;
  },
  callbacks: StreamCallbacks,
  signal: AbortSignal,
): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const response = await fetch(`${API_URL}/api/llm/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    callbacks.onError(new Error(`HTTP ${response.status}: ${text}`));
    return false;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onError(new Error('No response body'));
    return false;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let doneCalled = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const payload = trimmed.slice(6);
        if (payload === '[DONE]') {
          if (!doneCalled) {
            doneCalled = true;
            callbacks.onDone();
          }
          return true;
        }

        try {
          const parsed = JSON.parse(payload);
          const choice = parsed.choices?.[0];
          if (choice?.delta) {
            callbacks.onDelta(choice.delta);
          }
          if (choice?.finish_reason) {
            callbacks.onDelta({ finish_reason: choice.finish_reason });
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    if (!doneCalled) {
      doneCalled = true;
      callbacks.onDone();
    }
    return true;
  } finally {
    reader.releaseLock();
  }
}

/**
 * SSE streaming consumer for `/api/llm/v1/chat/completions`.
 * Uses fetch + ReadableStream (RN 0.76+ supports this natively).
 *
 * Network-level errors (TypeError from fetch/read) trigger automatic
 * reconnection with exponential backoff up to MAX_RECONNECT_ATTEMPTS times.
 * The caller can track reconnect attempts via the optional onReconnecting callback.
 */
export async function streamChat(
  body: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    stream: true;
    thinking?: boolean;
  },
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  // Combine caller signal with streaming timeout
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), TIMEOUTS.STREAMING);
  const combinedSignal = signal
    ? combineAbortSignals([signal, timeoutController.signal])
    : timeoutController.signal;

  let lastNetworkError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
    // Bail out immediately if the caller or timeout aborted
    if (combinedSignal.aborted) {
      clearTimeout(timeoutId);
      return;
    }

    // Backoff before retry attempts (not before the first attempt)
    if (attempt > 0) {
      const delay = RECONNECT_DELAYS[attempt - 1] ?? RECONNECT_DELAYS[RECONNECT_DELAYS.length - 1];
      callbacks.onReconnecting?.(attempt);

      await new Promise<void>((resolve, reject) => {
        // If already aborted, skip the wait entirely
        if (combinedSignal.aborted) {
          reject(new AbortError('Aborted during reconnect backoff'));
          return;
        }
        const tid = setTimeout(resolve, delay);
        // Cancel the wait if the signal aborts during backoff
        combinedSignal.addEventListener(
          'abort',
          () => {
            clearTimeout(tid);
            reject(new AbortError('Aborted during reconnect backoff'));
          },
          { once: true },
        );
      }).catch(() => {
        // Aborted during backoff — exit cleanly
        clearTimeout(timeoutId);
        return;
      });

      if (combinedSignal.aborted) {
        clearTimeout(timeoutId);
        return;
      }
    }

    try {
      const completed = await attemptStream(body, callbacks, combinedSignal);
      if (completed) {
        clearTimeout(timeoutId);
        return;
      }
      // onError was already called inside attemptStream for non-network errors
      clearTimeout(timeoutId);
      return;
    } catch (err) {
      if (combinedSignal.aborted || signal?.aborted) {
        // Intentional abort — do not retry
        clearTimeout(timeoutId);
        return;
      }

      if (isNetworkError(err)) {
        lastNetworkError = err instanceof Error ? err : new Error(String(err));
        // Continue to next attempt
        continue;
      }

      // Non-network error — surface immediately, no retry
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      clearTimeout(timeoutId);
      return;
    }
  }

  // All reconnect attempts exhausted
  clearTimeout(timeoutId);
  callbacks.onError(
    lastNetworkError ?? new Error('Stream failed after maximum reconnect attempts'),
  );
}

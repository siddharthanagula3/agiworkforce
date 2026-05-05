import { API_URL, TIMEOUTS } from '@/lib/constants';
import { combineAbortSignals } from '@/lib/abortSignal';
import { AbortError } from '@agiworkforce/utils';
import {
  streamFromProvider,
  type ProviderStreamProvider,
  type StreamChunk as ProviderStreamChunk,
} from '@/lib/providerStreamClient';
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
    // fetch throws TypeError on network failure, but also for malformed requests.
    // Only treat network-specific messages as transient (worth retrying).
    const msg = err.message.toLowerCase();
    return (
      msg.includes('network') ||
      msg.includes('fetch') ||
      msg.includes('load failed') ||
      msg.includes('cancelled')
    );
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
    messages: Array<{
      role: string;
      content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    }>;
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
 * Default-off feature flag: when `EXPO_PUBLIC_USE_PROVIDER_STREAM === '1'`,
 * `streamChat` will first try the api-gateway's `/api/v1/providers/:id/stream`
 * endpoint and fall back to the legacy `/api/llm/v1/chat/completions` path on
 * error.
 */
const USE_PROVIDER_STREAM = process.env.EXPO_PUBLIC_USE_PROVIDER_STREAM === '1';

const VALID_PROVIDER_IDS: ReadonlySet<ProviderStreamProvider> = new Set([
  'anthropic',
  'openai',
  'google',
  'ollama',
]);

function inferProviderFromModel(modelId: string | undefined): ProviderStreamProvider {
  if (!modelId) return 'anthropic';
  const m = modelId.toLowerCase();
  if (m.startsWith('claude-')) return 'anthropic';
  if (m.startsWith('gpt-') || m.startsWith('o1-') || m.startsWith('codex-')) return 'openai';
  if (m.startsWith('gemini-')) return 'google';
  if (
    m === 'ollama-local' ||
    m.startsWith('llama') ||
    m.startsWith('qwen') ||
    m.startsWith('mistral')
  ) {
    return 'ollama';
  }
  return 'anthropic';
}

function getProviderOverride(): 'auto' | ProviderStreamProvider {
  const raw = process.env.EXPO_PUBLIC_PROVIDER_STREAM_PROVIDER?.trim().toLowerCase();
  if (!raw || raw === 'auto') return 'auto';
  return VALID_PROVIDER_IDS.has(raw as ProviderStreamProvider)
    ? (raw as ProviderStreamProvider)
    : 'auto';
}

/**
 * Flatten the chat-completions content shape (string OR multimodal parts) down
 * to a single string for the provider-stream endpoint, which currently only
 * accepts text. Image parts are dropped with a `[image]` placeholder so the
 * conversation history remains coherent.
 */
function flattenChatContent(
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>,
): string {
  if (typeof content === 'string') return content;
  return content
    .map((part) => (part.type === 'text' && part.text ? part.text : '[image]'))
    .join('\n');
}

/**
 * Attempt a streaming reply via the api-gateway provider-stream endpoint.
 * Throws on transport / upstream error so the caller can fall back to the
 * legacy chat-completions path. Returns `true` on a clean stop.
 */
async function attemptProviderStream(
  body: {
    model: string;
    messages: Array<{
      role: string;
      content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    }>;
  },
  callbacks: StreamCallbacks,
  signal: AbortSignal,
): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('No Supabase session for provider-stream path');
  }

  const override = getProviderOverride();
  const providerId = override === 'auto' ? inferProviderFromModel(body.model) : override;

  const flattened: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = body.messages
    .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: flattenChatContent(m.content),
    }));

  const stream = streamFromProvider({
    gatewayUrl: API_URL,
    providerId,
    authToken: token,
    request: { model: body.model, messages: flattened },
    signal,
  });

  let sawError: { code?: string; message: string } | null = null;
  let doneCalled = false;
  for await (const chunk of stream as AsyncIterable<ProviderStreamChunk>) {
    if (chunk.type === 'text-delta') {
      if (chunk.delta) callbacks.onDelta({ content: chunk.delta });
    } else if (chunk.type === 'thinking-delta') {
      if (chunk.delta) callbacks.onDelta({ reasoning: chunk.delta });
    } else if (chunk.type === 'error') {
      sawError = { ...(chunk.code ? { code: chunk.code } : {}), message: chunk.message };
    } else if (chunk.type === 'stop') {
      if (sawError) {
        throw new Error(`provider-stream:${sawError.code ?? 'STREAM_ERROR'}:${sawError.message}`);
      }
      callbacks.onDelta({ finish_reason: chunk.reason });
      doneCalled = true;
      callbacks.onDone();
      return true;
    }
  }
  if (sawError) {
    throw new Error(`provider-stream:${sawError.code ?? 'STREAM_ERROR'}:${sawError.message}`);
  }
  if (!doneCalled) callbacks.onDone();
  return true;
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
    messages: Array<{
      role: string;
      content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    }>;
    stream: true;
    thinking?: boolean;
  },
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  // Per-attempt timeout — each stream attempt gets a fresh timeout so backoff
  // waits don't eat into the next attempt's time budget.
  let timeoutController = new AbortController();
  let timeoutId = setTimeout(() => timeoutController.abort(), TIMEOUTS.STREAMING);
  let combinedSignal = signal
    ? combineAbortSignals([signal, timeoutController.signal])
    : timeoutController.signal;

  // Feature-flagged: route through the api-gateway provider-stream endpoint
  // first. Falls through to the legacy chat-completions path on failure so a
  // misconfigured gateway never strands the user.
  if (USE_PROVIDER_STREAM) {
    try {
      const ok = await attemptProviderStream(
        { model: body.model, messages: body.messages },
        callbacks,
        combinedSignal,
      );
      if (ok) {
        clearTimeout(timeoutId);
        return;
      }
    } catch (err) {
      if (combinedSignal.aborted || signal?.aborted) {
        clearTimeout(timeoutId);
        return;
      }
      // Reset the timeout for the legacy retry budget
      console.warn('[streaming] provider-stream path failed, falling back to legacy:', err);
      clearTimeout(timeoutId);
      timeoutController = new AbortController();
      timeoutId = setTimeout(() => timeoutController.abort(), TIMEOUTS.STREAMING);
      combinedSignal = signal
        ? combineAbortSignals([signal, timeoutController.signal])
        : timeoutController.signal;
    }
  }

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

      // Reset timeout for this new attempt so backoff waits don't eat the budget
      clearTimeout(timeoutId);
      timeoutController = new AbortController();
      timeoutId = setTimeout(() => timeoutController.abort(), TIMEOUTS.STREAMING);
      combinedSignal = signal
        ? combineAbortSignals([signal, timeoutController.signal])
        : timeoutController.signal;
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

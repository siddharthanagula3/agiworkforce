import { API_URL, TIMEOUTS } from '@/lib/constants';
import { combineAbortSignals } from '@/lib/abortSignal';
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
}

/**
 * SSE streaming consumer for `/api/llm/v1/chat/completions`.
 * Uses fetch + ReadableStream (RN 0.76+ supports this natively).
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
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  // Combine caller signal with streaming timeout
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), TIMEOUTS.STREAMING);
  const combinedSignal = signal
    ? combineAbortSignals([signal, timeoutController.signal])
    : timeoutController.signal;

  let doneCalled = false;

  try {
    const response = await fetch(`${API_URL}/api/llm/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: combinedSignal,
    });

    if (!response.ok) {
      const text = await response.text();
      callbacks.onError(new Error(`HTTP ${response.status}: ${text}`));
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      callbacks.onError(new Error('No response body'));
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

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
            return;
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
    } finally {
      reader.releaseLock();
    }
  } catch (err) {
    if (signal?.aborted || combinedSignal.aborted) return;
    callbacks.onError(err instanceof Error ? err : new Error(String(err)));
  } finally {
    clearTimeout(timeoutId);
  }
}

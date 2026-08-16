
import type { StreamChunk } from '@agiworkforce/types';
import { DEFAULT_STREAM_IDLE_TIMEOUT_MS, StreamIdleTimeoutError } from '../watchdog';
import { stripTrailingSlashes } from '@agiworkforce/types';

export interface StreamIdleWatchdogOptions {
  idleMs?: number;
}

export interface StreamFromProviderOptions<TRequest = unknown> {
  providerId: string;
  authToken: string;
  request: TRequest;
  signal?: AbortSignal;
  baseUrl?: string;
  fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  clientTag: string;
  idleWatchdog?: boolean | StreamIdleWatchdogOptions;
  catchTransportErrors?: boolean;
  surfaceMalformedFrames?: boolean;
  detectPaywall?: boolean;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Provider stream failed.';
}

function combineSignals(
  a: AbortSignal | undefined,
  b: AbortSignal | undefined,
): AbortSignal | undefined {
  if (!a) return b;
  if (!b) return a;
  const controller = new AbortController();
  for (const signal of [a, b]) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

async function* decodeSseFrames<TChunk>(
  byteChunks: AsyncIterable<Uint8Array>,
  surfaceMalformedFrames: boolean,
): AsyncIterable<TChunk> {
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  for await (const value of byteChunks) {
    buffer += decoder.decode(value, { stream: true });

    let frameEnd: number;
    while ((frameEnd = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, frameEnd);
      buffer = buffer.slice(frameEnd + 2);
      const dataLines = frame
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart());
      const data = dataLines.join('\n').trim();
      if (!data) continue;
      if (data === '[DONE]') return;
      try {
        yield JSON.parse(data) as TChunk;
      } catch (error) {
        if (surfaceMalformedFrames) {
          yield {
            type: 'error',
            code: 'MALFORMED_SSE_FRAME',
            message: `Malformed provider stream frame: ${errorMessage(error)}`,
            retryable: false,
          } as unknown as TChunk;
        }
        // else: skip the malformed frame silently (original web/extension/vscode behaviour).
      }
    }
  }
}

interface RawPaywallBody {
  kind?: unknown;
  feature?: unknown;
  requiredTier?: unknown;
  reason?: unknown;
}

export async function* streamFromProvider<TRequest = unknown, TChunk = StreamChunk>(
  options: StreamFromProviderOptions<TRequest>,
): AsyncIterable<TChunk> {
  const {
    providerId,
    authToken,
    request,
    signal,
    baseUrl = '',
    fetchImpl,
    clientTag,
    idleWatchdog = false,
    catchTransportErrors = false,
    surfaceMalformedFrames = false,
    detectPaywall = false,
  } = options;

  const doFetch = fetchImpl ?? fetch;
  const url = `${stripTrailingSlashes(baseUrl)}/api/v1/providers/${encodeURIComponent(providerId)}/stream`;

  let phase: 'fetch' | 'read' = 'fetch';

  const watchdogController = idleWatchdog ? new AbortController() : undefined;
  const idleMs = !idleWatchdog
    ? undefined
    : idleWatchdog === true
      ? DEFAULT_STREAM_IDLE_TIMEOUT_MS
      : (idleWatchdog.idleMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS);
  const effectiveSignal = combineSignals(signal, watchdogController?.signal);

  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const armIdleTimer = () => {
    if (!watchdogController || idleMs === undefined) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      watchdogController.abort(new StreamIdleTimeoutError(idleMs));
    }, idleMs);
  };
  const disposeIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = undefined;
  };

  async function* run(): AsyncIterable<TChunk> {
    armIdleTimer();

    const res = await doFetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`,
        'x-requested-with': clientTag,
      },
      body: JSON.stringify(request),
      ...(effectiveSignal ? { signal: effectiveSignal } : {}),
    });

    phase = 'read';

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');

      if (detectPaywall && res.status === 429 && text) {
        try {
          const parsed = JSON.parse(text) as RawPaywallBody;
          if (
            parsed.kind === 'paywall' &&
            typeof parsed.feature === 'string' &&
            typeof parsed.requiredTier === 'string'
          ) {
            yield {
              type: 'paywall',
              feature: parsed.feature,
              requiredTier: parsed.requiredTier,
              ...(typeof parsed.reason === 'string' ? { reason: parsed.reason } : {}),
            } as unknown as TChunk;
            yield { type: 'stop', reason: 'error' } as unknown as TChunk;
            return;
          }
        } catch {
          // Not JSON — fall through to the generic error chunk below.
        }
      }

      yield {
        type: 'error',
        message: text || `Upstream error ${res.status}`,
        ...(res.status >= 500 ? { retryable: true } : {}),
      } as unknown as TChunk;
      yield { type: 'stop', reason: 'error' } as unknown as TChunk;
      return;
    }

    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    try {
      yield* decodeSseFrames<TChunk>(rawByteChunks(reader, armIdleTimer), surfaceMalformedFrames);
    } finally {
      reader.releaseLock();
    }
  }

  try {
    if (!catchTransportErrors) {
      yield* run();
      return;
    }

    try {
      yield* run();
    } catch (error) {
      const aborted = signal?.aborted ?? false;
      const watchdogFired = watchdogController?.signal.aborted ?? false;
      const code =
        aborted || watchdogFired || error instanceof StreamIdleTimeoutError
          ? 'STREAM_TIMEOUT_OR_ABORT'
          : phase === 'fetch'
            ? 'STREAM_FETCH_ERROR'
            : 'STREAM_READ_ERROR';
      yield {
        type: 'error',
        code,
        message: errorMessage(error),
        retryable: !aborted,
      } as unknown as TChunk;
      yield { type: 'stop', reason: aborted ? 'cancel' : 'error' } as unknown as TChunk;
    }
  } finally {
    disposeIdleTimer();
  }
}

async function* rawByteChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onChunk: () => void,
): AsyncIterable<Uint8Array> {
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    onChunk();
    if (value) yield value;
  }
}

/**
 * Canonical browser-safe SSE client for the api-gateway's
 * `/api/v1/providers/:providerId/stream` proxy route.
 *
 * Unifies four near-duplicate copies that grew independently across
 * surfaces (`apps/{web,mobile,extension,extension-vscode}`). All four did
 * the same core thing — POST a `ChatRequest`-shaped body, read the
 * response as SSE, split `\n\n`-delimited frames, JSON.parse each
 * `data:` line, stop on `[DONE]` — but grew surface-specific extras:
 * mobile added an idle watchdog + resilient error-chunk conversion for
 * cellular/NAT drops, the extension added structured paywall (429)
 * detection. Those extras are OPT-IN options here (default off, matching
 * the original web/extension/vscode behaviour) so each surface's thin
 * wrapper can turn on exactly what it had before with zero behaviour
 * delta for its callers.
 *
 * Generic over the request body shape (`TRequest`, JSON-serialised
 * as-is) and the yielded chunk shape (`TChunk`, defaults to the
 * canonical `StreamChunk` from `@agiworkforce/types`) so callers that
 * need an extra variant — e.g. the extension's `paywall` chunk — can
 * widen the type at the call site without this module knowing about it.
 */

import type { StreamChunk } from '@agiworkforce/types';
import { DEFAULT_STREAM_IDLE_TIMEOUT_MS, StreamIdleTimeoutError } from '../watchdog';

export interface StreamIdleWatchdogOptions {
  /** Per-chunk idle timeout. Default: `DEFAULT_STREAM_IDLE_TIMEOUT_MS` (90s). */
  idleMs?: number;
}

export interface StreamFromProviderOptions<TRequest = unknown> {
  providerId: string;
  /** Bearer JWT for the api-gateway. */
  authToken: string;
  /** Request body in whatever shape the caller's endpoint expects; JSON-serialised as-is. */
  request: TRequest;
  signal?: AbortSignal;
  /** Prefix before `/api/v1/providers/:id/stream`. Default `''` — same-origin relative URL. */
  baseUrl?: string;
  /** fetch implementation. Defaults to the ambient global `fetch`, resolved per-call (not
   * captured at module load) so test doubles that stub the global still take effect. */
  fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  /** Value for the `x-requested-with` header identifying the calling surface (e.g.
   * `agiworkforce-mobile`). Required — every real call site needs a distinct value for
   * gateway-side per-surface metrics; a silent default would mislabel traffic. */
  clientTag: string;
  /**
   * Guard the whole request — from the initial POST through the last body byte — with a
   * single idle timer so a silently dropped connection (NAT timeout, cellular hand-off)
   * aborts instead of hanging forever. The timer arms before the fetch call (so a stalled
   * time-to-first-byte is caught too, not just a stalled body read) and resets on every
   * network read. `true` uses the default 90s timeout; pass an object to tune `idleMs`.
   * Off by default. Mobile turns this on (45s idle timeout).
   */
  idleWatchdog?: boolean | StreamIdleWatchdogOptions;
  /**
   * Convert fetch/read/watchdog failures into a typed `error` + `stop` chunk pair instead
   * of letting the exception propagate out of the generator. Off by default — matches the
   * original web/extension/vscode behaviour of letting the caller's try/catch handle
   * transport failures. Mobile turns this on for resilience against transient network errors.
   */
  catchTransportErrors?: boolean;
  /**
   * Surface a malformed SSE JSON frame as a typed `MALFORMED_SSE_FRAME` error chunk (the
   * stream continues afterward). Off by default — malformed frames are silently skipped,
   * matching the original web/extension/vscode behaviour. Mobile turns this on.
   */
  surfaceMalformedFrames?: boolean;
  /**
   * Detect a structured `{kind:'paywall', feature, requiredTier, reason?}` JSON body on an
   * HTTP 429 response and yield it as a `{type:'paywall', ...}` chunk instead of a generic
   * `error` chunk. Off by default. The extension turns this on; `TChunk` must include a
   * `paywall` variant for callers that enable it.
   */
  detectPaywall?: boolean;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Provider stream failed.';
}

/** Combine two optional `AbortSignal`s into one that aborts when either does. Hand-rolled
 * (not `AbortSignal.any`) because this package runs on Hermes (React Native), which doesn't
 * implement it. */
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

/** Decodes raw byte chunks into `\n\n`-delimited SSE frames, extracts `data:` lines, and
 * JSON.parses each complete frame into a `TChunk`. Stops cleanly on the `[DONE]` sentinel.
 * This parsing logic is byte-for-byte identical across all four original implementations. */
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

/** Parsed shape of a structured paywall body: `{kind:'paywall', feature, requiredTier, reason?}`. */
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
  const url = `${baseUrl.replace(/\/+$/, '')}/api/v1/providers/${encodeURIComponent(providerId)}/stream`;

  // Tracks which phase a transport failure occurred in so a caught error can be classified
  // as STREAM_FETCH_ERROR vs STREAM_READ_ERROR the same way the original mobile client did.
  let phase: 'fetch' | 'read' = 'fetch';

  // A single idle timer spans the whole request — armed before the POST so a stalled
  // time-to-first-byte is caught, then reset on every subsequent network read. Owns its own
  // AbortController (combined with the caller's signal, if any) so it actually tears down
  // the connection on fire, not just abandons it. `undefined` when the watchdog is off, in
  // which case the request behaves exactly like the original web/extension/vscode clients:
  // a signal is only attached to the fetch call when the caller supplied one.
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

      // 429 with a structured paywall body — yield as a first-class paywall chunk rather
      // than an error so callers can present upgrade UI instead of an error message.
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

/** Yields each raw byte chunk as it arrives from `reader.read()` — one yield per network
 * read, before any SSE frame parsing. `onChunk` fires after every read (including ones that
 * yield no frame-complete data yet) so the idle watchdog resets on any wire activity, not
 * just on parsed frames — matching the original mobile client's reset-per-read behaviour. */
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

/**
 * `err instanceof Error ? err.message : String(err)` reaches the screen with
 * the browser's own wording when the network drops: "Failed to fetch" in
 * Chrome, "Load failed" in Safari, "NetworkError when attempting to fetch
 * resource" in Firefox. None of those name a condition or suggest an action,
 * so a user whose wifi died is told a stack-trace fragment.
 */
const NETWORK_FAILURE = /failed to fetch|networkerror|network request failed|load failed/i;

export function networkErrorMessage(error: unknown): string | null {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (!(error instanceof TypeError || NETWORK_FAILURE.test(raw))) return null;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return offline
    ? 'You appear to be offline. Check your connection.'
    : 'Could not reach the server.';
}

/**
 * The human answer for an HTTP failure, or null when the status carries no
 * better wording than the server's own message.
 *
 * A status code is a machine's vocabulary. "HTTP 429: Too many requests" tells
 * a reader nothing they can act on; "you are going a little fast, wait a
 * moment" does. Codes also leak shape - a 403 on a list request is a
 * permissions answer, not a fault the reader caused.
 */
export function httpStatusMessage(status: number | undefined): string | null {
  if (typeof status !== 'number') return null;
  if (status === 401) return 'Your session has expired. Sign in again to continue.';
  if (status === 403) return 'You do not have access to this.';
  if (status === 404) return 'That is no longer available.';
  if (status === 408) return 'The server took too long to answer. Try again.';
  if (status === 429) return 'You are going a little fast. Wait a moment and try again.';
  if (status >= 500) return 'Something went wrong on our side. Try again shortly.';
  return null;
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const candidate =
    (error as { status?: unknown; statusCode?: unknown }).status ??
    (error as { statusCode?: unknown }).statusCode;
  if (typeof candidate === 'number') return candidate;
  // Several transports format the message as "HTTP 500" or "HTTP 500: reason"
  // and carry no status field. Recovering it here means the ladder applies
  // without every one of them having to be found and changed first.
  const message = error instanceof Error ? error.message : '';
  const parsed = /^\s*HTTP\s+(\d{3})\b/.exec(message);
  return parsed ? Number(parsed[1]) : undefined;
}

/**
 * A message the transport formatted, rather than one anybody wrote: either the
 * "HTTP 500: ..." shape, or a bare HTTP reason phrase. A reason phrase carries
 * nothing the status does not - "Forbidden" restates 403 - so it defers to the
 * ladder. Matched whole-string, so "Forbidden: your plan does not include this"
 * is still somebody's sentence and survives.
 */
const REASON_PHRASES = [
  'bad request',
  'unauthorized',
  'unauthorised',
  'payment required',
  'forbidden',
  'not found',
  'method not allowed',
  'request timeout',
  'conflict',
  'gone',
  'payload too large',
  'unprocessable entity',
  'too many requests',
  'internal error',
  'internal server error',
  'not implemented',
  'bad gateway',
  'service unavailable',
  'gateway timeout',
  'unknown error',
];

/**
 * Markers that say a string was written for an operator, not a reader: a hex
 * trace or object id, a stack frame, a file path, a SQL fragment, or a bare
 * exception class. Swept all 47 signed-in routes with the API forced to 500 and
 * a message of "upstream exploded: trace 0xdeadbeef": it reached the screen on
 * about twenty of them, four separate elements on /settings/account alone.
 *
 * The own-words rule is still right - "Model is overloaded" and "Provider down"
 * beat any status sentence - so this narrows it rather than reversing it. A
 * message keeps its words unless it is carrying something only an operator
 * could use.
 */
const INTERNAL_MARKERS = [
  /0x[0-9a-f]{4,}/i,
  /\b[0-9a-f]{16,}\b/i,
  /\bat\s+\S+\s+\(/,
  /(^|\s)\/(usr|var|home|opt|tmp|Users)\//,
  /\b[A-Za-z]:\\/,
  /\b(SELECT|INSERT|UPDATE|DELETE)\s+.*\s+(FROM|INTO|SET)\b/i,
  /\b\w*(Error|Exception)\b\s*:/,
  /\bstack\s*trace\b/i,
  /\b(ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EPIPE)\b/,
];

function looksInternal(message: string): boolean {
  return INTERNAL_MARKERS.some((marker) => marker.test(message));
}

function isMachineShaped(message: string): boolean {
  if (/^\s*HTTP\s+\d{3}\b/.test(message)) return true;
  const normalised = message
    .trim()
    .replace(/[.!]+$/, '')
    .toLowerCase();
  return REASON_PHRASES.includes(normalised);
}

/**
 * The message to put on screen for a caught value.
 *
 * The error's own words win when somebody wrote them: "Model is overloaded"
 * and "Provider down" say more than any status sentence could, and replacing
 * them with a generic 5xx line loses the only useful detail in the failure.
 * The status ladder is for the case where the message is the transport talking
 * to itself - "HTTP 500: nope" names no condition, so 500 becomes a sentence
 * instead.
 */
export function toUserMessage(error: unknown, fallback: string): string {
  const network = networkErrorMessage(error);
  if (network) return network;

  const own = error instanceof Error ? error.message.trim() : '';
  if (own && !isMachineShaped(own) && !looksInternal(own)) return own;

  return httpStatusMessage(statusOf(error)) ?? fallback;
}

/** Retained name for callers that state the intent explicitly. */
export const toUserMessageWithStatus = toUserMessage;

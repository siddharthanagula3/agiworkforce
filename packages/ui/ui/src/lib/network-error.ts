const NETWORK_FAILURE = /failed to fetch|networkerror|network request failed|\bload failed\b/i;
const HTTP_STATUS_SUFFIX = /\(HTTP\s+(\d{3})\)\s*$/;

export function networkErrorMessage(error: unknown): string | null {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (!(error instanceof TypeError || NETWORK_FAILURE.test(raw))) return null;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return offline
    ? 'You appear to be offline. Check your connection.'
    : 'Could not reach the server.';
}

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
  const message = error instanceof Error ? error.message : '';
  const parsed = /^\s*HTTP\s+(\d{3})\b/.exec(message) ?? HTTP_STATUS_SUFFIX.exec(message);
  return parsed ? Number(parsed[1]) : undefined;
}

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

const INTERNAL_MARKERS = [
  /0x[0-9a-f]{4,}/i,
  /\b[0-9a-f]{16,}\b/i,
  /\bat\s+\S+\s+\(/,
  /(^|\s)\/(usr|var|home|opt|tmp|Users)\//,
  /\b[A-Za-z]:\\/,
  /\b\w*(Error|Exception)\b\s*:/,
  /\bstack\s*trace\b/i,
  /\b(ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EPIPE)\b/,
];

const SQL_VERB = /\b(SELECT|INSERT|UPDATE|DELETE)\s/i;
const SQL_TAIL = /\s(FROM|INTO|SET)\b/i;

function looksInternal(message: string): boolean {
  const verb = SQL_VERB.exec(message);
  if (verb && SQL_TAIL.test(message.slice(verb.index + verb[0].length))) return true;
  return INTERNAL_MARKERS.some((marker) => marker.test(message));
}

function isMachineShaped(message: string): boolean {
  if (/^\s*HTTP\s+\d{3}\b/.test(message) || HTTP_STATUS_SUFFIX.test(message)) return true;
  const trimmed = message.trim();
  let end = trimmed.length;
  while (end > 0 && (trimmed[end - 1] === '.' || trimmed[end - 1] === '!')) end -= 1;
  return REASON_PHRASES.includes(trimmed.slice(0, end).toLowerCase());
}

function isSchemaValidationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === 'ZodError' &&
    Array.isArray((error as { issues?: unknown }).issues)
  );
}

export function toUserMessage(error: unknown, fallback: string): string {
  const network = networkErrorMessage(error);
  if (network) return network;

  if (isSchemaValidationError(error)) return fallback;

  const raw = error instanceof Error ? error.message.trim() : '';
  const own = statusOf(error) === 400 ? raw.replace(/^HTTP\s+400:\s*/, '').trim() : raw;
  if (own && !isMachineShaped(own) && !looksInternal(own)) return own;

  return httpStatusMessage(statusOf(error)) ?? fallback;
}

export const toUserMessageWithStatus = toUserMessage;

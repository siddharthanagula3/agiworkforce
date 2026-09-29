const NETWORK_FAILURE = /failed to fetch|networkerror|network request failed|\bload failed\b/i;
const HTTP_STATUS_PREFIX = /^\s*HTTP\s+(\d{3})\b/;
const HTTP_STATUS_SUFFIX = /\(HTTP\s+(\d{3})\)\s*$/;

const REASON_PHRASES = new Set([
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
]);

const INTERNAL_MARKERS = [
  /0x[0-9a-f]{4,}/i,
  /\b[0-9a-f]{16,}\b/i,
  /\bat\s+\S+\s+\(/,
  /(^|\s)\/(usr|var|home|opt|tmp|Users|private|data)\//,
  /\b[A-Za-z]:\\/,
  /\bfile:\/\//i,
  /\b\w*(Error|Exception)\b\s*:/,
  /\bstack\s*trace\b/i,
  /\b(ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EPIPE|ECONNRESET)\b/,
];

const SQL_VERB = /\b(SELECT|INSERT|UPDATE|DELETE)\s/i;
const SQL_TAIL = /\s(FROM|INTO|SET)\b/i;

export const NETWORK_UNREACHABLE_MESSAGE =
  'Could not reach the server. Check your connection and try again.';

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const candidate =
    (error as { status?: unknown }).status ?? (error as { statusCode?: unknown }).statusCode;
  if (typeof candidate === 'number') return candidate;
  const text = error instanceof Error ? error.message : '';
  const parsed = HTTP_STATUS_PREFIX.exec(text) ?? HTTP_STATUS_SUFFIX.exec(text);
  return parsed ? Number(parsed[1]) : undefined;
}

function httpStatusMessage(status: number | undefined): string | null {
  if (status === undefined) return null;
  if (status === 401) return 'Your session has expired. Sign in again to continue.';
  if (status === 403) return 'You do not have access to this.';
  if (status === 404) return 'That is no longer available.';
  if (status === 408) return 'The server took too long to answer. Try again.';
  if (status === 429) return 'You are going a little fast. Wait a moment and try again.';
  if (status >= 500) return 'Something went wrong on our side. Try again shortly.';
  return null;
}

function looksInternal(text: string): boolean {
  const verb = SQL_VERB.exec(text);
  if (verb && SQL_TAIL.test(text.slice(verb.index + verb[0].length))) return true;
  return INTERNAL_MARKERS.some((marker) => marker.test(text));
}

function isMachineShaped(text: string): boolean {
  if (HTTP_STATUS_PREFIX.test(text) || HTTP_STATUS_SUFFIX.test(text)) return true;
  const trimmed = text.trim();
  let end = trimmed.length;
  while (end > 0 && (trimmed[end - 1] === '.' || trimmed[end - 1] === '!')) end -= 1;
  return REASON_PHRASES.has(trimmed.slice(0, end).toLowerCase());
}

function isSchemaValidationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === 'ZodError' &&
    Array.isArray((error as { issues?: unknown }).issues)
  );
}

function isEngineError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    error instanceof RangeError ||
    error instanceof ReferenceError ||
    error instanceof SyntaxError
  );
}

export function toUserMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message.trim() : '';
  if (NETWORK_FAILURE.test(raw)) return NETWORK_UNREACHABLE_MESSAGE;
  if (isEngineError(error) || isSchemaValidationError(error)) return fallback;

  const own = statusOf(error) === 400 ? raw.replace(/^HTTP\s+400:\s*/, '').trim() : raw;
  if (own && !isMachineShaped(own) && !looksInternal(own)) return own;

  return httpStatusMessage(statusOf(error)) ?? fallback;
}

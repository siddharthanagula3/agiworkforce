import { ApiHttpError } from './apiErrors';

const NETWORK_FAILURE = /failed to fetch|networkerror|network request failed|\bload failed\b/i;
const HTTP_STATUS_PREFIX = /^\s*HTTP\s+(\d{3})\b/;
const HTTP_STATUS_SUFFIX = /\(HTTP\s+(\d{3})\)\s*$/;

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

function isEnvelopeSentence(error: unknown): error is ApiHttpError {
  return (
    error instanceof ApiHttpError &&
    typeof error.code === 'string' &&
    error.code.length > 0 &&
    error.status < 500 &&
    error.message.trim().length > 0
  );
}

export function toUserMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message.trim() : '';
  if (NETWORK_FAILURE.test(raw)) return NETWORK_UNREACHABLE_MESSAGE;
  if (isEnvelopeSentence(error)) return raw;
  return httpStatusMessage(statusOf(error)) ?? fallback;
}

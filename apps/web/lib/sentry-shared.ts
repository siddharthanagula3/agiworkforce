import type { Breadcrumb, ErrorEvent, EventHint } from '@sentry/nextjs';

import { maskSecretText, redactDeepValue } from '@/lib/observability/redact';

export function getSentryDsn(): string | undefined {
  return process.env['NEXT_PUBLIC_SENTRY_DSN'] || process.env['SENTRY_DSN'] || undefined;
}

export function isSentryConfigured(): boolean {
  return process.env.NODE_ENV === 'production' && !!getSentryDsn();
}

export const TELEMETRY_CONSENT_STORAGE_KEY = 'agi.privacy.shareTelemetry';

export function hasTelemetryConsent(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(TELEMETRY_CONSENT_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setTelemetryConsentCache(value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TELEMETRY_CONSENT_STORAGE_KEY, value ? 'true' : 'false');
  } catch {
    // Private-browsing / storage-disabled — the toggle still saves server-side via
    // savePreferenceNamespace; only the synchronous local gate is unavailable.
  }
}

const SENSITIVE_KEY =
  /(authorization|cookie|set-cookie|x-api-key|api[_-]?key|apikey|secret|password|passwd|token|jwt|bearer|session|credential|private[_-]?key|prompt|message|content|conversation|completion|transcript|attachment|upload|email|phone|ssn)/i;

const REDACTED = '[redacted]';

export function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[redacted:depth]';
  if (typeof value === 'string') return maskSecretText(value);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? REDACTED : redactDeep(v, depth + 1);
    }
    return out;
  }
  return value;
}

type ExceptionValue = NonNullable<NonNullable<ErrorEvent['exception']>['values']>[number];
type StackFrame = NonNullable<NonNullable<ExceptionValue['stacktrace']>['frames']>[number];

const FRAME_TEXT_KEYS = ['filename', 'abs_path', 'module', 'function', 'context_line'] as const;
const FRAME_SOURCE_KEYS = ['pre_context', 'post_context'] as const;

function scrubFrame(frame: StackFrame): StackFrame {
  for (const key of FRAME_TEXT_KEYS) {
    const value = frame[key];
    if (typeof value === 'string') frame[key] = maskSecretText(value);
  }
  for (const key of FRAME_SOURCE_KEYS) {
    const lines = frame[key];
    if (Array.isArray(lines)) {
      frame[key] = lines.map((line) => (typeof line === 'string' ? maskSecretText(line) : line));
    }
  }
  if (frame.vars) frame.vars = redactDeepValue(frame.vars) as StackFrame['vars'];
  return frame;
}

function scrubException(exception: ExceptionValue): ExceptionValue {
  if (typeof exception.value === 'string') exception.value = maskSecretText(exception.value);
  if (exception.mechanism?.data) {
    exception.mechanism.data = redactDeepValue(exception.mechanism.data) as NonNullable<
      ExceptionValue['mechanism']
    >['data'];
  }
  const frames = exception.stacktrace?.frames;
  if (frames) exception.stacktrace!.frames = frames.map(scrubFrame);
  return exception;
}

/**
 * Strip all request PII and redact sensitive keys before an event leaves the
 * process. Exported (and pure-ish) so it can be unit-tested directly.
 */
export function scrubEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent | null {
  if (event.exception?.values) event.exception.values = event.exception.values.map(scrubException);
  if (typeof event.message === 'string') event.message = maskSecretText(event.message);
  if (event.logentry?.message) event.logentry.message = maskSecretText(event.logentry.message);
  if (event.logentry?.params) {
    event.logentry.params = redactDeepValue(event.logentry.params) as NonNullable<
      ErrorEvent['logentry']
    >['params'];
  }
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  if (event.threads?.values) {
    for (const thread of event.threads.values) {
      const frames = thread.stacktrace?.frames;
      if (frames) thread.stacktrace!.frames = frames.map(scrubFrame);
    }
  }
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.headers) event.request.headers = {};
  }
  // The server and edge runtimes initialise Sentry per request and cannot read
  // the per-user telemetry preference, so hasTelemetryConsent() is false there
  // and no stable identifier is ever attached to a server event. On the client
  // it also re-checks opt-out made after init.
  if (event.user) {
    const id = hasTelemetryConsent() ? event.user.id : undefined;
    if (id) event.user = { id: String(id) };
    else delete event.user;
  }
  if (event.extra) event.extra = redactDeep(event.extra) as Record<string, unknown>;
  if (event.contexts) event.contexts = redactDeep(event.contexts) as typeof event.contexts;
  if (event.tags) {
    for (const k of Object.keys(event.tags)) {
      if (SENSITIVE_KEY.test(k)) event.tags[k] = REDACTED;
    }
  }
  return event;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (breadcrumb.data) breadcrumb.data = redactDeep(breadcrumb.data) as Record<string, unknown>;
  if (typeof breadcrumb.message === 'string') {
    breadcrumb.message = maskSecretText(breadcrumb.message);
  }
  return breadcrumb;
}

export function commonInitOptions() {
  return {
    dsn: getSentryDsn(),
    enabled: isSentryConfigured(),
    environment: process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}

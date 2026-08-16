import type { Breadcrumb, ErrorEvent, EventHint } from '@sentry/nextjs';

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

/**
 * Strip all request PII and redact sensitive keys before an event leaves the
 * process. Exported (and pure-ish) so it can be unit-tested directly.
 */
export function scrubEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent | null {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.headers) event.request.headers = {};
  }
  if (event.user) {
    event.user = event.user.id ? { id: String(event.user.id) } : {};
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

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.data) breadcrumb.data = redactDeep(breadcrumb.data) as Record<string, unknown>;
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

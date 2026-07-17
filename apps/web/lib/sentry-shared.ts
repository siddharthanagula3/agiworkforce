/**
 * sentry-shared.ts — PII-safe Sentry configuration shared by the server
 * (instrumentation.ts), edge, and browser (instrumentation-client.ts) inits, and
 * by the central sink (shared/lib/sentry.ts).
 *
 * OBSERVABILITY-WEB-SENTRY-01 (founder decision). Privacy-first posture:
 *  - DISABLED unless NODE_ENV === 'production' AND a DSN is configured.
 *  - Never transmit prompts, messages, conversation content, API keys,
 *    Authorization headers, cookies, JWTs, request bodies, or user secrets.
 *  - `sendDefaultPii: false` + an aggressive `beforeSend` scrub: when in doubt,
 *    redact. Only a stable user `id` is kept.
 */
import type { Breadcrumb, ErrorEvent, EventHint } from '@sentry/nextjs';

/** Server- and browser-readable DSN; server-only `SENTRY_DSN` as a fallback. */
export function getSentryDsn(): string | undefined {
  return process.env['NEXT_PUBLIC_SENTRY_DSN'] || process.env['SENTRY_DSN'] || undefined;
}

/** Default-disabled: only on in production WITH a DSN configured. */
export function isSentryConfigured(): boolean {
  return process.env.NODE_ENV === 'production' && !!getSentryDsn();
}

/**
 * Client-side gate for the browser Sentry init, mirroring Settings → Privacy
 * → "Share crash and usage telemetry" (default OFF). The preference itself
 * lives server-side only (`/api/settings/preferences`), but
 * `instrumentation-client.ts` must decide whether to call `Sentry.init()`
 * synchronously at module load — before any fetch to that route could
 * resolve. `PrivacySection.tsx` mirrors the server value into this
 * localStorage key whenever it loads or the toggle changes; a device that
 * hasn't synced yet (no key set) fails CLOSED (no telemetry), matching the
 * toggle's own default, so an explicit opt-out is never overridden and a
 * never-visited device never opts a user in by accident.
 */
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

// Keys whose VALUES must never leave the process. Matched case-insensitively as a
// substring of the key name, so `api_key`, `apiKey`, `x-api-key`, `userPrompt`,
// `messages`, `conversationId`'s sibling content fields, etc. are all caught.
const SENSITIVE_KEY =
  /(authorization|cookie|set-cookie|x-api-key|api[_-]?key|apikey|secret|password|passwd|token|jwt|bearer|session|credential|private[_-]?key|prompt|message|content|conversation|completion|transcript|attachment|upload|email|phone|ssn)/i;

const REDACTED = '[redacted]';

/**
 * Recursively redact the VALUE of any sensitive-named key. Bounded depth so a
 * cyclic/huge object cannot hang the scrubber.
 */
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
  // 1. Request: drop body, cookies, query, and ALL headers — these carry
  //    Authorization, cookies, JWTs, and (for chat routes) prompt/message bodies.
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.headers) event.request.headers = {};
  }
  // 2. User: keep only a stable id; never email/username/ip_address.
  if (event.user) {
    event.user = event.user.id ? { id: String(event.user.id) } : {};
  }
  // 3. Redact sensitive values anywhere in extra/contexts.
  if (event.extra) event.extra = redactDeep(event.extra) as Record<string, unknown>;
  if (event.contexts) event.contexts = redactDeep(event.contexts) as typeof event.contexts;
  // 4. Tags: redact values under sensitive key names (tags are flat strings).
  if (event.tags) {
    for (const k of Object.keys(event.tags)) {
      if (SENSITIVE_KEY.test(k)) event.tags[k] = REDACTED;
    }
  }
  return event;
}

/** Drop sensitive data from breadcrumbs (they can carry request/message payloads). */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.data) breadcrumb.data = redactDeep(breadcrumb.data) as Record<string, unknown>;
  return breadcrumb;
}

/** Init options shared by every runtime. Spread into `Sentry.init({...})`. */
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

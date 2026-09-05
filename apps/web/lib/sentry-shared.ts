import type { Breadcrumb, ErrorEvent, Event, EventHint, spanToJSON } from '@sentry/nextjs';

import { maskSecretText, redactDeepValue } from '@/lib/observability/redact';

// @sentry/nextjs re-exports these shapes only through values, not as named types.
export type SpanJSON = ReturnType<typeof spanToJSON>;
export type TransactionEvent = Event & { type: 'transaction' };

type SpanAttributes = SpanJSON['data'];

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
    // noop
  }
}

export const TELEMETRY_CONSENT_DOCUMENT_ATTRIBUTE = 'data-telemetry-consent';

export function readDocumentTelemetryConsent(): boolean | null {
  if (typeof document === 'undefined') return null;
  const raw = document.documentElement.getAttribute(TELEMETRY_CONSENT_DOCUMENT_ATTRIBUTE);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
}

export function shouldInitializeSentry(): boolean {
  if (!isSentryConfigured()) return false;
  const documentConsent = readDocumentTelemetryConsent();
  if (documentConsent !== null) setTelemetryConsentCache(documentConsent);
  return documentConsent ?? hasTelemetryConsent();
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

function scrubUrlLike(value: string): string {
  const cut = value.search(/[?#]/u);
  return maskSecretText(cut === -1 ? value : value.slice(0, cut));
}

function scrubException(exception: ExceptionValue): ExceptionValue {
  if (typeof exception.value === 'string') exception.value = maskSecretText(exception.value);
  if (exception.mechanism?.data) {
    const data = redactDeepValue(exception.mechanism.data) as NonNullable<
      ExceptionValue['mechanism']
    >['data'];
    if (data && typeof data['url'] === 'string') data['url'] = scrubUrlLike(data['url']);
    exception.mechanism.data = data;
  }
  const frames = exception.stacktrace?.frames;
  if (frames) exception.stacktrace!.frames = frames.map(scrubFrame);
  return exception;
}

function scrubRequest(request: NonNullable<Event['request']>): void {
  delete request.cookies;
  delete request.data;
  delete request.query_string;
  if (request.headers) request.headers = {};
  // request.url repeats the raw query string, so deleting query_string alone still
  // ships OAuth codes and magic-link tokens to Sentry.
  if (typeof request.url === 'string') request.url = scrubUrlLike(request.url);
}

const SPAN_QUERY_ATTRIBUTE = /(?:^|\.)(?:query|query_string|search|fragment)$/iu;
const SPAN_URL_ATTRIBUTE = /(?:^|\.)(?:url|uri|href|target|location)(?:\.(?:full|path))?$/iu;
const SPAN_PAYLOAD_ATTRIBUTE = /^http\.(?:request|response)\.(?:header|body)\./iu;

type SpanAttribute = NonNullable<SpanAttributes[string]>;

function scrubSpanAttributes(data: SpanAttributes): SpanAttributes {
  const out: SpanAttributes = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (
      SPAN_QUERY_ATTRIBUTE.test(key) ||
      SPAN_PAYLOAD_ATTRIBUTE.test(key) ||
      SENSITIVE_KEY.test(key)
    ) {
      out[key] = REDACTED;
    } else if (typeof value === 'string') {
      out[key] = SPAN_URL_ATTRIBUTE.test(key) ? scrubUrlLike(value) : maskSecretText(value);
    } else if (Array.isArray(value)) {
      out[key] = value.map((entry) =>
        typeof entry === 'string' ? maskSecretText(entry) : entry,
      ) as SpanAttribute;
    } else {
      out[key] = value;
    }
  }
  return out;
}

// Only cut at a "?" when the description really is a url or a method + route, so a
// parameterised db statement keeps its placeholders.
const URL_LIKE_DESCRIPTION = /^(?:[A-Z]+ )?(?:https?:\/\/|\/)/u;

/**
 * Runs for every root, child and standalone span. requestDataIntegration copies the
 * raw request url, query string, cookies and headers onto the segment span, none of
 * which pass through beforeSend.
 */
export function scrubSpan(span: SpanJSON): SpanJSON {
  if (typeof span.description === 'string' && URL_LIKE_DESCRIPTION.test(span.description)) {
    span.description = scrubUrlLike(span.description);
  }
  if (span.data) span.data = scrubSpanAttributes(span.data);
  return span;
}

// captureRequestError stores the raw request target in contexts.nextjs.request_path,
// which no sensitive-key or secret-shape rule matches, so the query string survives
// redactDeep unless every url/path-like context string is cut at "?" as well.
const URL_LIKE_CONTEXT_KEY =
  /(?:^|[._-])(?:url|uri|href|path|pathname|route|location|referrer|target)$/iu;

function scrubContextUrls(value: unknown, depth = 0): unknown {
  if (depth > 8 || !value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => scrubContextUrls(entry, depth + 1));
  const record = value as Record<string, unknown>;
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === 'string') {
      if (URL_LIKE_CONTEXT_KEY.test(key)) record[key] = scrubUrlLike(entry);
    } else {
      record[key] = scrubContextUrls(entry, depth + 1);
    }
  }
  return record;
}

function scrubSharedEventFields(event: Event): void {
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  if (event.request) scrubRequest(event.request);
  if (typeof event.transaction === 'string') event.transaction = scrubUrlLike(event.transaction);
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
  if (event.contexts) {
    event.contexts = scrubContextUrls(redactDeep(event.contexts)) as typeof event.contexts;
    const traceData = event.contexts.trace?.data;
    if (traceData) event.contexts.trace!.data = scrubSpanAttributes(traceData);
  }
  if (event.tags) {
    for (const k of Object.keys(event.tags)) {
      if (SENSITIVE_KEY.test(k)) event.tags[k] = REDACTED;
    }
  }
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
  if (event.threads?.values) {
    for (const thread of event.threads.values) {
      const frames = thread.stacktrace?.frames;
      if (frames) thread.stacktrace!.frames = frames.map(scrubFrame);
    }
  }
  scrubSharedEventFields(event);
  return event;
}

/**
 * beforeSend is only consulted for error events, so transaction events would
 * otherwise leave with the request url, query string, cookies and headers that
 * scrubEvent removes.
 */
export function scrubTransactionEvent(
  event: TransactionEvent,
  _hint?: EventHint,
): TransactionEvent | null {
  if (event.spans) event.spans = event.spans.map(scrubSpan);
  scrubSharedEventFields(event);
  return event;
}

const URL_BEARING_BREADCRUMB_KEYS = ['url', 'href', 'to', 'from', 'location', 'referrer'] as const;

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (breadcrumb.data) {
    const data = redactDeep(breadcrumb.data) as Record<string, unknown>;
    for (const key of URL_BEARING_BREADCRUMB_KEYS) {
      const value = data[key];
      if (typeof value === 'string') data[key] = scrubUrlLike(value);
    }
    breadcrumb.data = data;
  }
  if (typeof breadcrumb.message === 'string') {
    breadcrumb.message = maskSecretText(breadcrumb.message);
  }
  return breadcrumb;
}

export interface TenantTaggedEvent {
  tags?: Record<string, unknown>;
}

export const DEFAULT_TRACES_SAMPLE_RATE = 0.1;

export interface CommonInitOptions {
  tenantTagHook?: (event: TenantTaggedEvent) => void;
  tracesSampleRate?: number;
  skipOpenTelemetrySetup?: boolean;
}

function scrubAndTagEvent(hook: (event: TenantTaggedEvent) => void) {
  return (event: ErrorEvent, hint?: EventHint): ErrorEvent | null => {
    const scrubbed = scrubEvent(event, hint);
    if (scrubbed) hook(scrubbed);
    return scrubbed;
  };
}

function scrubAndTagTransaction(hook: (event: TenantTaggedEvent) => void) {
  return (event: TransactionEvent, hint?: EventHint): TransactionEvent | null => {
    const scrubbed = scrubTransactionEvent(event, hint);
    if (scrubbed) hook(scrubbed);
    return scrubbed;
  };
}

export function commonInitOptions(options: CommonInitOptions = {}) {
  const { tenantTagHook, tracesSampleRate, skipOpenTelemetrySetup } = options;
  return {
    dsn: getSentryDsn(),
    enabled: isSentryConfigured(),
    environment: process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: tracesSampleRate ?? DEFAULT_TRACES_SAMPLE_RATE,
    ...(skipOpenTelemetrySetup ? { skipOpenTelemetrySetup: true } : {}),
    beforeSend: tenantTagHook ? scrubAndTagEvent(tenantTagHook) : scrubEvent,
    beforeSendTransaction: tenantTagHook
      ? scrubAndTagTransaction(tenantTagHook)
      : scrubTransactionEvent,
    beforeSendSpan: scrubSpan,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}

/**
 * Attribute redaction for span records.
 *
 * SCALE-VER-006 requires spans "with redaction". Traces are the highest-risk
 * telemetry channel in this product: the values a caller naturally reaches for
 * when instrumenting a model or retrieval call are the prompt, the query, the
 * tool arguments and the user identity — exactly the payloads that must never
 * leave the Local or BYOK trust boundary in a log aggregator. This module is
 * the single choke point every span attribute passes through in `span.ts`, so
 * an instrumented call site cannot leak by forgetting to redact.
 *
 * Two independent passes, both required because either alone fails:
 *   1. Key denial — a value under a sensitive name is replaced wholesale. Keyed
 *      on the FINAL dot/underscore segment plus a short list of compound names,
 *      so `gen_ai.usage.input_tokens` (final segment `tokens`) survives while
 *      `gen_ai.request.access_token` (final segment `token`) does not.
 *   2. Value scrubbing — surviving strings still get secret- and PII-shaped
 *      substrings masked, because a name like `error.message` is not sensitive
 *      but the string under it routinely quotes the credential that failed.
 *
 * Non-scalar values are dropped rather than serialized: an object attribute is
 * the usual way a whole request body reaches a log line by accident.
 */

/** Replacement written in place of a denied value. */
export const REDACTED = '[redacted]';

/** Maximum length of any string attribute after scrubbing. */
export const MAX_ATTRIBUTE_LENGTH = 256;

/**
 * Final key segments whose value is never safe to record.
 * Singular `token`/`key` are listed; the plural forms used by token *counts*
 * (`input_tokens`) are deliberately absent so usage metrics survive.
 */
const DENIED_FINAL_SEGMENTS = new Set([
  'arg',
  'args',
  'argument',
  'arguments',
  'authorization',
  'body',
  'completion',
  'cookie',
  'cookies',
  'credential',
  'credentials',
  'cvv',
  'email',
  'iban',
  'jwt',
  'key',
  'otp',
  'passphrase',
  'password',
  'passwd',
  'payload',
  'phone',
  'prompt',
  'pwd',
  'query',
  'secret',
  'signature',
  'ssn',
  'text',
  'token',
]);

/** Substrings that mark a key as sensitive wherever they appear in it. */
const DENIED_KEY_SUBSTRINGS = [
  'access_token',
  'api_key',
  'apikey',
  'authorization',
  'client_secret',
  'cookie',
  'credential',
  'password',
  'private_key',
  'refresh_token',
  'secret',
  'session_token',
];

/** Secret- and PII-shaped patterns masked inside otherwise-allowed strings. */
const VALUE_PATTERNS: readonly RegExp[] = [
  // Email addresses.
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu,
  // `Bearer <token>` / `Basic <token>` in a quoted header value.
  /\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/giu,
  // JWTs.
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/gu,
  // Provider key prefixes: OpenAI/Anthropic (sk-…), GitHub (ghp_/gho_/ghs_/ghu_/github_pat_),
  // Stripe (sk_live_/rk_test_/whsec_), Google (AIza…), Slack (xox?-…).
  /\b(?:sk|pk|rk|whsec)[-_](?:live|test|proj|ant)?[-_]?[A-Za-z0-9_-]{12,}/gu,
  /\bgh[pousr]_[A-Za-z0-9]{16,}/gu,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/gu,
  /\bAIza[A-Za-z0-9_-]{20,}/gu,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/gu,
];

function isDeniedKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (DENIED_KEY_SUBSTRINGS.some((needle) => lower.includes(needle))) return true;
  const segments = lower.split(/[^a-z0-9]+/u).filter(Boolean);
  const final = segments[segments.length - 1];
  return final !== undefined && DENIED_FINAL_SEGMENTS.has(final);
}

/**
 * Mask secret-shaped substrings and clamp length. Exported for call sites that
 * build a free-text field (an error message) outside an attribute bag.
 */
export function redactValue(value: string): string {
  let out = value;
  for (const pattern of VALUE_PATTERNS) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, REDACTED);
  }
  return out.length > MAX_ATTRIBUTE_LENGTH ? `${out.slice(0, MAX_ATTRIBUTE_LENGTH)}…` : out;
}

export type SpanAttributeValue = string | number | boolean;

/**
 * Redact an attribute bag. Denied keys keep their key with a `[redacted]`
 * value — dropping the key entirely would hide that the call site tried to
 * record something sensitive. Non-scalar and non-finite values are dropped.
 */
export function redactAttributes(
  attributes: Readonly<Record<string, unknown>> | undefined,
): Record<string, SpanAttributeValue> {
  const out: Record<string, SpanAttributeValue> = {};
  if (!attributes) return out;
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null) continue;
    if (isDeniedKey(key)) {
      out[key] = REDACTED;
      continue;
    }
    if (typeof value === 'string') {
      out[key] = redactValue(value);
    } else if (typeof value === 'number') {
      if (Number.isFinite(value)) out[key] = value;
    } else if (typeof value === 'boolean') {
      out[key] = value;
    }
    // Objects, arrays, functions and symbols are dropped on purpose.
  }
  return out;
}

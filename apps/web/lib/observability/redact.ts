import { FIELDS_NEVER_LOGGED } from '@/lib/identity/log-hygiene';

export const REDACTED = '[redacted]';

export const MAX_ATTRIBUTE_LENGTH = 256;

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

const DENIED_KEY_SUBSTRINGS = [
  'access_token',
  'api_key',
  'apikey',
  'authorization',
  'client_secret',
  'cookie',
  'credential',
  'fingerprint',
  'password',
  'private_key',
  'refresh_token',
  'secret',
  'session_token',
];

const VALUE_PATTERNS: readonly RegExp[] = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu,
  /\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/giu,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/gu,
  /\b(?:sk|pk|rk|whsec)[-_](?:live|test|proj|ant)?[-_]?[A-Za-z0-9_-]{12,}/gu,
  /\bgh[pousr]_[A-Za-z0-9]{16,}/gu,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/gu,
  /\bAIza[A-Za-z0-9_-]{20,}/gu,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/gu,
];

// The same list scripts/check-llm-log-hygiene.mjs refuses at build time. A
// camel-cased name like systemPrompt survives the segment rules below.
const NEVER_LOGGED_KEYS = new Set<string>(FIELDS_NEVER_LOGGED.map((field) => field.toLowerCase()));

// camelCase is a word boundary too. Without this split, bearerToken, privateKey
// and refreshToken reached telemetry intact while bearer_token was redacted.
function keySegments(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
}

function isDeniedKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (NEVER_LOGGED_KEYS.has(lower.replace(/[^a-z0-9]+/gu, ''))) return true;
  if (DENIED_KEY_SUBSTRINGS.some((needle) => lower.includes(needle))) return true;
  const segments = keySegments(key);
  const final = segments[segments.length - 1];
  return final !== undefined && DENIED_FINAL_SEGMENTS.has(final);
}

/**
 * Mask secret-shaped substrings and clamp length. Exported for call sites that
 * build a free-text field (an error message) outside an attribute bag.
 */
export function maskSecretText(value: string): string {
  let out = value;
  for (const pattern of VALUE_PATTERNS) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, REDACTED);
  }
  return out;
}

export function redactValue(value: string): string {
  const out = maskSecretText(value);
  return out.length > MAX_ATTRIBUTE_LENGTH ? `${out.slice(0, MAX_ATTRIBUTE_LENGTH)}…` : out;
}

const MAX_REDACTION_DEPTH = 8;

function redactErrorLike(error: Error): Record<string, unknown> {
  return {
    type: error.constructor?.name ?? error.name,
    message: maskSecretText(error.message),
    ...(error.stack ? { stack: maskSecretText(error.stack) } : {}),
  };
}

export function redactDeepValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return maskSecretText(value);
  if (value instanceof Error) return redactErrorLike(value);
  if (value instanceof Date) return value;
  if (depth >= MAX_REDACTION_DEPTH) return REDACTED;
  if (Array.isArray(value)) return value.map((entry) => redactDeepValue(entry, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isDeniedKey(key) ? REDACTED : redactDeepValue(entry, depth + 1);
    }
    return out;
  }
  return value;
}

export function redactLogRecord(record: Record<string, unknown>): Record<string, unknown> {
  return redactDeepValue(record) as Record<string, unknown>;
}

export type SpanAttributeValue = string | number | boolean;

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

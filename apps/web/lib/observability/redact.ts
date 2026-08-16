
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

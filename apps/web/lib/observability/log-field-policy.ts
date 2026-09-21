/**
 * Which structured field names carry a credential or a person, and which only
 * name a row. No imports: scripts/check-log-redaction.mjs loads this file.
 */

export const DENIED_FINAL_SEGMENTS: readonly string[] = [
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
];

export const DENIED_KEY_SUBSTRINGS: readonly string[] = [
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

/**
 * The word before "key" that makes the field an identifier rather than a
 * credential. An unlisted qualifier stays denied, so a new kind of key is a
 * secret until somebody says it is not.
 */
export const IDENTIFIER_KEY_QUALIFIERS: readonly string[] = [
  'cache',
  'catalogue',
  'dedupe',
  'env',
  'flag',
  'idempotency',
  'metric',
  'model',
  'notification',
  'object',
  'operation',
  'partition',
  'plugin',
  'route',
  'storage',
];

/**
 * Denied names a number must never survive under: the personal ones, whose
 * value is numeric, and the credential ones, where a number is either the
 * secret itself or a field that is misnamed. Everywhere else a number under a
 * denied name is a count, a length or a status, which carries nobody.
 */
export const NEVER_SURVIVING_SEGMENTS: readonly string[] = [
  'authorization',
  'cookie',
  'cookies',
  'credential',
  'credentials',
  'cvv',
  'iban',
  'jwt',
  'key',
  'otp',
  'passphrase',
  'passwd',
  'password',
  'phone',
  'pwd',
  'secret',
  'signature',
  'ssn',
  'token',
];

const DENIED_FINALS = new Set(DENIED_FINAL_SEGMENTS);
const IDENTIFIER_QUALIFIERS = new Set(IDENTIFIER_KEY_QUALIFIERS);
const NEVER_SURVIVING = new Set(NEVER_SURVIVING_SEGMENTS);

// camelCase is a word boundary too. Without this split, bearerToken, privateKey
// and refreshToken reached telemetry intact while bearer_token was redacted.
export function keySegments(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
}

export function neverLoggedSet(fields: readonly string[]): ReadonlySet<string> {
  return new Set(fields.map((field) => field.toLowerCase().replace(/[^a-z0-9]+/gu, '')));
}

/**
 * @param neverLogged normalised by neverLoggedSet, so the runtime redactor and
 * the build-time guard decide the same names from the same list.
 */
export function isDeniedFieldName(
  key: string,
  neverLogged: ReadonlySet<string> = new Set<string>(),
): boolean {
  const lower = key.toLowerCase();
  if (neverLogged.has(lower.replace(/[^a-z0-9]+/gu, ''))) return true;

  // Before the exemption, not after: secretObjectKey is a secret whatever its
  // last two words say, and the exemption only ever spoke for the final word.
  if (DENIED_KEY_SUBSTRINGS.some((needle) => lower.includes(needle))) return true;

  const segments = keySegments(key);
  const final = segments[segments.length - 1];
  const qualifier = segments.length > 1 ? segments[segments.length - 2] : undefined;
  if (final === 'key' && qualifier !== undefined && IDENTIFIER_QUALIFIERS.has(qualifier)) {
    return false;
  }

  return final !== undefined && DENIED_FINALS.has(final);
}

/**
 * A boolean says whether a thing is there, never what it is, and a number under
 * every denied name but the personal ones is a count or a length. Redacting
 * those is what left "pairing is unconfigured" unable to say which setting was
 * missing and the help search unable to report the length of a query.
 */
export function deniedValueSurvives(key: string, value: unknown): boolean {
  if (typeof value === 'boolean') return true;
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  const segments = keySegments(key);
  const final = segments[segments.length - 1];
  return final !== undefined && !NEVER_SURVIVING.has(final);
}

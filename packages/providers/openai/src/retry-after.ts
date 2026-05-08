/**
 * Parse the `Retry-After` HTTP response header into a positive integer of
 * seconds, or `undefined` when the header is absent / unparseable.
 *
 * Per RFC 7231 §7.1.3, `Retry-After` may be either:
 *   - delta-seconds: a non-negative integer (e.g. `Retry-After: 30`).
 *   - HTTP-date:      an absolute timestamp (e.g. `Retry-After: Wed, 21 Oct 2026 07:28:00 GMT`).
 *
 * For the date form we compute `floor((target - now) / 1000)`, clamped to 0
 * when the date is in the past. We never throw — bad headers fall through
 * to `undefined` so the caller can decide on a default backoff.
 *
 * OpenAI's SDK (`APIError`) exposes a `headers` property on caught errors.
 * We accept either a `Headers` instance or a plain `Record<string, string>`
 * object so this helper also works in tests with stubbed errors.
 */
export function parseRetryAfter(
  headers: Headers | Record<string, string | string[] | undefined> | undefined | null,
): number | undefined {
  if (!headers) return undefined;
  let raw: string | null | undefined;
  if (typeof (headers as Headers).get === 'function') {
    raw = (headers as Headers).get('retry-after');
  } else {
    const rec = headers as Record<string, string | string[] | undefined>;
    const v = rec['retry-after'] ?? rec['Retry-After'];
    raw = Array.isArray(v) ? v[0] : v;
  }
  if (typeof raw !== 'string' || raw.length === 0) return undefined;

  const trimmed = raw.trim();
  // delta-seconds form: integer
  if (/^\d+$/.test(trimmed)) {
    const n = Number.parseInt(trimmed, 10);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }
  // Reject anything that looks numeric-but-not-integer (negative,
  // fractional, scientific) — these are not legal HTTP-date input either,
  // so fall through to `undefined`.
  if (/^[+-]?\d/.test(trimmed)) return undefined;
  // HTTP-date form
  const target = Date.parse(trimmed);
  if (Number.isNaN(target)) return undefined;
  const delta = Math.floor((target - Date.now()) / 1000);
  return delta > 0 ? delta : 0;
}

/**
 * Pull the `Retry-After` from an SDK error if present. The OpenAI and
 * Anthropic SDKs both attach the response headers to thrown errors as either
 * a `Headers` instance or (older builds) a plain object.
 */
export function parseRetryAfterFromError(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as {
    headers?: Headers | Record<string, string | string[] | undefined>;
    response?: { headers?: Headers | Record<string, string | string[] | undefined> };
  };
  return parseRetryAfter(e.headers ?? e.response?.headers ?? null);
}

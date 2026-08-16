
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
  if (/^\d+$/.test(trimmed)) {
    const n = Number.parseInt(trimmed, 10);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }
  if (/^[+-]?\d/.test(trimmed)) return undefined;
  const target = Date.parse(trimmed);
  if (Number.isNaN(target)) return undefined;
  const delta = Math.floor((target - Date.now()) / 1000);
  return delta > 0 ? delta : 0;
}

export function parseRetryAfterFromError(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as {
    headers?: Headers | Record<string, string | string[] | undefined>;
    response?: { headers?: Headers | Record<string, string | string[] | undefined> };
  };
  return parseRetryAfter(e.headers ?? e.response?.headers ?? null);
}

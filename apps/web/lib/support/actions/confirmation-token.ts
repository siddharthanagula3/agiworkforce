/**
 * @file Confirmation-token primitives.
 *
 * The raw token is a 256-bit random bearer returned EXACTLY ONCE, in the
 * proposal response. Only its SHA-256 is persisted, so a database read cannot
 * confirm anything. Same construction as `lib/server/device-refresh-token.ts`.
 *
 * `hashActionParams` produces a canonical-JSON digest that welds a token to one
 * parameter set. Canonical means sorted keys, so `{a:1,b:2}` and `{b:2,a:1}`
 * cannot be presented as different proposals for the same effect.
 */

import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const SUPPORT_CONFIRMATION_TOKEN_TTL_MS = 5 * 60 * 1000;

export function mintConfirmationToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: hashConfirmationToken(raw) };
}

export function hashConfirmationToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) out[k] = canonicalize(v);
    return out;
  }
  return value;
}

export function hashActionParams(params: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(params ?? {})), 'utf8')
    .digest('hex');
}

/**
 * Constant-time comparison for two hex digests. Used for the params-hash
 * re-check at execution time; the token itself is matched by the database's
 * conditional UPDATE, which never returns a hash to compare in the first place.
 */
export function digestsMatch(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

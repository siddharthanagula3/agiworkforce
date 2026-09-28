import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { getIdentityProvider } from '@/lib/server/identity';
import { getNeonDb } from '@/lib/server/neon-db';

export const DESKTOP_SIGN_IN_GRANT_TTL_SECONDS = 60;

const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

export function isDesktopSignInChallenge(value: unknown): value is string {
  return typeof value === 'string' && CHALLENGE_PATTERN.test(value);
}

export function isDesktopSignInCode(value: unknown): value is string {
  return typeof value === 'string' && CODE_PATTERN.test(value);
}

export function isDesktopSignInVerifier(value: unknown): value is string {
  return typeof value === 'string' && VERIFIER_PATTERN.test(value);
}

function codeHash(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier, 'utf8').digest('base64url');
}

export async function createDesktopSignInGrant(userId: string, challenge: string): Promise<string> {
  const code = randomBytes(32).toString('base64url');
  const db = getNeonDb();
  await db.execute(
    `delete from public.desktop_sign_in_grants
      where user_id = $1
        and (expires_at < now() or consumed_at is not null)`,
    [userId],
  );
  await db.execute(
    `insert into public.desktop_sign_in_grants (user_id, code_hash, code_challenge, expires_at)
     values ($1, $2, $3, now() + make_interval(secs => $4))`,
    [userId, codeHash(code), challenge, DESKTOP_SIGN_IN_GRANT_TTL_SECONDS],
  );
  return code;
}

export async function redeemDesktopSignInGrant(
  code: string,
  verifier: string,
): Promise<string | null> {
  const rows = await getNeonDb().query<{ user_id: string }>(
    `update public.desktop_sign_in_grants
        set consumed_at = now()
      where code_hash = $1
        and code_challenge = $2
        and consumed_at is null
        and expires_at > now()
      returning user_id`,
    [codeHash(code), challengeFor(verifier)],
  );
  return rows[0]?.user_id ?? null;
}

export function mintDesktopSignInTicket(userId: string): Promise<string> {
  return getIdentityProvider().createSignInToken(userId, DESKTOP_SIGN_IN_GRANT_TTL_SECONDS);
}

import 'server-only';

import { after } from 'next/server';
import {
  ACCOUNT_SECURITY_POLICY,
  ACCOUNT_SECURITY_VERIFY_PAGE_PATH,
  PASSKEY_REQUIRED_REASON,
} from '@agiworkforce/cloud-contracts/account-security';

import { sessionAbsoluteLifetimeMs } from '@/lib/auth/session-policy';
import { AppError, ErrorCode, createError, isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { readRedisWithinBudget, wasRedisReadAbandoned } from '@/lib/server/bounded-redis-read';
import { resolveAuthenticatedAccount } from '@/lib/server/identity-account';
import { getKeyValueStore } from '@/lib/server/key-value';
import { getNeonDb } from '@/lib/server/neon-db';
import { readEnrolledAt, readSessionVerification } from './store';

const CACHE_PREFIX = 'account-security:v1';
const ENROLLED_TTL_SECONDS = 300;
const UNENROLLED_TTL_SECONDS = 60;
const SESSION_TTL_CEILING_SECONDS = 300;
const LOOKUP_DEADLINE_MS = 2_000;
const ISSUED_AT_TOLERANCE_MS = 1_000;
const HOUR_MS = 60 * 60 * 1000;

export class PasskeyRequiredError extends AppError {
  constructor() {
    super(
      ErrorCode.PASSKEY_REQUIRED,
      'Continue with one of your passkeys or security keys to use this account.',
      403,
      { reason: PASSKEY_REQUIRED_REASON, verifyPath: ACCOUNT_SECURITY_VERIFY_PAGE_PATH },
    );
    this.name = 'PasskeyRequiredError';
    Object.setPrototypeOf(this, PasskeyRequiredError.prototype);
  }
}

export function isPasskeyRequiredError(error: unknown): error is PasskeyRequiredError {
  return (
    isAppError(error) &&
    (error.details as { reason?: unknown } | undefined)?.reason === PASSKEY_REQUIRED_REASON
  );
}

export type AccountSecurityPrincipal =
  | { kind: 'session'; sessionId: string | null }
  | { kind: 'device'; issuedAtSeconds: number | null }
  | { kind: 'api_key' };

export function verificationLifetimeSeconds(): number {
  const policyMs = ACCOUNT_SECURITY_POLICY.verificationLifetimeHours * HOUR_MS;
  return Math.floor(Math.min(policyMs, sessionAbsoluteLifetimeMs()) / 1000);
}

interface CachedEnrollment {
  enrolledAt: number | null;
}

interface CachedSession {
  userId: string;
  expiresAt: number;
}

function enrollmentKey(userId: string): string {
  return `${CACHE_PREFIX}:enrolled:${userId}`;
}

function sessionKey(sessionId: string): string {
  return `${CACHE_PREFIX}:session:${sessionId}`;
}

function resolveStore(): ReturnType<typeof getKeyValueStore> {
  try {
    return getKeyValueStore();
  } catch {
    return null;
  }
}

async function readCached<T>(key: string): Promise<T | undefined> {
  const store = resolveStore();
  if (!store) return undefined;
  try {
    const cached = await readRedisWithinBudget(store.get<T>(key));
    if (wasRedisReadAbandoned(cached) || cached === null) return undefined;
    return cached;
  } catch (error) {
    logger.debug({ error }, '[account-security] cache read failed');
    return undefined;
  }
}

function writeCachedOffPath(key: string, value: unknown, ttlSeconds: number): void {
  const store = resolveStore();
  if (!store) return;
  const pending = store
    .set(key, value, { ttlSeconds })
    .then(() => undefined)
    .catch((error: unknown) => {
      logger.debug({ error }, '[account-security] cache write failed');
    });
  try {
    after(pending);
  } catch {
    void pending;
  }
}

async function withinDeadline<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`account security lookup exceeded ${LOOKUP_DEADLINE_MS}ms`)),
          LOOKUP_DEADLINE_MS,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function lookupFailed(error: unknown, userId: string): AppError {
  logger.error({ error, userId }, '[account-security] lookup failed; refusing the request');
  return createError.serviceUnavailable(
    'Unable to verify account security. Please try again shortly.',
  );
}

export async function enrolledAtFor(userId: string): Promise<number | null> {
  const cached = await readCached<CachedEnrollment>(enrollmentKey(userId));
  if (cached !== undefined) return cached.enrolledAt;

  let enrolledAt: number | null;
  try {
    enrolledAt = await withinDeadline(readEnrolledAt(getNeonDb(), userId));
  } catch (error) {
    throw lookupFailed(error, userId);
  }
  writeCachedOffPath(
    enrollmentKey(userId),
    { enrolledAt } satisfies CachedEnrollment,
    enrolledAt === null ? UNENROLLED_TTL_SECONDS : ENROLLED_TTL_SECONDS,
  );
  return enrolledAt;
}

export async function sessionVerifiedUntil(
  userId: string,
  sessionId: string,
): Promise<number | null> {
  const cached = await readCached<CachedSession>(sessionKey(sessionId));
  if (cached !== undefined && cached.userId === userId && cached.expiresAt > Date.now()) {
    return cached.expiresAt;
  }

  let expiresAt: number | null;
  try {
    expiresAt = await withinDeadline(readSessionVerification(getNeonDb(), userId, sessionId));
  } catch (error) {
    throw lookupFailed(error, userId);
  }
  if (expiresAt !== null) {
    const remainingSeconds = Math.floor((expiresAt - Date.now()) / 1000);
    if (remainingSeconds > 0) {
      writeCachedOffPath(
        sessionKey(sessionId),
        { userId, expiresAt } satisfies CachedSession,
        Math.min(SESSION_TTL_CEILING_SECONDS, remainingSeconds),
      );
    }
  }
  return expiresAt;
}

export async function rememberEnrollment(userId: string, enrolledAt: number | null): Promise<void> {
  const store = resolveStore();
  if (!store) return;
  const key = enrollmentKey(userId);
  try {
    await store.set(key, { enrolledAt } satisfies CachedEnrollment, {
      ttlSeconds: enrolledAt === null ? UNENROLLED_TTL_SECONDS : ENROLLED_TTL_SECONDS,
    });
  } catch (error) {
    logger.error({ error, userId }, '[account-security] enrollment cache write failed');
    await store.delete(key).catch((deleteError: unknown) => {
      logger.error(
        { error: deleteError, userId },
        '[account-security] stale enrollment cache entry could not be cleared',
      );
    });
  }
}

export async function forgetSessionVerification(sessionId: string): Promise<void> {
  const store = resolveStore();
  if (!store) return;
  await store.delete(sessionKey(sessionId)).catch((error: unknown) => {
    logger.warn({ error }, '[account-security] session cache entry could not be cleared');
  });
}

export async function assertAccountSecurity(
  userId: string,
  principal: AccountSecurityPrincipal,
): Promise<void> {
  if (principal.kind === 'api_key') return;

  const enrolledAt = await enrolledAtFor(userId);
  if (enrolledAt === null) return;

  if (principal.kind === 'device') {
    const issuedAt = principal.issuedAtSeconds;
    if (issuedAt !== null && issuedAt * 1000 + ISSUED_AT_TOLERANCE_MS >= enrolledAt) return;
    throw createError.unauthorized();
  }

  if (principal.sessionId && (await sessionVerifiedUntil(userId, principal.sessionId)) !== null) {
    return;
  }
  throw new PasskeyRequiredError();
}

export async function sessionPassesAccountSecurity(
  accountId: string,
  sessionId: string | null,
): Promise<boolean> {
  try {
    await assertAccountSecurity(accountId, { kind: 'session', sessionId });
    return true;
  } catch (error) {
    if (isPasskeyRequiredError(error)) return false;
    throw error;
  }
}

export async function subjectSessionPassesAccountSecurity(
  subject: string,
  sessionId: string | null,
): Promise<boolean> {
  const resolution = await resolveAuthenticatedAccount(subject);
  if (resolution.outcome !== 'resolved') return true;
  return sessionPassesAccountSecurity(resolution.account.accountId, sessionId);
}

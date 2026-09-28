import 'server-only';

import type { NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';
import {
  ACCOUNT_SECURITY_POLICY,
  accountSecurityHandoffPageHref,
  type AccountSecurityCredential,
  type AccountSecurityEnrollmentResponse,
  type AccountSecurityHandoffClient,
  type AccountSecurityHandoffResponse,
  type AccountSecurityRecoveryHold,
  type AccountSecurityRecoveryKeysResponse,
  type AccountSecurityStatus,
  type AccountSecurityUnavailableReason,
} from '@agiworkforce/cloud-contracts/account-security';

import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { SITE_URL } from '@/lib/seo/site';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  getIdentityProvider,
  getRequestIdentity,
  verifyIdentitySessionToken,
} from '@/lib/server/identity';
import { getNeonDb } from '@/lib/server/neon-db';
import { revokeEveryDeviceRefreshCredential } from '@/lib/server/refresh-token-family';
import type { UserScopedDb } from '@/lib/server/rls-db';
import { revokeEveryOtherSession } from '@/lib/server/session-revocation';
import { emitIdentitySecurityEvent } from '@/lib/services/identity-events';
import {
  forgetSessionVerification,
  rememberEnrollment,
  sessionVerifiedUntil,
  verificationLifetimeSeconds,
} from './gate';
import {
  codeChallengeFor,
  generateRecoveryKeys,
  hashHandoffCode,
  hashHandoffToken,
  hashRecoveryKey,
  newOpaqueToken,
  normalizeRecoveryKey,
  sameSecret,
} from './secrets';
import {
  cancelRecovery,
  clearEnrollment,
  createHandoff,
  deleteCredential,
  finishRecovery,
  insertCredential,
  listCredentials,
  promotePendingRecoveryKeys,
  readEnrollment,
  readOrganizationControl,
  recordCredentialUse,
  recordSessionVerification,
  replaceChallenge,
  startRecoveryWithKey,
  storePendingRecoveryKeys,
  takeChallenge,
  takeCompletedHandoff,
  type EnrollmentState,
  type RecoveryHoldState,
  type StoredCredential,
  type VerificationMethod,
} from './store';
import {
  authenticationOptions,
  meetsEnrollmentRequirement,
  registrationOptions,
  toCredentialSummary,
  verifyAssertion,
  verifyRegistration,
} from './webauthn';

const BEARER_PREFIX = 'Bearer ';
const API_KEY_PREFIXES = ['sk_live_', 'sk_test_'];
const CEREMONY_TTL_SECONDS = ACCOUNT_SECURITY_POLICY.ceremonyMinutes * 60;

const UNAVAILABLE_MESSAGES: Readonly<Record<AccountSecurityUnavailableReason, string>> = {
  organization_managed:
    'Advanced Account Security is not available for an account your organization manages.',
  claimed_domain:
    'Advanced Account Security is not available for an account on a domain an organization has verified.',
};

export interface AccountSecurityCaller extends UserScopedDb {
  sessionId: string;
}

async function currentSessionId(request: NextRequest): Promise<string | null> {
  const authorization = request.headers.get('authorization');
  if (authorization?.startsWith(BEARER_PREFIX)) {
    const token = authorization.slice(BEARER_PREFIX.length).trim();
    if (API_KEY_PREFIXES.some((prefix) => token.startsWith(prefix))) return null;
    const claims = await verifyIdentitySessionToken(token).catch(() => null);
    return claims?.sessionId ?? null;
  }
  return (await getRequestIdentity()).sessionId;
}

export const ACCOUNT_SECURITY_SCOPE = { resolveOrganization: false } as const;
export const ACCOUNT_SECURITY_VERIFYING_SCOPE = {
  resolveOrganization: false,
  accountSecurityVerification: true,
} as const;

export async function accountSecurityCaller(
  request: NextRequest,
  scoped: UserScopedDb,
): Promise<AccountSecurityCaller> {
  const sessionId = await currentSessionId(request);
  if (!sessionId) {
    throw createError
      .forbidden('Advanced Account Security is managed from a signed-in browser or app.')
      .asUserSafe();
  }
  return { ...scoped, sessionId };
}

export async function unavailableReason(
  userId: string,
): Promise<AccountSecurityUnavailableReason | null> {
  const control = await readOrganizationControl(getNeonDb(), userId);
  if (control.provisioned) return 'organization_managed';
  if (control.claimed_domain) return 'claimed_domain';
  return null;
}

async function requireAvailable(userId: string): Promise<void> {
  const reason = await unavailableReason(userId);
  if (reason) throw createError.forbidden(UNAVAILABLE_MESSAGES[reason]).asUserSafe();
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function toHold(hold: RecoveryHoldState, sessionId: string): AccountSecurityRecoveryHold {
  return {
    startedAt: iso(hold.startedAt),
    unlocksAt: iso(hold.unlocksAt),
    startedOnThisSession: hold.sessionId === sessionId,
  };
}

function isEnrolled(
  enrollment: EnrollmentState | null,
): enrollment is EnrollmentState & { enrolledAt: number } {
  return enrollment?.enrolledAt !== null && enrollment?.enrolledAt !== undefined;
}

export async function callerIsEnrolled(caller: AccountSecurityCaller): Promise<boolean> {
  return isEnrolled(await readEnrollment(caller.db, caller.userId));
}

export async function readAccountSecurityStatus(
  caller: AccountSecurityCaller,
): Promise<AccountSecurityStatus> {
  const enrollment = await readEnrollment(caller.db, caller.userId);
  if (isEnrolled(enrollment)) {
    const hold = enrollment.recovery ? toHold(enrollment.recovery, caller.sessionId) : null;
    const verifiedUntil = await sessionVerifiedUntil(caller.userId, caller.sessionId);
    if (verifiedUntil === null) {
      return {
        state: 'verification_required',
        recovery: hold?.startedOnThisSession ? hold : null,
      };
    }
    const credentials = await listCredentials(caller.db, caller.userId);
    return {
      state: 'enrolled',
      enrolledAt: iso(enrollment.enrolledAt),
      verifiedUntil: iso(verifiedUntil),
      credentials: credentials.map(toCredentialSummary),
      recoveryKeysRemaining: enrollment.recoveryKeysRemaining,
      recovery: hold,
    };
  }

  const reason = await unavailableReason(caller.userId);
  if (reason) return { state: 'unavailable', reason };
  const credentials = await listCredentials(caller.db, caller.userId);
  return { state: 'available', credentials: credentials.map(toCredentialSummary) };
}

async function accountHandle(db: DatabaseAdapter, userId: string): Promise<string> {
  const [row] = await db.query<{ email: string | null }>(
    `select email from public.profiles where id = $1`,
    [userId],
  );
  return row?.email?.trim() || userId;
}

async function enrolledOrAvailable(caller: AccountSecurityCaller): Promise<EnrollmentState | null> {
  const enrollment = await readEnrollment(caller.db, caller.userId);
  if (!isEnrolled(enrollment)) await requireAvailable(caller.userId);
  return enrollment;
}

export async function beginCredentialRegistration(
  caller: AccountSecurityCaller,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  await enrolledOrAvailable(caller);
  const existing = await listCredentials(caller.db, caller.userId);
  const options = await registrationOptions({
    userId: caller.userId,
    userName: await accountHandle(caller.db, caller.userId),
    existing,
  });
  await replaceChallenge(caller.db, {
    userId: caller.userId,
    sessionId: caller.sessionId,
    purpose: 'registration',
    challenge: options.challenge,
    ttlSeconds: CEREMONY_TTL_SECONDS,
  });
  return options;
}

export async function finishCredentialRegistration(
  caller: AccountSecurityCaller,
  input: { name: string; response: unknown },
  request: NextRequest,
): Promise<AccountSecurityCredential> {
  const enrollment = await enrolledOrAvailable(caller);
  const challenge = await takeChallenge(caller.db, {
    userId: caller.userId,
    sessionId: caller.sessionId,
    purpose: 'registration',
  });
  if (!challenge) {
    throw createError.conflict(
      'This request expired. Start adding the passkey or security key again.',
    );
  }
  const verified = await verifyRegistration({
    response: input.response,
    expectedChallenge: challenge,
  });
  if (!verified) {
    throw createError.validation('This passkey or security key could not be verified. Try again.');
  }
  const stored = await insertCredential(caller.db, caller.userId, {
    ...verified,
    name: input.name,
  });
  if (!stored) {
    throw createError.conflict('This passkey or security key is already registered.');
  }

  if (isEnrolled(enrollment)) {
    await emitIdentitySecurityEvent(caller.db, {
      userId: caller.userId,
      event: 'advanced_security_key_added',
      subjectRef: stored.id,
      context: `Name: ${stored.name}.`,
      request,
      detail: { resourceName: stored.name },
    });
  } else {
    await recordAuditEvent({
      userId: caller.userId,
      eventType: 'account_security_credential_added',
      request,
      detail: {
        resourceType: 'account_security',
        resourceId: stored.id,
        resourceName: stored.name,
      },
    });
  }
  return toCredentialSummary(stored);
}

export async function removeCredential(
  caller: AccountSecurityCaller,
  credentialId: string,
  request: NextRequest,
): Promise<void> {
  const enrollment = await readEnrollment(caller.db, caller.userId);
  const credentials = await listCredentials(caller.db, caller.userId);
  const target = credentials.find((credential) => credential.id === credentialId);
  if (!target)
    throw createError.notFound('That passkey or security key was not found.').asUserSafe();

  if (isEnrolled(enrollment)) {
    const remaining = credentials.filter((credential) => credential.id !== credentialId);
    if (!meetsEnrollmentRequirement(remaining)) {
      throw createError.conflict(
        `Keep at least ${ACCOUNT_SECURITY_POLICY.minimumSignInMethods} passkeys or security keys, including one that works across devices. Add another one before removing this one.`,
      );
    }
  }
  if (!(await deleteCredential(caller.db, caller.userId, credentialId))) {
    throw createError.notFound('That passkey or security key was not found.').asUserSafe();
  }

  if (isEnrolled(enrollment)) {
    await emitIdentitySecurityEvent(caller.db, {
      userId: caller.userId,
      event: 'advanced_security_key_removed',
      subjectRef: target.id,
      context: `Name: ${target.name}.`,
      request,
      detail: { resourceName: target.name },
    });
    return;
  }
  await recordAuditEvent({
    userId: caller.userId,
    eventType: 'account_security_credential_removed',
    request,
    detail: { resourceType: 'account_security', resourceId: target.id, resourceName: target.name },
  });
}

export async function prepareRecoveryKeys(
  caller: AccountSecurityCaller,
): Promise<AccountSecurityRecoveryKeysResponse> {
  await enrolledOrAvailable(caller);
  const { keys, hashes } = generateRecoveryKeys(ACCOUNT_SECURITY_POLICY.recoveryKeyCount);
  const expiresAt = await storePendingRecoveryKeys(
    caller.db,
    caller.userId,
    hashes,
    ACCOUNT_SECURITY_POLICY.pendingRecoveryKeysMinutes,
  );
  return { recoveryKeys: keys, expiresAt: iso(expiresAt) };
}

export async function confirmReplacementRecoveryKeys(
  caller: AccountSecurityCaller,
  request: NextRequest,
): Promise<void> {
  const replaced = await promotePendingRecoveryKeys(caller.db, caller.userId, 'replace');
  if (replaced === null) {
    throw createError.conflict(
      'These recovery keys expired or Advanced Account Security is off. Generate new recovery keys and try again.',
    );
  }
  await emitIdentitySecurityEvent(caller.db, {
    userId: caller.userId,
    event: 'advanced_security_recovery_keys_replaced',
    subjectRef: iso(Date.now()),
    request,
  });
}

export async function enrollAccountSecurity(
  caller: AccountSecurityCaller,
  ownerDb: DatabaseAdapter,
  request: NextRequest,
): Promise<AccountSecurityEnrollmentResponse> {
  await requireAvailable(caller.userId);
  const credentials = await listCredentials(caller.db, caller.userId);
  if (!meetsEnrollmentRequirement(credentials)) {
    throw createError.validation(
      `Add at least ${ACCOUNT_SECURITY_POLICY.minimumSignInMethods} passkeys or security keys, including one that works across devices, before you turn this on.`,
    );
  }

  const enrolledAt = await promotePendingRecoveryKeys(caller.db, caller.userId, 'enroll');
  if (enrolledAt === null) {
    throw createError.conflict(
      'Your recovery keys expired, or Advanced Account Security is already on. Generate new recovery keys and try again.',
    );
  }
  await rememberEnrollment(caller.userId, enrolledAt);

  const devicesSignedOut = await revokeEveryDeviceRefreshCredential(ownerDb, caller.userId);
  await ownerDb.execute(
    `update public.device_authorization_codes
        set status = 'denied', updated_at = now()
      where user_id = $1 and status = 'approved'`,
    [caller.userId],
  );
  const sweep = await revokeEveryOtherSession(
    getIdentityProvider(),
    caller.userId,
    caller.sessionId,
  );
  if (sweep.failed.length > 0 || sweep.incomplete) {
    logger.error(
      {
        userId: caller.userId,
        failedCount: sweep.failed.length,
        incomplete: sweep.incomplete,
      },
      '[account-security] some sessions were not ended at enrollment; the passkey gate still refuses them',
    );
  }
  const sessionsSignedOut = sweep.ended.length + sweep.alreadyGone.length;

  await emitIdentitySecurityEvent(caller.db, {
    userId: caller.userId,
    event: 'advanced_security_enabled',
    subjectRef: iso(enrolledAt),
    request,
    detail: {
      count: credentials.length,
      deleted: devicesSignedOut,
      changedKeys: ['sign_in', 'recovery'],
    },
  });

  return { enrolledAt: iso(enrolledAt), sessionsSignedOut, devicesSignedOut };
}

async function consumeAssertion(
  caller: AccountSecurityCaller,
  response: unknown,
  request: NextRequest,
): Promise<StoredCredential> {
  const challenge = await takeChallenge(caller.db, {
    userId: caller.userId,
    sessionId: caller.sessionId,
    purpose: 'authentication',
  });
  if (!challenge) {
    throw createError.conflict('This request expired. Try your passkey or security key again.');
  }
  const credentials = await listCredentials(caller.db, caller.userId);
  const verified = await verifyAssertion({ response, expectedChallenge: challenge, credentials });
  if (
    !verified ||
    !(await recordCredentialUse(
      caller.db,
      caller.userId,
      verified.credential.id,
      verified.signCount,
    ))
  ) {
    await recordAuditEvent({
      userId: caller.userId,
      eventType: 'account_security_verification_failed',
      outcome: 'failure',
      severity: 'warning',
      request,
      detail: { resourceType: 'account_security', resourceId: 'assertion' },
    });
    throw createError.validation(
      'That passkey or security key could not be verified. Try again, or use a different one.',
    );
  }
  return verified.credential;
}

export async function beginVerification(
  caller: AccountSecurityCaller,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const credentials = await listCredentials(caller.db, caller.userId);
  if (credentials.length === 0) {
    throw createError.conflict('Add a passkey or security key first.');
  }
  const options = await authenticationOptions(credentials);
  await replaceChallenge(caller.db, {
    userId: caller.userId,
    sessionId: caller.sessionId,
    purpose: 'authentication',
    challenge: options.challenge,
    ttlSeconds: CEREMONY_TTL_SECONDS,
  });
  return options;
}

async function markSessionVerified(
  db: DatabaseAdapter,
  input: {
    userId: string;
    sessionId: string;
    method: VerificationMethod;
    credentialRowId: string | null;
    request: NextRequest;
  },
): Promise<string> {
  const expiresAt = await recordSessionVerification(db, {
    userId: input.userId,
    sessionId: input.sessionId,
    method: input.method,
    credentialRowId: input.credentialRowId,
    lifetimeSeconds: verificationLifetimeSeconds(),
  });
  await forgetSessionVerification(input.sessionId);
  await recordAuditEvent({
    userId: input.userId,
    eventType: 'account_security_session_verified',
    request: input.request,
    detail: { resourceType: 'account_security', resourceId: 'session', source: input.method },
  });
  return iso(expiresAt);
}

export async function completeVerification(
  caller: AccountSecurityCaller,
  response: unknown,
  request: NextRequest,
): Promise<string> {
  const credential = await consumeAssertion(caller, response, request);
  return markSessionVerified(caller.db, {
    userId: caller.userId,
    sessionId: caller.sessionId,
    method: 'passkey',
    credentialRowId: credential.id,
    request,
  });
}

export async function disableAccountSecurity(
  caller: AccountSecurityCaller,
  response: unknown,
  request: NextRequest,
): Promise<void> {
  await consumeAssertion(caller, response, request);
  if (!(await clearEnrollment(caller.db, caller.userId))) {
    throw createError.conflict('Advanced Account Security is already off.');
  }
  await rememberEnrollment(caller.userId, null);
  await emitIdentitySecurityEvent(caller.db, {
    userId: caller.userId,
    event: 'advanced_security_disabled',
    subjectRef: iso(Date.now()),
    request,
  });
}

export async function startRecovery(
  caller: AccountSecurityCaller,
  recoveryKey: string,
  request: NextRequest,
): Promise<AccountSecurityRecoveryHold> {
  const normalized = normalizeRecoveryKey(recoveryKey);
  const hold = normalized
    ? await startRecoveryWithKey(caller.db, {
        userId: caller.userId,
        keyHash: hashRecoveryKey(normalized),
        sessionId: caller.sessionId,
        holdHours: ACCOUNT_SECURITY_POLICY.recoveryHoldHours,
      })
    : null;
  if (!hold) {
    await recordAuditEvent({
      userId: caller.userId,
      eventType: 'account_security_verification_failed',
      outcome: 'failure',
      severity: 'warning',
      request,
      detail: { resourceType: 'account_security', resourceId: 'recovery_key' },
    });
    throw createError.validation('That recovery key is not valid, or it was already used.');
  }

  await emitIdentitySecurityEvent(caller.db, {
    userId: caller.userId,
    event: 'advanced_security_recovery_started',
    subjectRef: iso(hold.startedAt),
    context: `The account unlocks at ${iso(hold.unlocksAt)} UTC.`,
    request,
  });
  return toHold(hold, caller.sessionId);
}

export async function completeRecovery(
  caller: AccountSecurityCaller,
  request: NextRequest,
): Promise<string> {
  if (!(await finishRecovery(caller.db, caller.userId, caller.sessionId))) {
    throw createError.conflict(
      'Recovery can be completed only from the device that started it, once the waiting period ends.',
    );
  }
  const verifiedUntil = await markSessionVerified(caller.db, {
    userId: caller.userId,
    sessionId: caller.sessionId,
    method: 'recovery',
    credentialRowId: null,
    request,
  });
  await emitIdentitySecurityEvent(caller.db, {
    userId: caller.userId,
    event: 'advanced_security_recovery_completed',
    subjectRef: iso(Date.now()),
    request,
  });
  return verifiedUntil;
}

export async function cancelPendingRecovery(
  caller: AccountSecurityCaller,
  request: NextRequest,
): Promise<void> {
  if (!(await cancelRecovery(caller.db, caller.userId))) {
    throw createError.conflict('There is no recovery waiting to be cancelled.');
  }
  await emitIdentitySecurityEvent(caller.db, {
    userId: caller.userId,
    event: 'advanced_security_recovery_cancelled',
    subjectRef: iso(Date.now()),
    request,
  });
}

export async function openHandoff(
  caller: AccountSecurityCaller,
  input: { client: AccountSecurityHandoffClient; codeChallenge: string },
): Promise<AccountSecurityHandoffResponse> {
  const enrollment = await readEnrollment(caller.db, caller.userId);
  if (!isEnrolled(enrollment)) {
    throw createError.conflict('Advanced Account Security is off for this account.');
  }
  const handoff = newOpaqueToken();
  const expiresAt = await createHandoff(caller.db, {
    userId: caller.userId,
    sessionId: caller.sessionId,
    handoffHash: hashHandoffToken(handoff),
    codeChallenge: input.codeChallenge,
    client: input.client,
    ttlMinutes: ACCOUNT_SECURITY_POLICY.handoffMinutes,
  });
  return {
    url: new URL(accountSecurityHandoffPageHref(handoff), SITE_URL).toString(),
    expiresAt: iso(expiresAt),
  };
}

export async function completeHandoff(
  caller: AccountSecurityCaller,
  input: { handoff: string; code: string; codeVerifier: string },
  request: NextRequest,
): Promise<string> {
  const taken = await takeCompletedHandoff(caller.db, {
    handoffHash: hashHandoffToken(input.handoff),
    userId: caller.userId,
    sessionId: caller.sessionId,
  });
  if (
    !taken?.codeHash ||
    !sameSecret(taken.codeHash, hashHandoffCode(input.code)) ||
    !sameSecret(taken.codeChallenge, codeChallengeFor(input.codeVerifier))
  ) {
    await recordAuditEvent({
      userId: caller.userId,
      eventType: 'account_security_verification_failed',
      outcome: 'failure',
      severity: 'warning',
      request,
      detail: { resourceType: 'account_security', resourceId: 'handoff' },
    });
    throw createError.validation('This sign-in could not be confirmed. Start again from the app.');
  }
  return markSessionVerified(caller.db, {
    userId: caller.userId,
    sessionId: caller.sessionId,
    method: 'passkey',
    credentialRowId: null,
    request,
  });
}

import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { AccountSecurityHandoffClient } from '@agiworkforce/cloud-contracts/account-security';

export type CeremonyPurpose = 'registration' | 'authentication';
export type VerificationMethod = 'passkey' | 'recovery';
export type CredentialDeviceType = 'singleDevice' | 'multiDevice';

type Timestamp = string | Date;

export interface EnrollmentState {
  enrolledAt: number | null;
  recoveryKeysRemaining: number;
  pendingRecoveryKeysExpireAt: number | null;
  recovery: RecoveryHoldState | null;
}

export interface RecoveryHoldState {
  startedAt: number;
  unlocksAt: number;
  sessionId: string;
}

export interface StoredCredential {
  id: string;
  credentialId: string;
  publicKey: string;
  signCount: number;
  transports: string[];
  deviceType: CredentialDeviceType;
  backedUp: boolean;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface StoredHandoff {
  id: string;
  userId: string;
  sessionId: string;
  challenge: string | null;
  codeChallenge: string;
  codeHash: string | null;
  client: AccountSecurityHandoffClient;
  completedAt: number | null;
  expiresAt: number;
}

interface EnrollmentRow {
  enrolled_at: Timestamp | null;
  recovery_keys_remaining: number;
  pending_recovery_keys_expire_at: Timestamp | null;
  recovery_started_at: Timestamp | null;
  recovery_unlocks_at: Timestamp | null;
  recovery_session_id: string | null;
}

interface CredentialRow {
  id: string;
  credential_id: string;
  public_key: string;
  sign_count: number;
  transports: string[];
  device_type: CredentialDeviceType;
  backed_up: boolean;
  name: string;
  created_at: Timestamp;
  last_used_at: Timestamp | null;
}

interface HandoffRow {
  id: string;
  user_id: string;
  session_id: string;
  challenge: string | null;
  code_challenge: string;
  code_hash: string | null;
  client: AccountSecurityHandoffClient;
  completed_at: Timestamp | null;
  expires_at: Timestamp;
}

function toMs(value: Timestamp): number {
  return new Date(value).getTime();
}

function toMsOrNull(value: Timestamp | null): number | null {
  return value === null ? null : toMs(value);
}

const ENROLLMENT_COLUMNS = `
  enrolled_at,
  cardinality(recovery_key_hashes)::integer as recovery_keys_remaining,
  pending_recovery_keys_expire_at,
  recovery_started_at,
  recovery_unlocks_at,
  recovery_session_id`;

function toEnrollment(row: EnrollmentRow): EnrollmentState {
  const startedAt = toMsOrNull(row.recovery_started_at);
  const unlocksAt = toMsOrNull(row.recovery_unlocks_at);
  return {
    enrolledAt: toMsOrNull(row.enrolled_at),
    recoveryKeysRemaining: row.recovery_keys_remaining,
    pendingRecoveryKeysExpireAt: toMsOrNull(row.pending_recovery_keys_expire_at),
    recovery:
      startedAt !== null && unlocksAt !== null && row.recovery_session_id
        ? { startedAt, unlocksAt, sessionId: row.recovery_session_id }
        : null,
  };
}

export async function readEnrollment(
  db: DatabaseAdapter,
  userId: string,
): Promise<EnrollmentState | null> {
  const [row] = await db.query<EnrollmentRow>(
    `select ${ENROLLMENT_COLUMNS}
       from public.account_security_enrollments
      where user_id = $1`,
    [userId],
  );
  return row ? toEnrollment(row) : null;
}

export async function readEnrolledAt(db: DatabaseAdapter, userId: string): Promise<number | null> {
  const [row] = await db.query<{ enrolled_at: Timestamp | null }>(
    `select enrolled_at from public.account_security_enrollments where user_id = $1`,
    [userId],
  );
  return row ? toMsOrNull(row.enrolled_at) : null;
}

const CREDENTIAL_COLUMNS = `
  id::text as id, credential_id, public_key, sign_count::float8 as sign_count, transports,
  device_type, backed_up, name, created_at, last_used_at`;

function toCredential(row: CredentialRow): StoredCredential {
  return {
    id: row.id,
    credentialId: row.credential_id,
    publicKey: row.public_key,
    signCount: row.sign_count,
    transports: row.transports,
    deviceType: row.device_type,
    backedUp: row.backed_up,
    name: row.name,
    createdAt: toMs(row.created_at),
    lastUsedAt: toMsOrNull(row.last_used_at),
  };
}

export async function listCredentials(
  db: DatabaseAdapter,
  userId: string,
): Promise<StoredCredential[]> {
  const rows = await db.query<CredentialRow>(
    `select ${CREDENTIAL_COLUMNS}
       from public.account_security_credentials
      where user_id = $1
      order by created_at asc`,
    [userId],
  );
  return rows.map(toCredential);
}

export async function insertCredential(
  db: DatabaseAdapter,
  userId: string,
  input: Omit<StoredCredential, 'id' | 'createdAt' | 'lastUsedAt'>,
): Promise<StoredCredential | null> {
  const [row] = await db.query<CredentialRow>(
    `insert into public.account_security_credentials
       (user_id, credential_id, public_key, sign_count, transports, device_type, backed_up, name)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (credential_id) do nothing
     returning ${CREDENTIAL_COLUMNS}`,
    [
      userId,
      input.credentialId,
      input.publicKey,
      input.signCount,
      input.transports,
      input.deviceType,
      input.backedUp,
      input.name,
    ],
  );
  return row ? toCredential(row) : null;
}

export async function deleteCredential(
  db: DatabaseAdapter,
  userId: string,
  id: string,
): Promise<boolean> {
  const removed = await db.execute(
    `delete from public.account_security_credentials where user_id = $1 and id::text = $2`,
    [userId, id],
  );
  return removed > 0;
}

export async function recordCredentialUse(
  db: DatabaseAdapter,
  userId: string,
  id: string,
  signCount: number,
): Promise<boolean> {
  const updated = await db.execute(
    `update public.account_security_credentials
        set sign_count = $3, last_used_at = now()
      where user_id = $1
        and id::text = $2
        and ($3 > sign_count or ($3 = 0 and sign_count = 0))`,
    [userId, id, signCount],
  );
  return updated > 0;
}

export async function replaceChallenge(
  db: DatabaseAdapter,
  input: {
    userId: string;
    sessionId: string;
    purpose: CeremonyPurpose;
    challenge: string;
    ttlSeconds: number;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(
      `delete from public.account_security_challenges
        where user_id = $1
          and ((session_id = $2 and purpose = $3) or expires_at < now())`,
      [input.userId, input.sessionId, input.purpose],
    );
    await tx.execute(
      `insert into public.account_security_challenges
         (user_id, purpose, session_id, challenge, expires_at)
       values ($1, $2, $3, $4, now() + make_interval(secs => $5::integer))`,
      [input.userId, input.purpose, input.sessionId, input.challenge, input.ttlSeconds],
    );
  });
}

export async function takeChallenge(
  db: DatabaseAdapter,
  input: { userId: string; sessionId: string; purpose: CeremonyPurpose },
): Promise<string | null> {
  const [row] = await db.query<{ challenge: string; live: boolean }>(
    `delete from public.account_security_challenges
      where user_id = $1 and session_id = $2 and purpose = $3
      returning challenge, expires_at > now() as live`,
    [input.userId, input.sessionId, input.purpose],
  );
  return row?.live ? row.challenge : null;
}

export async function storePendingRecoveryKeys(
  db: DatabaseAdapter,
  input: { userId: string; sessionId: string; hashes: readonly string[]; ttlMinutes: number },
): Promise<number> {
  const [row] = await db.query<{ pending_recovery_keys_expire_at: Timestamp }>(
    `insert into public.account_security_enrollments
       (user_id, pending_recovery_key_hashes, pending_recovery_keys_expire_at,
        pending_recovery_session_id)
     values ($1, $2::text[], now() + make_interval(mins => $3::integer), $4)
     on conflict (user_id) do update
       set pending_recovery_key_hashes = excluded.pending_recovery_key_hashes,
           pending_recovery_keys_expire_at = excluded.pending_recovery_keys_expire_at,
           pending_recovery_session_id = excluded.pending_recovery_session_id
     returning pending_recovery_keys_expire_at`,
    [input.userId, input.hashes, input.ttlMinutes, input.sessionId],
  );
  if (!row) throw new Error('pending recovery keys were not stored');
  return toMs(row.pending_recovery_keys_expire_at);
}

export async function promotePendingRecoveryKeys(
  db: DatabaseAdapter,
  input: { userId: string; sessionId: string; mode: 'enroll' | 'replace' },
): Promise<number | null> {
  const [row] = await db.query<{ enrolled_at: Timestamp }>(
    `update public.account_security_enrollments
        set recovery_key_hashes = pending_recovery_key_hashes,
            pending_recovery_key_hashes = null,
            pending_recovery_keys_expire_at = null,
            pending_recovery_session_id = null,
            enrolled_at = case when $2::text = 'enroll' then now() else enrolled_at end
      where user_id = $1
        and pending_recovery_key_hashes is not null
        and pending_recovery_keys_expire_at > now()
        and pending_recovery_session_id = $3
        and (case when $2::text = 'enroll' then enrolled_at is null else enrolled_at is not null end)
      returning enrolled_at`,
    [input.userId, input.mode, input.sessionId],
  );
  return row ? toMsOrNull(row.enrolled_at) : null;
}

const CLEARED_ENROLLMENT = `
  enrolled_at = null,
  recovery_key_hashes = '{}',
  pending_recovery_key_hashes = null,
  pending_recovery_keys_expire_at = null,
  pending_recovery_session_id = null,
  recovery_started_at = null,
  recovery_unlocks_at = null,
  recovery_session_id = null,
  enrolled_session_id = null,
  undo_token_hash = null,
  undo_expires_at = null`;

export async function clearEnrollment(db: DatabaseAdapter, userId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const cleared = await tx.execute(
      `update public.account_security_enrollments
          set ${CLEARED_ENROLLMENT}
        where user_id = $1 and enrolled_at is not null`,
      [userId],
    );
    await tx.execute(`delete from public.account_security_sessions where user_id = $1`, [userId]);
    return cleared > 0;
  });
}

export async function armEnrollmentUndo(
  db: DatabaseAdapter,
  input: { userId: string; sessionId: string; tokenHash: string; ttlHours: number },
): Promise<number | null> {
  const [row] = await db.query<{ undo_expires_at: Timestamp }>(
    `update public.account_security_enrollments
        set enrolled_session_id = $2,
            undo_token_hash = $3,
            undo_expires_at = now() + make_interval(hours => $4::integer)
      where user_id = $1 and enrolled_at is not null
      returning undo_expires_at`,
    [input.userId, input.sessionId, input.tokenHash, input.ttlHours],
  );
  return row ? toMs(row.undo_expires_at) : null;
}

export interface OpenEnrollmentUndo {
  userId: string;
  enrolledSessionId: string | null;
}

export async function readEnrollmentUndo(
  ownerDb: DatabaseAdapter,
  tokenHash: string,
): Promise<OpenEnrollmentUndo | null> {
  const [row] = await ownerDb.query<{ user_id: string; enrolled_session_id: string | null }>(
    `select user_id, enrolled_session_id
       from public.account_security_enrollments
      where undo_token_hash = $1
        and undo_expires_at > now()
        and enrolled_at is not null`,
    [tokenHash],
  );
  return row ? { userId: row.user_id, enrolledSessionId: row.enrolled_session_id } : null;
}

export async function undoEnrollment(
  ownerDb: DatabaseAdapter,
  input: { userId: string; tokenHash: string },
): Promise<boolean> {
  return ownerDb.transaction(async (tx) => {
    const [cleared] = await tx.query<{ enrolled_at: Timestamp }>(
      `with enrolled as (
         select enrolled_at
           from public.account_security_enrollments
          where user_id = $1
            and undo_token_hash = $2
            and undo_expires_at > now()
            and enrolled_at is not null
          for update
       )
       update public.account_security_enrollments
          set ${CLEARED_ENROLLMENT}
         from enrolled
        where public.account_security_enrollments.user_id = $1
       returning enrolled.enrolled_at`,
      [input.userId, input.tokenHash],
    );
    if (!cleared) return false;
    await tx.execute(`delete from public.account_security_sessions where user_id = $1`, [
      input.userId,
    ]);
    await tx.execute(
      `delete from public.account_security_credentials where user_id = $1 and created_at <= $2`,
      [input.userId, cleared.enrolled_at],
    );
    await tx.execute(`delete from public.account_security_challenges where user_id = $1`, [
      input.userId,
    ]);
    return true;
  });
}

export async function replaceEnrollmentCode(
  db: DatabaseAdapter,
  input: {
    userId: string;
    sessionId: string;
    codeHash: string;
    ttlMinutes: number;
    maxAttempts: number;
    lockoutMinutes: number;
  },
): Promise<number | null> {
  return db.transaction(async (tx) => {
    const [recent] = await tx.query<{ attempts: number }>(
      `select coalesce(max(attempts), 0)::integer as attempts
         from public.account_security_challenges
        where user_id = $1
          and purpose = 'enrollment_email'
          and created_at > now() - make_interval(mins => $2::integer)`,
      [input.userId, input.lockoutMinutes],
    );
    const attempts = recent?.attempts ?? 0;
    if (attempts >= input.maxAttempts) return null;
    await tx.execute(
      `delete from public.account_security_challenges
        where user_id = $1
          and (purpose = 'enrollment_email' or expires_at < now())`,
      [input.userId],
    );
    const [row] = await tx.query<{ expires_at: Timestamp }>(
      `insert into public.account_security_challenges
         (user_id, purpose, session_id, code_hash, attempts, expires_at)
       values ($1, 'enrollment_email', $2, $3, $5, now() + make_interval(mins => $4::integer))
       returning expires_at`,
      [input.userId, input.sessionId, input.codeHash, input.ttlMinutes, attempts],
    );
    if (!row) throw new Error('enrollment code was not stored');
    return toMs(row.expires_at);
  });
}

export async function takeEnrollmentCode(
  db: DatabaseAdapter,
  input: { userId: string; sessionId: string; codeHash: string; maxAttempts: number },
): Promise<boolean> {
  const [taken] = await db.query<{ id: string }>(
    `delete from public.account_security_challenges
      where user_id = $1
        and session_id = $2
        and purpose = 'enrollment_email'
        and code_hash = $3
        and attempts < $4
        and expires_at > now()
      returning id::text as id`,
    [input.userId, input.sessionId, input.codeHash, input.maxAttempts],
  );
  if (taken) return true;
  await db.execute(
    `update public.account_security_challenges
        set attempts = attempts + 1
      where user_id = $1
        and session_id = $2
        and purpose = 'enrollment_email'
        and attempts < $3`,
    [input.userId, input.sessionId, input.maxAttempts],
  );
  return false;
}

export async function signInAddressChangedSince(
  db: DatabaseAdapter,
  userId: string,
  days: number,
): Promise<boolean> {
  const [row] = await db.query<{ changed: boolean }>(
    `select exists (
              select 1 from public.identity_risk_observations
               where user_id = $1
                 and event_key = 'email_changed'
                 and outcome = 'success'
                 and observed_at > now() - make_interval(days => $2::integer)
            ) as changed`,
    [userId, days],
  );
  return row?.changed === true;
}

export async function startRecoveryWithKey(
  db: DatabaseAdapter,
  input: { userId: string; keyHash: string; sessionId: string; holdHours: number },
): Promise<RecoveryHoldState | null> {
  const [row] = await db.query<{
    recovery_started_at: Timestamp;
    recovery_unlocks_at: Timestamp;
    recovery_session_id: string;
  }>(
    `update public.account_security_enrollments
        set recovery_key_hashes = array_remove(recovery_key_hashes, $2::text),
            recovery_started_at = now(),
            recovery_unlocks_at = now() + make_interval(hours => $4::integer),
            recovery_session_id = $3
      where user_id = $1
        and enrolled_at is not null
        and $2::text = any (recovery_key_hashes)
      returning recovery_started_at, recovery_unlocks_at, recovery_session_id`,
    [input.userId, input.keyHash, input.sessionId, input.holdHours],
  );
  if (!row) return null;
  return {
    startedAt: toMs(row.recovery_started_at),
    unlocksAt: toMs(row.recovery_unlocks_at),
    sessionId: row.recovery_session_id,
  };
}

export async function finishRecovery(
  db: DatabaseAdapter,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const finished = await db.execute(
    `update public.account_security_enrollments
        set recovery_started_at = null, recovery_unlocks_at = null, recovery_session_id = null
      where user_id = $1
        and recovery_session_id = $2
        and recovery_unlocks_at <= now()`,
    [userId, sessionId],
  );
  return finished > 0;
}

export async function cancelRecovery(db: DatabaseAdapter, userId: string): Promise<boolean> {
  const cancelled = await db.execute(
    `update public.account_security_enrollments
        set recovery_started_at = null, recovery_unlocks_at = null, recovery_session_id = null
      where user_id = $1 and recovery_started_at is not null`,
    [userId],
  );
  return cancelled > 0;
}

export async function recordSessionVerification(
  db: DatabaseAdapter,
  input: {
    userId: string;
    sessionId: string;
    method: VerificationMethod;
    credentialRowId: string | null;
    lifetimeSeconds: number;
  },
): Promise<number> {
  const [row] = await db.query<{ expires_at: Timestamp }>(
    `with swept as (
       delete from public.account_security_sessions
        where user_id = $1 and expires_at < now() and session_id <> $2
     )
     insert into public.account_security_sessions
       (session_id, user_id, method, credential_id, verified_at, expires_at)
     values ($2, $1, $3, $4::uuid, now(), now() + make_interval(secs => $5::integer))
     on conflict (session_id) do update
       set method = excluded.method,
           credential_id = excluded.credential_id,
           verified_at = excluded.verified_at,
           expires_at = excluded.expires_at
       where public.account_security_sessions.user_id = excluded.user_id
     returning expires_at`,
    [input.userId, input.sessionId, input.method, input.credentialRowId, input.lifetimeSeconds],
  );
  if (!row) throw new Error('session verification was not recorded');
  return toMs(row.expires_at);
}

export async function readSessionVerification(
  db: DatabaseAdapter,
  userId: string,
  sessionId: string,
): Promise<number | null> {
  const [row] = await db.query<{ expires_at: Timestamp }>(
    `select expires_at
       from public.account_security_sessions
      where session_id = $1 and user_id = $2 and expires_at > now()`,
    [sessionId, userId],
  );
  return row ? toMs(row.expires_at) : null;
}

const HANDOFF_COLUMNS = `
  id::text as id, user_id, session_id, challenge, code_challenge, code_hash, client,
  completed_at, expires_at`;

function toHandoff(row: HandoffRow): StoredHandoff {
  return {
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    challenge: row.challenge,
    codeChallenge: row.code_challenge,
    codeHash: row.code_hash,
    client: row.client,
    completedAt: toMsOrNull(row.completed_at),
    expiresAt: toMs(row.expires_at),
  };
}

export async function createHandoff(
  db: DatabaseAdapter,
  input: {
    userId: string;
    sessionId: string;
    handoffHash: string;
    codeChallenge: string;
    client: AccountSecurityHandoffClient;
    ttlMinutes: number;
  },
): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(
      `delete from public.account_security_challenges
        where user_id = $1
          and ((session_id = $2 and purpose = 'handoff') or expires_at < now())`,
      [input.userId, input.sessionId],
    );
    const [row] = await tx.query<{ expires_at: Timestamp }>(
      `insert into public.account_security_challenges
         (user_id, purpose, session_id, handoff_hash, code_challenge, client, expires_at)
       values ($1, 'handoff', $2, $3, $4, $5, now() + make_interval(mins => $6::integer))
       returning expires_at`,
      [
        input.userId,
        input.sessionId,
        input.handoffHash,
        input.codeChallenge,
        input.client,
        input.ttlMinutes,
      ],
    );
    if (!row) throw new Error('handoff was not stored');
    return toMs(row.expires_at);
  });
}

export async function readOpenHandoff(
  db: DatabaseAdapter,
  handoffHash: string,
): Promise<StoredHandoff | null> {
  const [row] = await db.query<HandoffRow>(
    `select ${HANDOFF_COLUMNS}
       from public.account_security_challenges
      where handoff_hash = $1
        and purpose = 'handoff'
        and completed_at is null
        and expires_at > now()`,
    [handoffHash],
  );
  return row ? toHandoff(row) : null;
}

export async function setHandoffChallenge(
  db: DatabaseAdapter,
  handoff: Pick<StoredHandoff, 'id' | 'userId'>,
  challenge: string,
): Promise<boolean> {
  const updated = await db.execute(
    `update public.account_security_challenges
        set challenge = $3
      where id::text = $1
        and user_id = $2
        and completed_at is null
        and expires_at > now()`,
    [handoff.id, handoff.userId, challenge],
  );
  return updated > 0;
}

export async function completeHandoffAssertion(
  db: DatabaseAdapter,
  input: { handoff: Pick<StoredHandoff, 'id' | 'userId'>; challenge: string; codeHash: string },
): Promise<boolean> {
  const updated = await db.execute(
    `update public.account_security_challenges
        set challenge = null, code_hash = $4, completed_at = now()
      where id::text = $1
        and user_id = $2
        and challenge = $3
        and completed_at is null
        and expires_at > now()`,
    [input.handoff.id, input.handoff.userId, input.challenge, input.codeHash],
  );
  return updated > 0;
}

export async function takeCompletedHandoff(
  db: DatabaseAdapter,
  input: { handoffHash: string; userId: string; sessionId: string },
): Promise<StoredHandoff | null> {
  const [row] = await db.query<HandoffRow>(
    `delete from public.account_security_challenges
      where handoff_hash = $1
        and user_id = $2
        and session_id = $3
        and purpose = 'handoff'
        and completed_at is not null
        and expires_at > now()
      returning ${HANDOFF_COLUMNS}`,
    [input.handoffHash, input.userId, input.sessionId],
  );
  return row ? toHandoff(row) : null;
}

export interface AccountSecurityEligibilityRow {
  provisioned: boolean;
  claimed_domain: boolean;
}

export async function readOrganizationControl(
  ownerDb: DatabaseAdapter,
  userId: string,
): Promise<AccountSecurityEligibilityRow> {
  const [row] = await ownerDb.query<AccountSecurityEligibilityRow>(
    `select exists (
              select 1 from public.scim_provisioned_users s
               where s.linked_user_id = p.id and s.active
            ) as provisioned,
            exists (
              select 1 from public.sso_connections c
               where c.domain_verified_at is not null
                 and lower(c.domain) = lower(split_part(p.email, '@', 2))
            ) as claimed_domain
       from public.profiles p
      where p.id = $1`,
    [userId],
  );
  return row ?? { provisioned: false, claimed_domain: false };
}

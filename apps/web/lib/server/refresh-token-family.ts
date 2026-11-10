import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { revokeMobileIntentTokens } from '@/lib/server/mobile-intent-tokens';

export const REFRESH_FAMILY_COMPROMISE_REASONS = [
  'replayed',
  'device_lost',
  'admin_revoked',
] as const;

export type RefreshFamilyCompromiseReason = (typeof REFRESH_FAMILY_COMPROMISE_REASONS)[number];

export interface DeviceCredentialRevocation {
  userId: string;
  deviceId: string;
  credentialFamilyId: string | null;
  compromisedAs?: RefreshFamilyCompromiseReason;
}

export interface DeviceCredentialRevocationResult {
  revoked: number;
  compromiseRecorded: boolean;
}

const FENCE_CONFLICT = `
  on conflict (family_id) do update
     set revoked_at = coalesce(device_refresh_token_families.revoked_at, excluded.revoked_at)
   where device_refresh_token_families.user_id = excluded.user_id`;

const FENCE_DEVICE = `
  insert into public.device_refresh_token_families (family_id, user_id, revoked_at)
  select distinct family_id, user_id, now()
    from device_refresh_tokens
   where user_id = $2
     and (device_id = $1 or family_id::text = $3)
   order by family_id
  ${FENCE_CONFLICT}`;

/**
 * By family, not by row: rotation issues a fresh row per refresh, so device_id
 * alone misses families whose earlier rows predate 0133.
 */
const REVOKE = `
  update device_refresh_tokens
     set revoked_at = coalesce(revoked_at, now())
   where user_id = $2
     and revoked_at is null
     and (
       family_id in (
         select family_id from device_refresh_tokens
          where user_id = $2 and device_id = $1
       )
       or family_id::text = $3
     )
   returning id`;

/**
 * Covers rows already revoked: a family signed out of last week that turns out
 * to have been stolen is still compromised, and the record has to say so.
 */
const COMPROMISE = `
  update device_refresh_tokens
     set compromised_at = coalesce(compromised_at, now()),
         compromised_reason = coalesce(compromised_reason, $4)
   where user_id = $2
     and (
       family_id in (
         select family_id from device_refresh_tokens
          where user_id = $2 and device_id = $1
       )
       or family_id::text = $3
     )`;

const FENCE_FAMILY = `
  insert into public.device_refresh_token_families (family_id, user_id, revoked_at)
  select distinct family_id, user_id, $3::timestamptz
    from device_refresh_tokens
   where family_id::text = $1
     and user_id = $2
  ${FENCE_CONFLICT}`;

const REVOKE_FAMILY = `
  update device_refresh_tokens
     set revoked_at = coalesce(revoked_at, $3)
   where family_id::text = $1
     and user_id = $2
     and revoked_at is null
   returning id`;

/**
 * Covers rows already revoked, so the record survives a family that was signed
 * out before the theft was discovered.
 */
const COMPROMISE_FAMILY = `
  update device_refresh_tokens
     set compromised_at = coalesce(compromised_at, $3),
         compromised_reason = coalesce(compromised_reason, $4)
   where family_id::text = $1
     and user_id = $2`;

const FENCE_EVERY = `
  insert into public.device_refresh_token_families (family_id, user_id, revoked_at)
  select distinct family_id, user_id, now()
    from device_refresh_tokens
   where user_id = $1
     and revoked_at is null
   order by family_id
  ${FENCE_CONFLICT}`;

const REVOKE_EVERY = `
  update device_refresh_tokens
     set revoked_at = coalesce(revoked_at, now())
   where user_id = $1
     and revoked_at is null
   returning id`;

const FENCE_WORKSPACE = `
  insert into public.device_refresh_token_families (family_id, user_id, revoked_at)
  select distinct family_id, user_id, now()
    from device_refresh_tokens
   where user_id = $1
     and organization_id = $2
     and revoked_at is null
   order by family_id
  ${FENCE_CONFLICT}`;

const REVOKE_WORKSPACE = `
  update device_refresh_tokens
     set revoked_at = coalesce(revoked_at, now())
   where user_id = $1
     and organization_id = $2
     and revoked_at is null
   returning id`;

/**
 * Rotation locks the family row before the presented token and refuses a
 * revoked family; a revocation ends the family row before it touches token
 * rows. Under READ COMMITTED a rotation that held the family lock first has
 * committed its successor before the revoking UPDATE starts, so that UPDATE
 * sees it; a later rotation waits on the family row and is refused. Both sides
 * take the family row first, so the two can never deadlock.
 */
async function endFamiliesThenRevoke(
  db: DatabaseAdapter,
  fence: string,
  revoke: string,
  params: unknown[],
): Promise<number> {
  await db.execute(fence, params);
  const revoked = await db.query<{ id: string }>(revoke, params);
  return revoked.length;
}

export interface RotationFamilyLock {
  familyId: string;
  revoked: boolean;
}

/**
 * Taken first in a rotation transaction: inserts the family row when it is
 * missing and holds its lock until the rotation commits.
 */
export async function lockRefreshFamilyForRotation(
  tx: DatabaseAdapter,
  tokenHash: string,
): Promise<RotationFamilyLock | null> {
  const rows = await tx.query<{ family_id: string; revoked_at: string | null }>(
    `insert into public.device_refresh_token_families (family_id, user_id)
     select family_id, user_id from device_refresh_tokens where token_hash = $1
     on conflict (family_id) do update
        set user_id = device_refresh_token_families.user_id
     returning family_id, revoked_at`,
    [tokenHash],
  );
  const family = rows[0];
  return family ? { familyId: family.family_id, revoked: family.revoked_at !== null } : null;
}

export interface FamilyCompromise {
  familyId: string;
  userId: string;
  reason: RefreshFamilyCompromiseReason;
  at: string;
}

/**
 * Ends one credential family and says why. Revoking without the reason leaves a
 * theft and a sign-out indistinguishable, which the compromise columns exist to prevent.
 */
export async function finishFamilyAsCompromised(
  db: DatabaseAdapter,
  input: FamilyCompromise,
): Promise<DeviceCredentialRevocationResult> {
  const scope = [input.familyId, input.userId, input.at];
  const revoked = await endFamiliesThenRevoke(db, FENCE_FAMILY, REVOKE_FAMILY, scope);

  await db.execute(COMPROMISE_FAMILY, [...scope, input.reason]);
  return { revoked, compromiseRecorded: true };
}

/** One device's sign-out: the family its credential belongs to ends for good. */
export async function revokeDeviceRefreshFamily(
  db: DatabaseAdapter,
  input: { familyId: string; userId: string },
): Promise<number> {
  return endFamiliesThenRevoke(db, FENCE_FAMILY, REVOKE_FAMILY, [
    input.familyId,
    input.userId,
    new Date().toISOString(),
  ]);
}

/** Every family the account holds, ended for good; nothing else is touched. */
export async function revokeEveryDeviceRefreshFamily(
  db: DatabaseAdapter,
  userId: string,
): Promise<number> {
  return endFamiliesThenRevoke(db, FENCE_EVERY, REVOKE_EVERY, [userId]);
}

/** The families a workspace issued to one member; personal ones are left alone. */
export async function revokeWorkspaceDeviceRefreshFamilies(
  db: DatabaseAdapter,
  input: { userId: string; organizationId: string },
): Promise<number> {
  return endFamiliesThenRevoke(db, FENCE_WORKSPACE, REVOKE_WORKSPACE, [
    input.userId,
    input.organizationId,
  ]);
}

const REVOKE_APPROVED_DEVICE_CODES = `
  update public.device_authorization_codes
     set status = 'revoked', revoked_at = now(), updated_at = now()
   where user_id = $1
     and status = 'approved'`;

const DELETE_UNCONSUMED_DESKTOP_GRANTS = `
  delete from public.desktop_sign_in_grants
   where user_id = $1
     and consumed_at is null`;

/**
 * Every device credential the account holds, for the acts that end every
 * session: signing out everywhere, and containing a compromise. A provider
 * session sweep leaves these alive, and a live refresh row mints a new one.
 * An approved device code or a pending desktop sign-in grant is a credential
 * not yet redeemed; left alone, either mints a fresh family after the sweep.
 */
export async function revokeEveryDeviceRefreshCredential(
  db: DatabaseAdapter,
  userId: string,
): Promise<number> {
  await revokeMobileIntentTokens(db, userId, null);
  await db.execute(REVOKE_APPROVED_DEVICE_CODES, [userId]);
  await db.execute(DELETE_UNCONSUMED_DESKTOP_GRANTS, [userId]);
  return revokeEveryDeviceRefreshFamily(db, userId);
}

/**
 * Forced reauthentication needs no push: a developer token is honoured only
 * while its family has a live row and is not ended, so it dies on the device's
 * next request.
 */
export async function revokeDeviceRefreshCredentials(
  db: DatabaseAdapter,
  input: DeviceCredentialRevocation,
): Promise<DeviceCredentialRevocationResult> {
  const params = [input.deviceId, input.userId, input.credentialFamilyId];
  const revoked = await endFamiliesThenRevoke(db, FENCE_DEVICE, REVOKE, params);

  if (!input.compromisedAs) {
    return { revoked, compromiseRecorded: false };
  }

  await db.execute(COMPROMISE, [...params, input.compromisedAs]);
  return { revoked, compromiseRecorded: true };
}

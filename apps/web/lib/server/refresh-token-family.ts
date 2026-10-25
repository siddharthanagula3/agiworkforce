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
  const revoked = await db.query<{ id: string }>(REVOKE_FAMILY, scope);

  await db.execute(COMPROMISE_FAMILY, [...scope, input.reason]);
  return { revoked: revoked.length, compromiseRecorded: true };
}

const REVOKE_EVERY = `
  update device_refresh_tokens
     set revoked_at = coalesce(revoked_at, now())
   where user_id = $1
     and revoked_at is null
   returning id`;

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
  const revoked = await db.query<{ id: string }>(REVOKE_EVERY, [userId]);
  return revoked.length;
}

/**
 * Forced reauthentication needs no push: a developer token is honoured only
 * while its family has a live row, so it dies on the device's next request.
 */
export async function revokeDeviceRefreshCredentials(
  db: DatabaseAdapter,
  input: DeviceCredentialRevocation,
): Promise<DeviceCredentialRevocationResult> {
  const params = [input.deviceId, input.userId, input.credentialFamilyId];
  const revoked = await db.query<{ id: string }>(REVOKE, params);

  if (!input.compromisedAs) {
    return { revoked: revoked.length, compromiseRecorded: false };
  }

  await db.execute(COMPROMISE, [...params, input.compromisedAs]);
  return { revoked: revoked.length, compromiseRecorded: true };
}

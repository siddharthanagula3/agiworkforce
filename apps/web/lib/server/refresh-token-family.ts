import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const PG_UNDEFINED_COLUMN = '42703';

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

function isCompromiseColumnMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  if (record['code'] === PG_UNDEFINED_COLUMN) return true;
  const message = String(record['message'] ?? '');
  return /compromised_at|compromised_reason/.test(message) && /does not exist/.test(message);
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

  try {
    await db.execute(COMPROMISE, [...params, input.compromisedAs]);
    return { revoked: revoked.length, compromiseRecorded: true };
  } catch (error) {
    // 0233 not applied yet: the family is still revoked, only the record of
    // why is missing, and that must not fail a revocation the user asked for.
    if (isCompromiseColumnMissing(error)) {
      return { revoked: revoked.length, compromiseRecorded: false };
    }
    throw error;
  }
}

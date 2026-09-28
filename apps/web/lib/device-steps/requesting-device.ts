import 'server-only';

import type { NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { isRegistryMissing } from '@/app/api/settings/devices/schema-state';
import { resolveDeviceCredentialLink } from '@/lib/server/device-credential-link';

const BY_CREDENTIAL_LINK = `
  select id::text as device_id, name
    from device_registrations
   where user_id = $1
     and (identity_session_id = $2 or credential_family_id = $3)
   order by last_seen_at desc
   limit 1`;

export interface RequestingDevice {
  id: string;
  name: string | null;
}

export async function readRequestingDevice(
  db: DatabaseAdapter,
  request: NextRequest,
  userId: string,
): Promise<RequestingDevice | null> {
  const link = await resolveDeviceCredentialLink(request, userId);
  if (!link.identitySessionId && !link.credentialFamilyId) return null;
  try {
    const rows = await db.query<{ device_id: string; name: string | null }>(BY_CREDENTIAL_LINK, [
      userId,
      link.identitySessionId,
      link.credentialFamilyId,
    ]);
    const row = rows[0];
    return row ? { id: row.device_id, name: row.name } : null;
  } catch (error) {
    if (isRegistryMissing(error)) return null;
    throw error;
  }
}

export async function readRequestingDeviceId(
  db: DatabaseAdapter,
  request: NextRequest,
  userId: string,
): Promise<string | null> {
  return (await readRequestingDevice(db, request, userId))?.id ?? null;
}

import 'server-only';

import type { NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { isRegistryMissing } from '@/app/api/settings/devices/schema-state';
import { resolveDeviceCredentialLink } from '@/lib/server/device-credential-link';

const BY_CREDENTIAL_LINK = `
  select id::text as device_id
    from device_registrations
   where user_id = $1
     and (identity_session_id = $2 or credential_family_id = $3)
   order by last_seen_at desc
   limit 1`;

export async function readRequestingDeviceId(
  db: DatabaseAdapter,
  request: NextRequest,
  userId: string,
): Promise<string | null> {
  const link = await resolveDeviceCredentialLink(request, userId);
  if (!link.identitySessionId && !link.credentialFamilyId) return null;
  try {
    const rows = await db.query<{ device_id: string }>(BY_CREDENTIAL_LINK, [
      userId,
      link.identitySessionId,
      link.credentialFamilyId,
    ]);
    return rows[0]?.device_id ?? null;
  } catch (error) {
    if (isRegistryMissing(error)) return null;
    throw error;
  }
}

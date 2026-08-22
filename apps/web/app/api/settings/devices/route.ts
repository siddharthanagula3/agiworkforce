import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { resolveSessionsPrincipal } from '../sessions/session-principal';
import { getNeonDb } from '@/lib/server/neon-db';
import { isCredentialLinkMissing } from './schema-state';

const MAX_DEVICES = 200;

interface DeviceRow {
  device_id: string;
  kind: 'desktop' | 'mobile';
  name: string | null;
  platform: string | null;
  version: string | null;
  last_seen_at: string | null;
  registered_at: string | null;
  live_credentials: number;
}

const REGISTRATIONS = `
  select d.id::text as device_id, 'desktop' as kind, d.name, d.platform, d.version,
         d.last_seen_at, d.registered_at, %LIVE_DESKTOP% as live_credentials
    from desktop_devices d %JOIN_DESKTOP%
   where d.user_id = $1
   union all
  select m.id::text as device_id, 'mobile' as kind, m.name, m.platform, null as version,
         null as last_seen_at, m.created_at as registered_at, %LIVE_MOBILE% as live_credentials
    from mobile_devices m %JOIN_MOBILE%
   where m.user_id = $1
   order by registered_at desc nulls last
   limit ${MAX_DEVICES}`;

// live_credentials counts unspent, unrevoked, unexpired refresh rows whose
// family belongs to this device. It is what makes the row honest: a device
// registration outlives its credential, so "linked" and "still signed in" are
// different questions and the UI has to be able to tell them apart.
const WITH_CREDENTIALS = `with live as (
    select device_id, count(*)::int as live_credentials
      from device_refresh_tokens
     where user_id = $1
       and device_id is not null
       and revoked_at is null
       and used_at is null
       and expires_at > now()
     group by device_id
  )${REGISTRATIONS}`
  .replace('%LIVE_DESKTOP%', 'coalesce(l.live_credentials, 0)')
  .replace('%LIVE_MOBILE%', 'coalesce(l.live_credentials, 0)')
  .replace('%JOIN_DESKTOP%', 'left join live l on l.device_id = d.id::text')
  .replace('%JOIN_MOBILE%', 'left join live l on l.device_id = m.id::text');

// Migration 0133 adds device_refresh_tokens.device_id. Until it is applied the
// registrations still exist and are still worth listing and unlinking, so a
// pending migration degrades one column rather than failing the whole panel.
const WITHOUT_CREDENTIALS = REGISTRATIONS.replace(/%LIVE_(DESKTOP|MOBILE)%/g, '0').replace(
  /%JOIN_(DESKTOP|MOBILE)%/g,
  '',
);

async function handleList(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-sessions-list');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await resolveSessionsPrincipal(request);
  const db = getNeonDb();

  let rows: DeviceRow[];
  let credentialStateKnown = true;
  try {
    rows = await db.query<DeviceRow>(WITH_CREDENTIALS, [userId]);
  } catch (error) {
    if (!isCredentialLinkMissing(error)) throw error;
    credentialStateKnown = false;
    rows = await db.query<DeviceRow>(WITHOUT_CREDENTIALS, [userId]);
  }

  return NextResponse.json({
    devices: rows.map((row) => ({
      id: row.device_id,
      kind: row.kind,
      name: row.name,
      platform: row.platform,
      version: row.version,
      lastSeenAt: row.last_seen_at,
      registeredAt: row.registered_at,
      hasLiveCredential: credentialStateKnown ? row.live_credentials > 0 : null,
    })),
    totalCount: rows.length,
    credentialStateKnown,
  });
}

export const GET = withErrorHandler(handleList);

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

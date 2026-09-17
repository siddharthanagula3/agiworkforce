import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  devicePresence,
  type DeviceCapabilities,
  type DevicePresence,
  type DeviceSurface,
} from '@agiworkforce/cloud-contracts';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { resolveSessionsPrincipal } from '../sessions/session-principal';
import { isCredentialLinkMissing, isRegistryMissing } from './schema-state';

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

interface RegistrationRow {
  device_id: string;
  surface: DeviceSurface;
  name: string | null;
  os: string;
  os_version: string | null;
  architecture: string | null;
  app_version: string | null;
  shell: string | null;
  organization_id: string | null;
  browser_available: boolean;
  computer_use_available: boolean;
  local_models_available: boolean;
  local_mcp_available: boolean;
  remote_enabled: boolean;
  last_seen_at: string;
  created_at: string;
  live_credential: boolean | null;
}

export interface ListedDevice {
  id: string;
  kind: DeviceSurface;
  name: string | null;
  platform: string | null;
  version: string | null;
  lastSeenAt: string | null;
  registeredAt: string | null;
  hasLiveCredential: boolean | null;
  osVersion: string | null;
  architecture: string | null;
  shell: string | null;
  workspaceId: string | null;
  presence: DevicePresence | null;
  capabilities: DeviceCapabilities | null;
}

const REGISTRY = `
  select r.id::text as device_id, r.surface, r.name, r.os, r.os_version, r.architecture,
         r.app_version, r.shell, r.organization_id::text as organization_id,
         r.browser_available, r.computer_use_available, r.local_models_available,
         r.local_mcp_available, r.remote_enabled, r.last_seen_at, r.created_at,
         case
           when r.credential_family_id is null then null
           else exists (
             select 1 from device_refresh_tokens t
              where t.user_id = r.user_id
                and t.family_id = r.credential_family_id
                and t.revoked_at is null
                and t.used_at is null
                and t.expires_at > now()
           )
         end as live_credential
    from device_registrations r
   where r.user_id = $1
   order by r.last_seen_at desc
   limit ${MAX_DEVICES}`;

async function readRegistry(
  db: Awaited<ReturnType<typeof resolveSessionsPrincipal>>['db'],
  userId: string,
): Promise<RegistrationRow[]> {
  try {
    return await db.query<RegistrationRow>(REGISTRY, [userId]);
  } catch (error) {
    if (isRegistryMissing(error)) return [];
    throw error;
  }
}

function fromRegistration(row: RegistrationRow, now: number): ListedDevice {
  return {
    id: row.device_id,
    kind: row.surface,
    name: row.name,
    platform: row.os,
    version: row.app_version,
    lastSeenAt: row.last_seen_at,
    registeredAt: row.created_at,
    hasLiveCredential: row.live_credential,
    osVersion: row.os_version,
    architecture: row.architecture,
    shell: row.shell,
    workspaceId: row.organization_id,
    presence: devicePresence(row.last_seen_at, now),
    capabilities: {
      browser: row.browser_available,
      computerUse: row.computer_use_available,
      localModels: row.local_models_available,
      localMcp: row.local_mcp_available,
      remoteControl: row.remote_enabled,
    },
  };
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

  const { db, userId } = await resolveSessionsPrincipal(request);

  let rows: DeviceRow[];
  let credentialStateKnown = true;
  try {
    rows = await db.query<DeviceRow>(WITH_CREDENTIALS, [userId]);
  } catch (error) {
    if (!isCredentialLinkMissing(error)) throw error;
    credentialStateKnown = false;
    rows = await db.query<DeviceRow>(WITHOUT_CREDENTIALS, [userId]);
  }

  const now = Date.now();
  const registry = await readRegistry(db, userId);
  const devices: ListedDevice[] = [
    ...registry.map((row) => fromRegistration(row, now)),
    ...rows.map((row) => ({
      id: row.device_id,
      kind: row.kind,
      name: row.name,
      platform: row.platform,
      version: row.version,
      lastSeenAt: row.last_seen_at,
      registeredAt: row.registered_at,
      hasLiveCredential: credentialStateKnown ? row.live_credentials > 0 : null,
      osVersion: null,
      architecture: null,
      shell: null,
      workspaceId: null,
      presence: row.last_seen_at ? devicePresence(row.last_seen_at, now) : null,
      capabilities: null,
    })),
  ].slice(0, MAX_DEVICES);

  return NextResponse.json({
    devices,
    totalCount: devices.length,
    credentialStateKnown,
  });
}

export const GET = withErrorHandler(handleList);

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

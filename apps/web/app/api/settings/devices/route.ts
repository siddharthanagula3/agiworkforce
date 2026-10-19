import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  devicePresence,
  type DeviceCapabilities,
  type DevicePresence,
  DEVICE_SURFACES,
  type DeviceSurface,
} from '@agiworkforce/cloud-contracts';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { resolveSessionsPrincipal } from '../sessions/session-principal';

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
                and t.family_id::text = r.credential_family_id
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
  return db.query<RegistrationRow>(REGISTRY, [userId]);
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
    presence: devicePresence(row.last_seen_at, now, row.surface),
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

/**
 * A device-code sign-in (CLI, VS Code) holds a refresh family from the moment it
 * is redeemed, whether or not the client ever registers or heartbeats. Listing
 * only registrations left such a credential live and out of the user's reach.
 */
const SIGN_IN_GRANTS = `
  select t.device_id, coalesce(c.device_type, 'cli') as kind, t.device_name as name,
         min(t.created_at) as registered_at, max(t.created_at) as last_seen_at
    from device_refresh_tokens t
    left join device_authorization_codes c on c.device_id = t.device_id
   where t.user_id = $1
     and t.device_id is not null
     and t.revoked_at is null
     and t.used_at is null
     and t.expires_at > now()
     and not exists (
       select 1 from device_registrations r
        where r.user_id = $1
          and (r.id::text = t.device_id or r.credential_family_id = t.family_id::text)
     )
     and not exists (select 1 from desktop_devices d where d.user_id = $1 and d.id::text = t.device_id)
     and not exists (select 1 from mobile_devices m where m.user_id = $1 and m.id::text = t.device_id)
   group by t.device_id, c.device_type, t.device_name
   order by max(t.created_at) desc
   limit ${MAX_DEVICES}`;

interface SignInGrantRow {
  device_id: string;
  kind: string;
  name: string | null;
  registered_at: string;
  last_seen_at: string;
}

function grantKind(kind: string): DeviceSurface {
  return (DEVICE_SURFACES as readonly string[]).includes(kind) ? (kind as DeviceSurface) : 'cli';
}

async function handleList(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-sessions-list');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await resolveSessionsPrincipal(request);

  const rows = await db.query<DeviceRow>(WITH_CREDENTIALS, [userId]);

  const now = Date.now();
  const registry = await readRegistry(db, userId);
  const grants = await db.query<SignInGrantRow>(SIGN_IN_GRANTS, [userId]);
  const devices: ListedDevice[] = [
    ...registry.map((row) => fromRegistration(row, now)),
    ...grants.map((row) => ({
      id: row.device_id,
      kind: grantKind(row.kind),
      name: row.name,
      platform: null,
      version: null,
      lastSeenAt: row.last_seen_at,
      registeredAt: row.registered_at,
      hasLiveCredential: true,
      osVersion: null,
      architecture: null,
      shell: null,
      workspaceId: null,
      presence: null,
      capabilities: null,
    })),
    ...rows.map((row) => ({
      id: row.device_id,
      kind: row.kind,
      name: row.name,
      platform: row.platform,
      version: row.version,
      lastSeenAt: row.last_seen_at,
      registeredAt: row.registered_at,
      hasLiveCredential: row.live_credentials > 0,
      osVersion: null,
      architecture: null,
      shell: null,
      workspaceId: null,
      presence: row.last_seen_at ? devicePresence(row.last_seen_at, now, row.kind) : null,
      capabilities: null,
    })),
  ].slice(0, MAX_DEVICES);

  return NextResponse.json({
    devices,
    totalCount: devices.length,
  });
}

export const GET = withErrorHandler(handleList);

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

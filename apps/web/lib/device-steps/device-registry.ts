import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  DEVICE_HEARTBEAT_INTERVAL_MS,
  devicePresence,
  type DeviceCapabilities,
  type DevicePresence,
  type DeviceSurface,
} from '@agiworkforce/cloud-contracts';
import {
  deviceStepCapability,
  offeredDeviceStepTools,
  type DesktopHostDeclaration,
  type DeviceStepTool,
} from '@agiworkforce/local-runtime-contract';
import { isRegistryMissing } from '@/app/api/settings/devices/schema-state';

/**
 * What the device registry says about the machine a step would be sent to.
 *
 * The declaration a client sends names a device; only the registry can say
 * whether that device is this account's, awake, still holding a live
 * credential, and still willing to accept remote work.
 */

export interface RegisteredDevice {
  id: string;
  surface: DeviceSurface;
  name: string | null;
  lastSeenAt: string;
  presence: DevicePresence;
  remoteEnabled: boolean;
  capabilities: DeviceCapabilities;
  authenticated: boolean;
}

interface RegistrationRow {
  device_id: string;
  surface: DeviceSurface;
  name: string | null;
  last_seen_at: string;
  remote_enabled: boolean;
  browser_available: boolean;
  computer_use_available: boolean;
  local_models_available: boolean;
  local_mcp_available: boolean;
  credential_family_id: string | null;
  identity_session_id: string | null;
  live_credential: boolean | null;
}

const BY_INSTALL = `
  select r.id::text as device_id, r.surface, r.name, r.last_seen_at, r.remote_enabled,
         r.browser_available, r.computer_use_available, r.local_models_available,
         r.local_mcp_available, r.credential_family_id, r.identity_session_id,
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
     and r.surface = $2
     and r.install_id = $3
   limit 1`;

// A device with no recorded credential family and no identity session never
// proved which sign-in it is holding, so it is not an authenticated device.
function isAuthenticated(row: RegistrationRow): boolean {
  if (row.credential_family_id !== null) return row.live_credential === true;
  return row.identity_session_id !== null;
}

export async function readRegisteredDevice(
  db: DatabaseAdapter,
  params: { userId: string; surface: DeviceSurface; installId: string; now?: number },
): Promise<RegisteredDevice | null> {
  let rows: RegistrationRow[];
  try {
    rows = await db.query<RegistrationRow>(BY_INSTALL, [
      params.userId,
      params.surface,
      params.installId,
    ]);
  } catch (error) {
    if (isRegistryMissing(error)) return null;
    throw error;
  }
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.device_id,
    surface: row.surface,
    name: row.name,
    lastSeenAt: row.last_seen_at,
    presence: devicePresence(row.last_seen_at, params.now ?? Date.now()),
    remoteEnabled: row.remote_enabled,
    capabilities: {
      browser: row.browser_available,
      computerUse: row.computer_use_available,
      localModels: row.local_models_available,
      localMcp: row.local_mcp_available,
      remoteControl: row.remote_enabled,
    },
    authenticated: isAuthenticated(row),
  };
}

export type DeviceStepClearance =
  | { decision: 'ready'; deviceId: string }
  | { decision: 'wait'; reason: string; retryInMs: number; presence: DevicePresence }
  | { decision: 'withdrawn'; reason: string };

export const DEVICE_PRESENCE_RETRY_MS = DEVICE_HEARTBEAT_INTERVAL_MS;

function requiresComputerUse(tools: readonly DeviceStepTool[]): boolean {
  return tools.some((tool) => deviceStepCapability(tool) === 'computer.use');
}

/**
 * Whether a durable run may hand work to this device right now.
 *
 * `withdrawn` is for a device this account can no longer prove it owns or that
 * has switched remote work off; `wait` is for one that is merely asleep, which
 * is a pause, never a failure.
 */
export function clearDeviceForRemoteSteps(
  declaration: DesktopHostDeclaration,
  device: RegisteredDevice | null,
): DeviceStepClearance {
  if (!device) {
    return {
      decision: 'withdrawn',
      reason: `"${declaration.deviceName}" is not a device registered to this account, so no step was sent to it.`,
    };
  }
  if (!device.authenticated) {
    return {
      decision: 'withdrawn',
      reason: `The credential "${declaration.deviceName}" registered with has been revoked, so no step was sent to it.`,
    };
  }
  if (!device.remoteEnabled) {
    return {
      decision: 'withdrawn',
      reason: `"${declaration.deviceName}" has remote work switched off, so no step was sent to it.`,
    };
  }
  if (
    requiresComputerUse(offeredDeviceStepTools(declaration)) &&
    !device.capabilities.computerUse
  ) {
    return {
      decision: 'withdrawn',
      reason: `"${declaration.deviceName}" no longer reports screen control, so no step was sent to it.`,
    };
  }
  if (device.presence !== 'online') {
    return {
      decision: 'wait',
      reason: `"${declaration.deviceName}" is ${device.presence}; the run waits for it to report in.`,
      retryInMs: DEVICE_PRESENCE_RETRY_MS,
      presence: device.presence,
    };
  }
  return { decision: 'ready', deviceId: device.id };
}

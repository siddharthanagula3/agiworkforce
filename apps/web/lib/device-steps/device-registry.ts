import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  DEVICE_HEARTBEAT_INTERVAL_MS,
  advertisedDeviceCapability,
  devicePresence,
  type DeviceCapabilities,
  type DevicePresence,
  type DeviceSurface,
} from '@agiworkforce/cloud-contracts';
import {
  deviceStepCapability,
  offeredDeviceStepTools,
  type DesktopCapability,
  type DesktopHostDeclaration,
} from '@agiworkforce/local-runtime-contract';
import type { PlatformCapability } from '@agiworkforce/types';
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

// The surface is optional because an install id identifies one install on its
// own: a step may be handed to whichever surface registered it, not only the
// desktop shell that happens to declare itself in a chat request header.
const BY_INSTALL = `
  select r.id::text as device_id, r.surface, r.name, r.last_seen_at, r.remote_enabled,
         r.browser_available, r.computer_use_available, r.local_models_available,
         r.local_mcp_available, r.credential_family_id, r.identity_session_id,
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
     and ($2::text is null or r.surface = $2)
     and r.install_id = $3
   order by r.last_seen_at desc
   limit 1`;

// A device with no recorded credential family and no identity session never
// proved which sign-in it is holding, so it is not an authenticated device.
function isAuthenticated(row: RegistrationRow): boolean {
  if (row.credential_family_id !== null) return row.live_credential === true;
  return row.identity_session_id !== null;
}

export async function readRegisteredDevice(
  db: DatabaseAdapter,
  params: { userId: string; surface?: DeviceSurface | null; installId: string; now?: number },
): Promise<RegisteredDevice | null> {
  let rows: RegistrationRow[];
  try {
    rows = await db.query<RegistrationRow>(BY_INSTALL, [
      params.userId,
      params.surface ?? null,
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

/**
 * Stops remote work on one device now, without unlinking it.
 *
 * Unlinking is the other control and it is a bigger one: it ends the
 * credential, so the device has to be paired again. This leaves the device
 * signed in and merely withdrawn from remote work, which every durable run
 * re-reads before each invocation, so a run already in flight loses the
 * device's tools at its next step rather than finishing the work.
 */
export async function stopRemoteWorkOnDevice(
  db: DatabaseAdapter,
  params: { userId: string; deviceId: string },
): Promise<boolean> {
  try {
    const affected = await db.execute(
      `update device_registrations
          set remote_enabled = false, updated_at = now()
        where id = $1 and user_id = $2 and remote_enabled`,
      [params.deviceId, params.userId],
    );
    return affected > 0;
  } catch (error) {
    if (isRegistryMissing(error)) return false;
    throw error;
  }
}

export const DEVICE_REVOCATION_REASONS = ['unlinked', 'lost', 'remote_work_stopped'] as const;

export type DeviceRevocationReason = (typeof DEVICE_REVOCATION_REASONS)[number];

export interface DeviceRevocation {
  readonly userId: string;
  readonly deviceId: string;
  readonly reason: DeviceRevocationReason;
  readonly revokedAtMs: number;
}

export interface DeviceRevocationDelivery {
  readonly remoteWorkStopped: boolean;
  readonly liveSessionsDropped: number | null;
  readonly signalingReachable: boolean;
}

const SIGNALING_TIMEOUT_MS = 5_000;

/**
 * Carries a revocation to everywhere the device could still be reached from.
 *
 * The registry flip is what every durable run re-reads, so it is done first and
 * is never conditional on the relay: a signaling server that is down delays the
 * socket close, it does not leave the device cleared for the next step.
 */
export async function propagateDeviceRevocation(
  db: DatabaseAdapter,
  revocation: DeviceRevocation,
): Promise<DeviceRevocationDelivery> {
  const remoteWorkStopped = await stopRemoteWorkOnDevice(db, {
    userId: revocation.userId,
    deviceId: revocation.deviceId,
  });

  const url = process.env['SIGNALING_HTTP_URL'];
  const secret = process.env['SIGNALING_INTERNAL_SECRET'];
  if (!url || !secret) {
    return { remoteWorkStopped, liveSessionsDropped: null, signalingReachable: false };
  }

  try {
    const response = await fetch(
      `${url.replace(/\/+$/, '')}/devices/${encodeURIComponent(revocation.deviceId)}/revoke`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ reason: revocation.reason, revokedAtMs: revocation.revokedAtMs }),
        signal: AbortSignal.timeout(SIGNALING_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      return { remoteWorkStopped, liveSessionsDropped: null, signalingReachable: false };
    }
    const payload: unknown = await response.json().catch(() => null);
    const closed = (payload as { closed?: unknown } | null)?.closed;
    return {
      remoteWorkStopped,
      liveSessionsDropped: typeof closed === 'number' ? closed : null,
      signalingReachable: true,
    };
  } catch {
    return { remoteWorkStopped, liveSessionsDropped: null, signalingReachable: false };
  }
}

/**
 * Where the answer about one capability came from: the device's own heartbeat,
 * or the surface the request arrived on, which is a guess the registry replaces
 * as soon as the device starts sending the field.
 */
export type DeviceCapabilitySource = 'advertised' | 'inferred';

export type DeviceStepClearance =
  | { decision: 'ready'; deviceId: string; capabilitySource: DeviceCapabilitySource }
  | { decision: 'wait'; reason: string; retryInMs: number; presence: DevicePresence }
  | {
      decision: 'withdrawn';
      reason: string;
      capabilitySource?: DeviceCapabilitySource;
    };

export const DEVICE_PRESENCE_RETRY_MS = DEVICE_HEARTBEAT_INTERVAL_MS;

/** Which advertised capability answers for a step's local-runtime permission. */
export const STEP_CAPABILITY_ADVERTISEMENTS: Readonly<
  Partial<Record<DesktopCapability, PlatformCapability>>
> = Object.freeze({
  'filesystem.read': 'canUseFileSystem',
  'filesystem.write': 'canUseFileSystem',
  'shell.execute': 'canUseTerminal',
  'computer.use': 'canUseDesktopAutomation',
  'screen.capture': 'canTakeScreenshot',
  'clipboard.read': 'canUseClipboard',
  'mcp.local': 'canUseLocalMcp',
  'local.inference': 'canUseLocalModels',
});

const STEP_CAPABILITY_LABELS: Readonly<Partial<Record<DesktopCapability, string>>> = Object.freeze({
  'filesystem.read': 'access to its files',
  'filesystem.write': 'permission to write its files',
  'shell.execute': 'a terminal',
  'computer.use': 'screen control',
  'screen.capture': 'screen capture',
  'clipboard.read': 'access to its clipboard',
  'mcp.local': 'its local tool servers',
  'local.inference': 'its local models',
});

interface RefusedDeviceCapability {
  capability: DesktopCapability;
  label: string;
}

/**
 * The first offered step the device itself says it will not carry out.
 *
 * The heartbeat wins wherever the device sent the field; where it did not, the
 * declaration the request arrived with stands, which is what offered the step
 * in the first place. Silence is never read as consent.
 */
function refusedCapability(
  declaration: DesktopHostDeclaration,
  capabilities: DeviceCapabilities,
): RefusedDeviceCapability | null {
  for (const tool of offeredDeviceStepTools(declaration)) {
    const capability = deviceStepCapability(tool);
    const platform = STEP_CAPABILITY_ADVERTISEMENTS[capability];
    if (platform === undefined) continue;
    if (advertisedDeviceCapability(capabilities, platform) !== false) continue;
    return { capability, label: STEP_CAPABILITY_LABELS[capability] ?? capability };
  }
  return null;
}

function capabilitySourceFor(
  declaration: DesktopHostDeclaration,
  capabilities: DeviceCapabilities,
): DeviceCapabilitySource {
  const offered = offeredDeviceStepTools(declaration);
  if (offered.length === 0) return 'advertised';
  return offered.every((tool) => {
    const platform = STEP_CAPABILITY_ADVERTISEMENTS[deviceStepCapability(tool)];
    return (
      platform !== undefined && advertisedDeviceCapability(capabilities, platform) !== undefined
    );
  })
    ? 'advertised'
    : 'inferred';
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
  const refused = refusedCapability(declaration, device.capabilities);
  if (refused) {
    return {
      decision: 'withdrawn',
      reason: `"${declaration.deviceName}" no longer reports ${refused.label}, so no step was sent to it.`,
      capabilitySource: 'advertised',
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
  return {
    decision: 'ready',
    deviceId: device.id,
    capabilitySource: capabilitySourceFor(declaration, device.capabilities),
  };
}

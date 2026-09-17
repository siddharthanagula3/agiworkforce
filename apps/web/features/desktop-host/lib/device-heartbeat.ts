'use client';

import {
  DEVICE_HEARTBEAT_PATH,
  DeviceHeartbeatRequestSchema,
  deviceArchitecture,
  deviceOperatingSystem,
  type DeviceHeartbeatRequest,
} from '@agiworkforce/cloud-contracts';
import type { DeviceRegistryProfile, HostBridge } from '@agiworkforce/local-runtime-contract';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { readDeviceHostDeclaration } from './device-steps';
import { readDeviceRegistryProfile } from './runtime-client';

export async function readDesktopProfile(): Promise<DeviceRegistryProfile | null> {
  try {
    return await readDeviceRegistryProfile();
  } catch {
    const declaration = await readDeviceHostDeclaration();
    if (!declaration) return null;
    return {
      installId: declaration.deviceId,
      name: declaration.deviceName,
      platform: declaration.platform,
      osVersion: '',
      architecture: '',
      appVersion: declaration.appVersion,
      capabilities: {
        browser: false,
        computerUse: false,
        localModels: false,
        localMcp: false,
        remoteControl: false,
      },
    };
  }
}

export function buildDesktopHeartbeat(
  host: Pick<HostBridge, 'shell' | 'platform' | 'appVersion'>,
  profile: DeviceRegistryProfile,
): DeviceHeartbeatRequest | null {
  const candidate = {
    surface: 'desktop',
    installId: profile.installId,
    ...(profile.name.trim() ? { name: profile.name.trim().slice(0, 120) } : {}),
    os: deviceOperatingSystem(profile.platform || host.platform),
    ...(profile.osVersion ? { osVersion: profile.osVersion.slice(0, 64) } : {}),
    ...(profile.architecture ? { architecture: deviceArchitecture(profile.architecture) } : {}),
    ...(profile.appVersion || host.appVersion
      ? { appVersion: (profile.appVersion || host.appVersion).slice(0, 64) }
      : {}),
    ...(host.shell ? { shell: host.shell } : {}),
    capabilities: profile.capabilities,
  };
  const parsed = DeviceHeartbeatRequestSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export async function sendDesktopHeartbeat(
  host: Pick<HostBridge, 'shell' | 'platform' | 'appVersion'>,
): Promise<boolean> {
  const profile = await readDesktopProfile();
  if (!profile) return false;
  const heartbeat = buildDesktopHeartbeat(host, profile);
  if (!heartbeat) return false;
  const response = await fetch(DEVICE_HEARTBEAT_PATH, {
    method: 'POST',
    credentials: 'same-origin',
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(heartbeat),
  });
  return response.ok;
}

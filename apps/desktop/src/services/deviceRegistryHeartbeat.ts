import {
  DEVICE_HEARTBEAT_INTERVAL_MS,
  DEVICE_HEARTBEAT_PATH,
  DeviceHeartbeatRequestSchema,
  deviceOperatingSystem,
  type DeviceHeartbeatRequest,
} from '@agiworkforce/cloud-contracts';
import { CLOUD_API_BASE_URL } from '../api/cloudApi';
import { remoteControlSupported } from '../lib/remoteControlSupport';
import { selectHasCloudAccountSession, useAuthStore } from '../stores/auth';
import { createManagedCloudRequestContext } from './managedCloudRequestContext';

const INSTALL_ID_KEY = 'agi.deviceRegistry.installId';

export function desktopPlatform(navigatorPlatform: string): string {
  const value = navigatorPlatform.toLowerCase();
  if (value.startsWith('mac')) return 'macos';
  if (value.startsWith('win')) return 'windows';
  if (value.includes('linux')) return 'linux';
  return 'other';
}

export function buildTauriHeartbeat(input: {
  installId: string;
  navigatorPlatform: string;
  appVersion: string | null;
  remoteControl: boolean;
}): DeviceHeartbeatRequest | null {
  const candidate = {
    surface: 'desktop',
    installId: input.installId,
    os: deviceOperatingSystem(desktopPlatform(input.navigatorPlatform)),
    ...(input.appVersion ? { appVersion: input.appVersion.slice(0, 64) } : {}),
    shell: 'tauri',
    capabilities: {
      browser: false,
      computerUse: true,
      localModels: true,
      localMcp: true,
      remoteControl: input.remoteControl,
    },
  };
  const parsed = DeviceHeartbeatRequestSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function desktopInstallId(): string | null {
  try {
    const stored = window.localStorage.getItem(INSTALL_ID_KEY);
    if (stored) return stored;
    const created = crypto.randomUUID();
    window.localStorage.setItem(INSTALL_ID_KEY, created);
    return created;
  } catch {
    return null;
  }
}

async function appVersion(): Promise<string | null> {
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    return await getVersion();
  } catch {
    return null;
  }
}

export async function sendTauriHeartbeat(): Promise<boolean> {
  if (!selectHasCloudAccountSession(useAuthStore.getState())) return false;
  const id = desktopInstallId();
  if (!id) return false;
  const heartbeat = buildTauriHeartbeat({
    installId: id,
    navigatorPlatform: navigator.platform,
    appVersion: await appVersion(),
    remoteControl: remoteControlSupported(),
  });
  if (!heartbeat) return false;
  const request = createManagedCloudRequestContext('Device registry heartbeat');
  const response = await request.fetch(`${CLOUD_API_BASE_URL}${DEVICE_HEARTBEAT_PATH}`, {
    method: 'POST',
    headers: await request.getHeaders(),
    body: JSON.stringify(heartbeat),
  });
  return response.ok;
}

export function initializeDeviceRegistryHeartbeat(): () => void {
  const beat = () => void sendTauriHeartbeat().catch(() => false);
  beat();
  const timer = setInterval(beat, DEVICE_HEARTBEAT_INTERVAL_MS);
  return () => clearInterval(timer);
}

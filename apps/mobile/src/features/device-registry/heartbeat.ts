import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  DEVICE_HEARTBEAT_PATH,
  DeviceHeartbeatRequestSchema,
  deviceOperatingSystem,
  type DeviceHeartbeatRequest,
} from '@agiworkforce/cloud-contracts';
import { getDeviceId } from '@/lib/deviceId';
import { api } from '@/services/api';

export function buildMobileHeartbeat(input: {
  installId: string;
  platform: string;
  osVersion: string | number | null;
  appVersion: string | null;
  deviceName: string | null;
}): DeviceHeartbeatRequest | null {
  const candidate = {
    surface: 'mobile',
    installId: input.installId,
    ...(input.deviceName?.trim() ? { name: input.deviceName.trim().slice(0, 120) } : {}),
    os: deviceOperatingSystem(input.platform),
    ...(input.osVersion !== null && String(input.osVersion).trim()
      ? { osVersion: String(input.osVersion).slice(0, 64) }
      : {}),
    ...(input.appVersion ? { appVersion: input.appVersion.slice(0, 64) } : {}),
    capabilities: {
      browser: false,
      computerUse: false,
      localModels: false,
      localMcp: false,
      remoteControl: false,
    },
  };
  const parsed = DeviceHeartbeatRequestSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export async function sendMobileHeartbeat(): Promise<boolean> {
  const heartbeat = buildMobileHeartbeat({
    installId: await getDeviceId(),
    platform: Platform.OS,
    osVersion: Platform.Version ?? null,
    appVersion: Constants.expoConfig?.version ?? null,
    deviceName: Constants.deviceName ?? null,
  });
  if (!heartbeat) return false;
  await api.post(DEVICE_HEARTBEAT_PATH, heartbeat);
  return true;
}

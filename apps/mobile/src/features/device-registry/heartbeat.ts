import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  DEVICE_HEARTBEAT_INTERVAL_MS,
  DEVICE_HEARTBEAT_PATH,
  DeviceHeartbeatRequestSchema,
  deviceOperatingSystem,
  devicePresence,
  type DeviceHeartbeatRequest,
  type DevicePresence,
} from '@agiworkforce/cloud-contracts';
import { getDeviceId } from '@/lib/deviceId';
import { api } from '@/services/api';

/** First retry after a failed beat. Doubles per consecutive failure. */
export const HEARTBEAT_RETRY_BASE_MS = 2_000;

export const DEVICE_STATUS_IS_STALE =
  'This device has not checked in recently enough to be driven. Open the app on it, then try again.';

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

export interface DeviceStatusMetrics {
  readonly sent: number;
  readonly failed: number;
  readonly consecutiveFailures: number;
  readonly lastSuccessAtMs: number | null;
  readonly lastFailureAtMs: number | null;
}

const metrics = {
  sent: 0,
  failed: 0,
  consecutiveFailures: 0,
  lastSuccessAtMs: null as number | null,
  lastFailureAtMs: null as number | null,
};

export function deviceStatusMetrics(): DeviceStatusMetrics {
  return { ...metrics };
}

export function resetDeviceStatusMetrics(): void {
  metrics.sent = 0;
  metrics.failed = 0;
  metrics.consecutiveFailures = 0;
  metrics.lastSuccessAtMs = null;
  metrics.lastFailureAtMs = null;
}

export function recordHeartbeatResult(delivered: boolean, atMs: number = Date.now()): void {
  metrics.sent += 1;
  if (delivered) {
    metrics.consecutiveFailures = 0;
    metrics.lastSuccessAtMs = atMs;
    return;
  }
  metrics.failed += 1;
  metrics.consecutiveFailures += 1;
  metrics.lastFailureAtMs = atMs;
}

/**
 * How long to wait before beating again after a failure: doubling, capped at
 * the ordinary interval so a long relay outage settles into the normal rhythm
 * rather than backing off to never.
 */
export function heartbeatRetryDelayMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return DEVICE_HEARTBEAT_INTERVAL_MS;
  const delay = HEARTBEAT_RETRY_BASE_MS * 2 ** (consecutiveFailures - 1);
  return Math.min(delay, DEVICE_HEARTBEAT_INTERVAL_MS);
}

/**
 * What this device may honestly claim about itself. It is derived from the last
 * beat the server accepted, never from the last one attempted, so a phone that
 * has been failing to reach the relay goes stale instead of reporting online.
 */
export function localDeviceStatus(now: number = Date.now()): DevicePresence {
  return devicePresence(
    metrics.lastSuccessAtMs === null ? null : new Date(metrics.lastSuccessAtMs).toISOString(),
    now,
  );
}

/** Remote control refuses on anything but a device that is currently online. */
export function assertDeviceActionable(presence: DevicePresence): void {
  if (presence !== 'online') throw new Error(DEVICE_STATUS_IS_STALE);
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
  try {
    await api.post(DEVICE_HEARTBEAT_PATH, heartbeat);
  } catch (error) {
    recordHeartbeatResult(false);
    throw error;
  }
  recordHeartbeatResult(true);
  return true;
}

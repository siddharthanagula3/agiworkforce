import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { DEVICE_HEARTBEAT_INTERVAL_MS } from '@agiworkforce/cloud-contracts';
import { DEVICE_HOST_HEADER, type PhoneCapability } from '@agiworkforce/types';
import { getDeviceId } from '@/lib/deviceId';
import { localDeviceStatus, sendMobileHeartbeat } from '@/src/features/device-registry/heartbeat';

export const PHONE_PRESENCE_WAIT_MS = 3_000;

// The server reads this phone's presence when the run starts, after the request
// has travelled; a beat about to leave the online window would make the run wait
// for the very phone that sent it.
const PRESENCE_HEADROOM_MS = DEVICE_HEARTBEAT_INTERVAL_MS;

function phoneCapabilities(): PhoneCapability[] {
  if (Platform.OS === 'ios') return ['calendar.read', 'calendar.write', 'reminders.write'];
  if (Platform.OS === 'android') return ['calendar.read', 'calendar.write'];
  return [];
}

function phoneName(): string {
  const named = Constants.deviceName?.trim().slice(0, 120);
  if (named) return named;
  return Platform.OS === 'ios' ? 'iPhone' : 'Android phone';
}

/**
 * A header value is a byte string, and phone names usually carry a curly
 * apostrophe ("Mei’s iPhone"). Every character outside printable ASCII is
 * written as a JSON escape, which the server reads back unchanged.
 */
export function headerSafeJson(value: unknown): string {
  return JSON.stringify(value).replace(
    /[\u007f-\uffff]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

async function phoneReportedIn(signal?: AbortSignal): Promise<boolean> {
  if (localDeviceStatus(Date.now() + PRESENCE_HEADROOM_MS) === 'online') return true;
  if (signal?.aborted) return false;
  let stopWaiting: () => void = () => undefined;
  const givenUp = new Promise<false>((resolve) => {
    stopWaiting = () => resolve(false);
  });
  const timer = setTimeout(stopWaiting, PHONE_PRESENCE_WAIT_MS);
  signal?.addEventListener('abort', stopWaiting, { once: true });
  try {
    return await Promise.race([sendMobileHeartbeat().catch(() => false), givenUp]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stopWaiting);
  }
}

export async function phoneDeviceHostHeaders(
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  const capabilities = phoneCapabilities();
  if (capabilities.length === 0) return {};
  if (!(await phoneReportedIn(signal))) return {};
  const deviceId = await getDeviceId().catch(() => null);
  if (!deviceId) return {};
  return {
    [DEVICE_HOST_HEADER]: headerSafeJson({
      deviceId,
      deviceName: phoneName(),
      platform: Platform.OS,
      appVersion: Constants.expoConfig?.version ?? Platform.OS,
      capabilities,
      roots: [],
    }),
  };
}

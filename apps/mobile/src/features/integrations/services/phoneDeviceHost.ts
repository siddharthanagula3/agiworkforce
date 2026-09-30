import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { DEVICE_HOST_HEADER, type PhoneCapability } from '@agiworkforce/types';
import { getDeviceId } from '@/lib/deviceId';

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

export async function phoneDeviceHostHeaders(): Promise<Record<string, string>> {
  const capabilities = phoneCapabilities();
  if (capabilities.length === 0) return {};
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

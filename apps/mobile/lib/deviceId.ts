/**
 * Persistent device identifier.
 *
 * Generates a UUID v4 on first call and persists it in SecureStore so the same
 * device always reports the same ID across app restarts.
 */
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const DEVICE_ID_KEY = 'agi_device_id';

let cachedDeviceId: string | null = null;

/**
 * Returns a stable, unique device identifier. The ID is generated once and
 * stored in the OS keychain via expo-secure-store.
 */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  const stored = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (stored) {
    cachedDeviceId = stored;
    return stored;
  }

  const newId = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, newId, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  cachedDeviceId = newId;
  return newId;
}

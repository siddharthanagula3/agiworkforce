import * as SecureStore from 'expo-secure-store';
import { storage, whenMmkvReady } from '@/lib/mmkv';
import { AUTH_PROVIDER_IDS, type AuthProviderId } from '@agiworkforce/client-runtime';
import { validateEmail } from '@agiworkforce/utils';

const STORAGE_KEY = 'agi_remembered_account_v1';
const INSTALL_MARKER_KEY = 'agi_remembered_account_install_v1';

export const REMEMBERED_EMAIL_METHOD = 'email';

export type RememberedAccountMethod = AuthProviderId | typeof REMEMBERED_EMAIL_METHOD;

export interface RememberedAccount {
  email: string;
  method: RememberedAccountMethod;
}

function isMethod(value: unknown): value is RememberedAccountMethod {
  return (
    value === REMEMBERED_EMAIL_METHOD ||
    (typeof value === 'string' && (AUTH_PROVIDER_IDS as readonly string[]).includes(value))
  );
}

export function parseRememberedAccount(raw: string | null): RememberedAccount | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { email, method } = value as Record<string, unknown>;
    if (typeof email !== 'string' || !validateEmail(email) || !isMethod(method)) return null;
    return { email, method };
  } catch {
    return null;
  }
}

export async function readRememberedAccount(): Promise<RememberedAccount | null> {
  try {
    return parseRememberedAccount(await SecureStore.getItemAsync(STORAGE_KEY));
  } catch (err) {
    console.warn('[rememberedAccount] SecureStore read failed:', err);
    return null;
  }
}

export async function rememberAccount(account: RememberedAccount): Promise<void> {
  const email = account.email.trim();
  if (!validateEmail(email)) return;
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify({ email, method: account.method }), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch (err) {
    console.warn('[rememberedAccount] SecureStore write failed:', err);
  }
}

async function deleteStoredAccount(): Promise<boolean> {
  try {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
    return true;
  } catch (err) {
    console.warn('[rememberedAccount] SecureStore delete failed:', err);
    return false;
  }
}

export async function forgetRememberedAccount(): Promise<void> {
  await deleteStoredAccount();
}

export async function readRememberedAccountForSignIn(): Promise<RememberedAccount | null> {
  await new Promise<void>((resolve) => whenMmkvReady(resolve));
  if (storage.getString(INSTALL_MARKER_KEY) === undefined) {
    if (!(await deleteStoredAccount())) return null;
    storage.set(INSTALL_MARKER_KEY, '1');
  }
  return readRememberedAccount();
}

import { NativeModules, Platform } from 'react-native';
import { storage } from '@/lib/mmkv';
import { api } from '@/services/api';

const APP_TRANSACTION_PATH = '/api/mobile/age-assurance/app-transaction';
const REGISTERED_KEY_PREFIX = 'age-assurance:app-transaction:v1:';

interface AGIAppTransactionModule {
  signedAppTransaction(): Promise<string>;
}

function registeredKey(userId: string): string {
  return `${REGISTERED_KEY_PREFIX}${userId}`;
}

function isRegistered(userId: string): boolean {
  try {
    return Boolean(storage?.getString(registeredKey(userId)));
  } catch {
    return false;
  }
}

/**
 * Links this install's App Store app transaction to the signed-in account once,
 * so the server can act on the account when Apple reports that a parent or
 * guardian withdrew consent. A failure is retried on the next sign-in.
 */
export async function registerAppTransactionForAccount(userId: string): Promise<void> {
  if (Platform.OS !== 'ios' || isRegistered(userId)) return;
  const module = NativeModules.AGIAppTransaction as AGIAppTransactionModule | undefined;
  if (!module?.signedAppTransaction) return;
  try {
    const signedAppTransaction = await module.signedAppTransaction();
    await api.post(APP_TRANSACTION_PATH, { signedAppTransaction });
    storage.set(registeredKey(userId), new Date().toISOString());
  } catch (error) {
    console.warn('[AgeAssurance] App transaction not registered, retrying next sign-in', error);
  }
}

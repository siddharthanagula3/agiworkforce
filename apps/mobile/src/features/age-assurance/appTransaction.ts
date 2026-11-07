import { NativeModules, Platform } from 'react-native';
import type { MobileAppTransactionRegistrationRequest } from '@agiworkforce/types';
import { storage } from '@/lib/mmkv';
import { api } from '@/services/api';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';

const APP_TRANSACTION_PATH = '/api/mobile/age-assurance/app-transaction';
const REGISTERED_KEY_PREFIX = 'age-assurance:app-transaction:v2:';

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
  if (Platform.OS !== 'ios') return;
  const account = captureCloudAccountEpoch();
  if (!account || account.ownerId !== userId || isRegistered(account.ownerId)) return;
  const module = NativeModules.AGIAppTransaction as AGIAppTransactionModule | undefined;
  if (!module?.signedAppTransaction) return;
  try {
    const signedAppTransaction = await module.signedAppTransaction();
    if (!isCloudAccountEpochCurrent(account)) return;
    const body: MobileAppTransactionRegistrationRequest = { signedAppTransaction };
    await api.post(APP_TRANSACTION_PATH, body, { accountEpoch: account });
    if (!isCloudAccountEpochCurrent(account)) return;
    storage.set(registeredKey(account.ownerId), new Date().toISOString());
  } catch (error) {
    if (!isCloudAccountEpochCurrent(account)) return;
    console.warn('[AgeAssurance] App transaction not registered, retrying next sign-in', error);
  }
}

import { Platform } from 'react-native';
import {
  getRequiredRegulatoryFeaturesAsync,
  isEligibleForAgeFeaturesAsync,
  requestAgeRangeAsync,
  requestAgeSignalsAccessAsync,
  showSignificantUpdateAcknowledgmentAsync,
  type AgeRangeRequest,
  type AgeRangeResponse,
} from 'expo-age-range';
import { PARENTAL_PERMISSION_BELOW_AGE } from '@agiworkforce/types';
import { storage } from '@/lib/mmkv';
import {
  confirmAgeGateFromRange,
  getAgeThreshold,
  type AgeGateRecord,
} from '@/src/features/auth/services/ageGate';

export type AgeAssuranceOutcome =
  'range' | 'notRegulated' | 'declined' | 'verificationRequired' | 'unavailable';

export type SignificantChangeStatus = 'APPROVED' | 'PENDING' | 'DECLINED' | null;

export type AgeAssuranceRecord = {
  checkedAt: string;
  platform: 'ios' | 'android';
  outcome: AgeAssuranceOutcome;
  regulated: boolean | null;
  lowerBound: number | null;
  upperBound: number | null;
  guardianManaged: boolean;
  installId: string | null;
  significantChangeStatus: SignificantChangeStatus;
};

export type PurchaseGate =
  { allowed: true } | { allowed: false; reason: 'guardianConsentRequired' | 'ageUnconfirmed' };

export type SignificantUpdateResult =
  'notRequired' | 'acknowledged' | 'parentalConsentRequired' | 'failed';

const MMKV_KEY = 'age-assurance:v1';
const IOS_DECLARED_AGE_RANGE_MAJOR = 26;
const IOS_USER_DECLINED = 'ERR_AGE_RANGE_USER_DECLINED';
const ANDROID_TASK_CANCELLED = 'ERR_AGE_RANGE_TASK_CANCELLED';

export function readAgeAssurance(): AgeAssuranceRecord | null {
  try {
    const raw = storage?.getString(MMKV_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AgeAssuranceRecord;
  } catch {
    return null;
  }
}

function writeAgeAssurance(record: AgeAssuranceRecord): AgeAssuranceRecord {
  storage.set(MMKV_KEY, JSON.stringify(record));
  return record;
}

export function clearAgeAssurance(): void {
  storage.delete(MMKV_KEY);
}

export function ageRangeRequest(): AgeRangeRequest {
  const accountThreshold = getAgeThreshold();
  return accountThreshold < PARENTAL_PERMISSION_BELOW_AGE
    ? { threshold1: accountThreshold, threshold2: PARENTAL_PERMISSION_BELOW_AGE }
    : { threshold1: accountThreshold };
}

function supportsDeclaredAgeRange(): boolean {
  return Number.parseInt(String(Platform.Version), 10) >= IOS_DECLARED_AGE_RANGE_MAJOR;
}

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  return String((error as { code: unknown }).code);
}

function record(
  platform: 'ios' | 'android',
  outcome: AgeAssuranceOutcome,
  regulated: boolean | null,
  response?: AgeRangeResponse,
): AgeAssuranceRecord {
  return {
    checkedAt: new Date().toISOString(),
    platform,
    outcome,
    regulated,
    lowerBound: response?.lowerBound ?? null,
    upperBound: response?.upperBound ?? null,
    guardianManaged:
      response?.ageRangeDeclaration === 'guardianDeclared' || response?.ageRangeSource === 'TIER_B',
    installId: response?.installId ?? null,
    significantChangeStatus: response?.significantChangeStatus ?? null,
  };
}

async function checkIos(): Promise<AgeAssuranceRecord> {
  if (!supportsDeclaredAgeRange()) return record('ios', 'unavailable', null);
  const regulated = await isEligibleForAgeFeaturesAsync().catch(() => null);
  if (regulated === false) return record('ios', 'notRegulated', false);
  try {
    const response = await requestAgeRangeAsync(ageRangeRequest());
    return record('ios', 'range', regulated, response);
  } catch (error) {
    return record(
      'ios',
      errorCode(error) === IOS_USER_DECLINED ? 'declined' : 'unavailable',
      regulated,
    );
  }
}

async function checkAndroid(): Promise<AgeAssuranceRecord> {
  try {
    const status = await requestAgeSignalsAccessAsync();
    if (status === 'NOT_SHARED') return record('android', 'declined', null);
    if (status === 'VERIFICATION_REQUIRED') return record('android', 'verificationRequired', true);
    if (status !== 'SHARED') return record('android', 'unavailable', null);
    const response = await requestAgeRangeAsync(ageRangeRequest());
    if (response.lowerBound === null && response.upperBound === null) {
      return record('android', 'unavailable', null);
    }
    // Play reports a range only where a law requires it (Brazil, Texas), so a range means regulated.
    return record('android', 'range', true, response);
  } catch (error) {
    return record(
      'android',
      errorCode(error) === ANDROID_TASK_CANCELLED ? 'declined' : 'unavailable',
      null,
    );
  }
}

export async function runAgeAssurance(): Promise<AgeAssuranceRecord | null> {
  if (Platform.OS === 'ios') return writeAgeAssurance(await checkIos());
  if (Platform.OS === 'android') return writeAgeAssurance(await checkAndroid());
  return null;
}

/**
 * Asks the OS for the user's age range and records it in the age gate.
 * Returns null when the OS gave no answer that settles the account threshold,
 * so the typed age gate stays the fallback.
 */
export async function assureAgeWithOs(): Promise<AgeGateRecord | null> {
  const assurance = await runAgeAssurance();
  if (assurance?.outcome !== 'range') return null;
  return confirmAgeGateFromRange(assurance);
}

function isUnderAdultAge(assurance: AgeAssuranceRecord): boolean {
  return assurance.upperBound !== null && assurance.upperBound < PARENTAL_PERMISSION_BELOW_AGE;
}

export function canPurchase(): PurchaseGate {
  const assurance = readAgeAssurance();
  if (!assurance) return { allowed: true };
  if (assurance.outcome === 'verificationRequired') {
    return { allowed: false, reason: 'ageUnconfirmed' };
  }
  if (assurance.outcome === 'declined' && assurance.regulated === true) {
    return { allowed: false, reason: 'ageUnconfirmed' };
  }
  if (
    assurance.outcome === 'range' &&
    isUnderAdultAge(assurance) &&
    (assurance.regulated === true || assurance.guardianManaged)
  ) {
    return { allowed: false, reason: 'guardianConsentRequired' };
  }
  return { allowed: true };
}

async function acknowledgeOnIos(description: string): Promise<SignificantUpdateResult> {
  const features = await getRequiredRegulatoryFeaturesAsync().catch(() => null);
  if (features?.includes('significantAppChangeRequiresParentalConsent')) {
    return 'parentalConsentRequired';
  }
  if (!features?.includes('significantAppChangeRequiresAdultNotification')) return 'notRequired';
  try {
    await showSignificantUpdateAcknowledgmentAsync(description);
    return 'acknowledged';
  } catch {
    return 'failed';
  }
}

async function refreshAndroidChangeStatus(): Promise<SignificantUpdateResult> {
  const previous = readAgeAssurance();
  if (previous?.outcome !== 'range') return 'notRequired';
  try {
    const response = await requestAgeRangeAsync(ageRangeRequest());
    const status = writeAgeAssurance(
      record('android', 'range', true, response),
    ).significantChangeStatus;
    return status === 'PENDING' || status === 'DECLINED'
      ? 'parentalConsentRequired'
      : 'notRequired';
  } catch {
    return 'failed';
  }
}

/**
 * Call before exposing a significant app change. On iOS this shows Apple's
 * acknowledgement sheet when the OS requires one; on Android it reads whether
 * a guardian has approved the change declared in Play Console.
 */
export async function acknowledgeSignificantUpdate(
  description: string,
): Promise<SignificantUpdateResult> {
  if (Platform.OS === 'ios') return acknowledgeOnIos(description);
  if (Platform.OS === 'android') return refreshAndroidChangeStatus();
  return 'notRequired';
}

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
import { ACCOUNT_MINIMUM_AGE } from '@agiworkforce/types';
import {
  confirmAgeGateFromRange,
  getAgeThreshold,
  type AgeGateRecord,
} from '@/src/features/auth/services/ageGate';
import {
  readAgeAssurance,
  writeAgeAssurance,
  type AgeAssuranceOutcome,
  type AgeAssuranceRecord,
} from './ageAssuranceRecord';

export * from './ageAssuranceRecord';

export type PurchaseGate =
  { allowed: true } | { allowed: false; reason: 'guardianConsentRequired' | 'ageUnconfirmed' };

export type SignificantUpdateResult =
  'notRequired' | 'acknowledged' | 'parentalConsentRequired' | 'failed';

const IOS_DECLARED_AGE_RANGE_MAJOR = 26;
const IOS_USER_DECLINED = 'ERR_AGE_RANGE_USER_DECLINED';
const ANDROID_TASK_CANCELLED = 'ERR_AGE_RANGE_TASK_CANCELLED';

export function ageRangeRequest(): AgeRangeRequest {
  return { threshold1: getAgeThreshold() };
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
 * Asks the OS for the person's age range and records it in the age gate.
 * An unavailable, declined, not regulated or verification-required answer, and
 * a range that straddles the threshold or carries no bounds, returns null:
 * the typed age is then the only way through, and nothing here admits anyone.
 */
export async function assureAgeWithOs(): Promise<AgeGateRecord | null> {
  const assurance = await runAgeAssurance();
  if (assurance === null) return null;
  switch (assurance.outcome) {
    case 'range':
      return confirmAgeGateFromRange(assurance);
    case 'notRegulated':
    case 'declined':
    case 'verificationRequired':
    case 'unavailable':
      return null;
  }
}

function isUnderAdultAge(assurance: AgeAssuranceRecord): boolean {
  return assurance.upperBound !== null && assurance.upperBound < ACCOUNT_MINIMUM_AGE;
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

import { Platform } from 'react-native';
import { storage } from '@/lib/mmkv';

export type HealthKitType = 'steps' | 'heart_rate' | 'active_energy' | 'sleep' | 'workouts';
export type HealthKitSampleType = HealthKitType;
export type HealthKitAuthStatus = 'undetermined' | 'granted' | 'denied';

export interface HealthKitGrantResult {
  granted: HealthKitType[];
  denied: HealthKitType[];
}

interface HealthKitNative {
  requestAuthorization?: (read: readonly string[], write?: readonly string[]) => Promise<boolean>;
  authorizationStatusFor?: (type: string) => Promise<boolean | string | number>;
  isHealthDataAvailable?: () => Promise<boolean>;
}

const AUTH_CACHE_PREFIX = 'agi.healthkit.auth.v1.';

const READ_IDENTIFIER: Record<HealthKitType, string> = {
  steps: 'HKQuantityTypeIdentifierStepCount',
  heart_rate: 'HKQuantityTypeIdentifierHeartRate',
  active_energy: 'HKQuantityTypeIdentifierActiveEnergyBurned',
  sleep: 'HKCategoryTypeIdentifierSleepAnalysis',
  workouts: 'HKWorkoutTypeIdentifier',
};

function authCacheKey(type: HealthKitType): string {
  return `${AUTH_CACHE_PREFIX}${type}`;
}

function normalizeAuthStatus(value: unknown): HealthKitAuthStatus {
  if (value === true || value === 'sharingAuthorized' || value === 2) return 'granted';
  if (value === false || value === 'sharingDenied' || value === 1) return 'denied';
  return 'undetermined';
}

function setCachedHealthKitAuthStatus(type: HealthKitType, status: HealthKitAuthStatus): void {
  storage.set(authCacheKey(type), status);
}

export function getCachedHealthKitAuthStatus(type: HealthKitType): HealthKitAuthStatus {
  const value = storage.getString(authCacheKey(type));
  if (value === 'granted' || value === 'denied' || value === 'undetermined') {
    return value;
  }
  return 'undetermined';
}

export function clearHealthKitAuthCache(): void {
  for (const type of Object.keys(READ_IDENTIFIER) as HealthKitType[]) {
    storage.delete(authCacheKey(type));
  }
}

async function getNativeAuthStatus(
  hk: HealthKitNative,
  type: HealthKitType,
): Promise<HealthKitAuthStatus> {
  if (!hk.authorizationStatusFor) return 'undetermined';
  try {
    return normalizeAuthStatus(await hk.authorizationStatusFor(READ_IDENTIFIER[type]));
  } catch {
    return 'undetermined';
  }
}

export async function requestHealthKitAccess(
  types: readonly HealthKitType[],
): Promise<HealthKitGrantResult> {
  const uniqueTypes = Array.from(new Set(types));
  if (Platform.OS !== 'ios' || uniqueTypes.length === 0) {
    return { granted: [], denied: uniqueTypes };
  }

  const hk = getHealthKitModule();
  if (!hk?.requestAuthorization) {
    return { granted: [], denied: uniqueTypes };
  }

  const granted: HealthKitType[] = [];
  const denied: HealthKitType[] = [];
  const needsRequest: HealthKitType[] = [];

  for (const type of uniqueTypes) {
    if (getCachedHealthKitAuthStatus(type) !== 'granted') {
      needsRequest.push(type);
      continue;
    }

    const liveStatus = await getNativeAuthStatus(hk, type);
    if (liveStatus === 'denied') {
      setCachedHealthKitAuthStatus(type, 'denied');
      needsRequest.push(type);
    } else {
      granted.push(type);
    }
  }

  if (needsRequest.length === 0) {
    return { granted, denied };
  }

  let requestCompleted = false;
  try {
    requestCompleted = await hk.requestAuthorization(
      needsRequest.map((type) => READ_IDENTIFIER[type]),
      [],
    );
  } catch {
    requestCompleted = false;
  }

  for (const type of needsRequest) {
    if (!requestCompleted) {
      setCachedHealthKitAuthStatus(type, 'denied');
      denied.push(type);
      continue;
    }

    const liveStatus = await getNativeAuthStatus(hk, type);
    if (liveStatus === 'granted') {
      setCachedHealthKitAuthStatus(type, 'granted');
      granted.push(type);
    } else {
      setCachedHealthKitAuthStatus(type, 'denied');
      denied.push(type);
    }
  }

  return { granted, denied };
}

export function isHealthKitAvailable(): boolean {
  return Platform.OS === 'ios' && Boolean(getHealthKitModule()?.requestAuthorization);
}

export function getHealthKitModule(): HealthKitNative | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@kingstinct/react-native-healthkit') as
      | { default?: HealthKitNative }
      | HealthKitNative;
    const resolved = 'default' in mod && mod.default ? mod.default : (mod as HealthKitNative);
    return resolved ?? null;
  } catch {
    return null;
  }
}

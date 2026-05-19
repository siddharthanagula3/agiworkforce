// AUDIT-FIX: HealthKit permission service stub — was referenced from tests but
// the implementation was lost during the mobile reorg. Returns "no permissions"
// safely; downstream callers degrade to non-HealthKit code paths.

export type HealthKitType = 'steps' | 'heart_rate' | 'active_energy' | 'sleep' | 'workouts';
export type HealthKitSampleType = HealthKitType;

export interface HealthKitGrantResult {
  granted: HealthKitType[];
  denied: HealthKitType[];
}

export async function requestHealthKitAccess(
  types: readonly HealthKitType[],
): Promise<HealthKitGrantResult> {
  return { granted: [], denied: [...types] };
}

export function isHealthKitAvailable(): boolean {
  return false;
}

export function getHealthKitModule(): unknown | null {
  return null;
}

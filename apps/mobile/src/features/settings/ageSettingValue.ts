import type { AgeGateStatus } from '@/src/features/auth/services/ageGate';

export const AGE_SETTING_LABEL = 'Age';

export const AGE_SETTING_ROUTE = '/(app)/settings/age';

export function ageSettingValue(status: AgeGateStatus, threshold: number): string {
  if (!Number.isFinite(threshold)) return 'Not set';
  if (status === 'confirmed') return `${threshold} or older`;
  if (status === 'refused') return `Under ${threshold}`;
  return 'Not set';
}

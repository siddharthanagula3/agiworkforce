import type { AgeGateRecord } from '@/src/features/auth/services/ageGate';

export const AGE_SETTING_LABEL = 'Age';

export function ageSettingValue(record: AgeGateRecord | null): string {
  if (record?.confirmed !== true || !Number.isFinite(record.threshold)) return 'Not set';
  return record.isMinor ? `Under ${record.threshold}` : `${record.threshold} or older`;
}

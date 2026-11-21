import { storage } from '@/lib/mmkv';

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

const MMKV_KEY = 'age-assurance:v1';

export function readAgeAssurance(): AgeAssuranceRecord | null {
  try {
    const raw = storage?.getString(MMKV_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AgeAssuranceRecord;
  } catch {
    return null;
  }
}

export function writeAgeAssurance(record: AgeAssuranceRecord): AgeAssuranceRecord {
  storage.set(MMKV_KEY, JSON.stringify(record));
  return record;
}

export function clearAgeAssurance(): void {
  storage.delete(MMKV_KEY);
}

export function storedOsAgeRange(): {
  lowerBound: number | null;
  upperBound: number | null;
} | null {
  const assurance = readAgeAssurance();
  if (assurance?.outcome !== 'range') return null;
  return { lowerBound: assurance.lowerBound, upperBound: assurance.upperBound };
}

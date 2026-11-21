import {
  ACCOUNT_MINIMUM_AGE,
  adultEligibilityIsCurrent,
  decideAdultEligibility,
  type AdultEligibilityEvidence,
} from '@agiworkforce/types';
import { storage } from '@/lib/mmkv';
import { storedOsAgeRange } from '@/src/features/age-assurance/ageAssuranceRecord';

export type AgeGateRecord = {
  confirmed: boolean;
  isMinor: boolean;
  confirmedAt: string;
  regionCode: string;
  threshold: number;
};

export type AgeGateStatus = 'confirmed' | 'refused' | 'required';

type RegionAgeRule = {
  code: string;
  threshold: number;
};

const BRAZIL_RULE: RegionAgeRule = { code: 'BR', threshold: 18 };
const INDIA_RULE: RegionAgeRule = { code: 'IN', threshold: 18 };

const TIMEZONE_TO_REGION: Array<{ prefix: string; rule: RegionAgeRule }> = [
  { prefix: 'Asia/Kolkata', rule: INDIA_RULE },
  { prefix: 'Asia/Calcutta', rule: INDIA_RULE },

  { prefix: 'America/Sao_Paulo', rule: BRAZIL_RULE },
  { prefix: 'America/Manaus', rule: BRAZIL_RULE },
  { prefix: 'America/Belem', rule: BRAZIL_RULE },
  { prefix: 'America/Fortaleza', rule: BRAZIL_RULE },
  { prefix: 'America/Recife', rule: BRAZIL_RULE },
  { prefix: 'America/Maceio', rule: BRAZIL_RULE },
  { prefix: 'America/Bahia', rule: BRAZIL_RULE },
  { prefix: 'America/Cuiaba', rule: BRAZIL_RULE },
  { prefix: 'America/Campo_Grande', rule: BRAZIL_RULE },
  { prefix: 'America/Porto_Velho', rule: BRAZIL_RULE },
  { prefix: 'America/Boa_Vista', rule: BRAZIL_RULE },
  { prefix: 'America/Noronha', rule: BRAZIL_RULE },
  { prefix: 'America/Rio_Branco', rule: BRAZIL_RULE },
  { prefix: 'America/Eirunepe', rule: BRAZIL_RULE },
  { prefix: 'America/Santarem', rule: BRAZIL_RULE },
  { prefix: 'America/Araguaina', rule: BRAZIL_RULE },
];

const DEFAULT_RULE: RegionAgeRule = { code: 'DEFAULT', threshold: ACCOUNT_MINIMUM_AGE };
const MMKV_KEY = 'age-gate:v1';

export function detectRegionRule(): RegionAgeRule {
  let tz: string;
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return DEFAULT_RULE;
  }

  for (const { prefix, rule } of TIMEZONE_TO_REGION) {
    if (tz === prefix || tz.startsWith(prefix)) {
      return rule;
    }
  }
  return DEFAULT_RULE;
}

export function getAgeThreshold(): number {
  return Math.max(detectRegionRule().threshold, ACCOUNT_MINIMUM_AGE);
}

export function readAgeGateRecord(): AgeGateRecord | null {
  try {
    const raw = storage?.getString(MMKV_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AgeGateRecord;
  } catch {
    return null;
  }
}

function writeRecord(record: AgeGateRecord): void {
  storage.set(MMKV_KEY, JSON.stringify(record));
}

function isRefusalRecord(record: AgeGateRecord | null): boolean {
  return record?.confirmed === true && record.isMinor === true;
}

/**
 * What this device can offer as proof that its person meets the current
 * minimum, without asking again: an OS range wholly at or above it, or a
 * typed-age decision made against it. A decision made under an earlier, lower
 * minimum proves nothing, so it yields null and the person is asked again.
 */
export function deviceAdultEvidence(): AdultEligibilityEvidence | null {
  const record = readAgeGateRecord();
  if (isRefusalRecord(record)) return null;

  const range = storedOsAgeRange();
  if (range) {
    const evidence: AdultEligibilityEvidence = { kind: 'platform_age_signal', ...range };
    if (decideAdultEligibility(evidence) === 'eligible') return evidence;
  }

  if (
    record?.confirmed === true &&
    record.isMinor === false &&
    adultEligibilityIsCurrent({ minimumAge: record.threshold })
  ) {
    return { kind: 'age_checked_on_device', minimumAge: record.threshold };
  }
  return null;
}

export function ageGateStatus(): AgeGateStatus {
  if (isRefusalRecord(readAgeGateRecord())) return 'refused';
  return deviceAdultEvidence() ? 'confirmed' : 'required';
}

export function isAgeGateConfirmed(): boolean {
  return ageGateStatus() === 'confirmed';
}

export function isMinorMode(): boolean {
  return ageGateStatus() === 'refused';
}

/**
 * Record the person's typed age as a verdict against the current threshold.
 *
 * A device that recorded an age under the minimum keeps its record: nothing
 * in this app verifies the typed age, so accepting a higher one would let
 * someone refused open the app. Only clearAgeGate lifts it.
 */
export function confirmAgeGate(ageEntered: number): AgeGateRecord {
  return recordAgeVerdict(ageEntered < getAgeThreshold());
}

/**
 * Record an age range the OS reported (Declared Age Range, Play Age Signals).
 * Returns null when the range does not settle which side of the threshold the
 * person is on (it straddles it, or carries no bounds), so the caller falls
 * back to the typed age.
 */
export function confirmAgeGateFromRange(range: {
  lowerBound: number | null;
  upperBound: number | null;
}): AgeGateRecord | null {
  const threshold = getAgeThreshold();
  if (range.upperBound !== null && range.upperBound < threshold) return recordAgeVerdict(true);
  if (range.lowerBound !== null && range.lowerBound >= threshold) return recordAgeVerdict(false);
  return null;
}

function recordAgeVerdict(isMinor: boolean): AgeGateRecord {
  const existing = readAgeGateRecord();
  if (existing && isRefusalRecord(existing)) return existing;

  const rule = detectRegionRule();
  const record: AgeGateRecord = {
    confirmed: true,
    isMinor,
    confirmedAt: new Date().toISOString(),
    regionCode: rule.code,
    threshold: getAgeThreshold(),
  };
  writeRecord(record);
  return record;
}

export function clearAgeGate(): void {
  storage.delete(MMKV_KEY);
}

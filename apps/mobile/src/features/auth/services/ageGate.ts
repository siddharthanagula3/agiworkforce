
import { storage } from '@/lib/mmkv';

export type AgeGateRecord = {
  confirmed: boolean;
  isMinor: boolean;
  confirmedAt: string;
  regionCode: string;
  threshold: number;
};

type RegionAgeRule = {
  code: string;
  threshold: number;
};

const TIMEZONE_TO_REGION: Array<{ prefix: string; rule: RegionAgeRule }> = [
  { prefix: 'Asia/Kolkata', rule: { code: 'IN', threshold: 18 } },
  { prefix: 'Asia/Calcutta', rule: { code: 'IN', threshold: 18 } },

  { prefix: 'America/Sao_Paulo', rule: { code: 'BR', threshold: 18 } },
  { prefix: 'America/Manaus', rule: { code: 'BR', threshold: 18 } },
  { prefix: 'America/Belem', rule: { code: 'BR', threshold: 18 } },
  { prefix: 'America/Fortaleza', rule: { code: 'BR', threshold: 18 } },
  { prefix: 'America/Recife', rule: { code: 'BR', threshold: 18 } },
  { prefix: 'America/Maceio', rule: { code: 'BR', threshold: 18 } },
  { prefix: 'America/Bahia', rule: { code: 'BR', threshold: 18 } },
  { prefix: 'America/Cuiaba', rule: { code: 'BR', threshold: 18 } },
  { prefix: 'America/Campo_Grande', rule: { code: 'BR', threshold: 18 } },
  { prefix: 'America/Porto_Velho', rule: { code: 'BR', threshold: 18 } },
  { prefix: 'America/Boa_Vista', rule: { code: 'BR', threshold: 18 } },
  { prefix: 'America/Noronha', rule: { code: 'BR', threshold: 18 } },
  { prefix: 'America/Rio_Branco', rule: { code: 'BR', threshold: 18 } },
  { prefix: 'America/Eirunepe', rule: { code: 'BR', threshold: 18 } },
  { prefix: 'America/Santarem', rule: { code: 'BR', threshold: 18 } },
  { prefix: 'America/Araguaina', rule: { code: 'BR', threshold: 18 } },

  { prefix: 'Europe/Amsterdam', rule: { code: 'NL', threshold: 16 } },
  { prefix: 'Europe/Athens', rule: { code: 'GR', threshold: 16 } },
  { prefix: 'Europe/Berlin', rule: { code: 'DE', threshold: 16 } },
  { prefix: 'Europe/Brussels', rule: { code: 'BE', threshold: 16 } },
  { prefix: 'Europe/Bucharest', rule: { code: 'RO', threshold: 16 } },
  { prefix: 'Europe/Budapest', rule: { code: 'HU', threshold: 16 } },
  { prefix: 'Europe/Copenhagen', rule: { code: 'DK', threshold: 16 } },
  { prefix: 'Europe/Dublin', rule: { code: 'IE', threshold: 16 } },
  { prefix: 'Europe/Helsinki', rule: { code: 'FI', threshold: 16 } },
  { prefix: 'Europe/Ljubljana', rule: { code: 'SI', threshold: 16 } },
  { prefix: 'Europe/Luxembourg', rule: { code: 'LU', threshold: 16 } },
  { prefix: 'Europe/Madrid', rule: { code: 'ES', threshold: 16 } },
  { prefix: 'Europe/Malta', rule: { code: 'MT', threshold: 16 } },
  { prefix: 'Europe/Nicosia', rule: { code: 'CY', threshold: 16 } },
  { prefix: 'Europe/Paris', rule: { code: 'FR', threshold: 16 } },
  { prefix: 'Europe/Prague', rule: { code: 'CZ', threshold: 16 } },
  { prefix: 'Europe/Riga', rule: { code: 'LV', threshold: 16 } },
  { prefix: 'Europe/Rome', rule: { code: 'IT', threshold: 16 } },
  { prefix: 'Europe/Skopje', rule: { code: 'MK', threshold: 16 } },
  { prefix: 'Europe/Sofia', rule: { code: 'BG', threshold: 16 } },
  { prefix: 'Europe/Stockholm', rule: { code: 'SE', threshold: 16 } },
  { prefix: 'Europe/Tallinn', rule: { code: 'EE', threshold: 16 } },
  { prefix: 'Europe/Vilnius', rule: { code: 'LT', threshold: 16 } },
  { prefix: 'Europe/Warsaw', rule: { code: 'PL', threshold: 16 } },
  { prefix: 'Europe/Zagreb', rule: { code: 'HR', threshold: 16 } },
  { prefix: 'Atlantic/Azores', rule: { code: 'PT', threshold: 16 } },
  { prefix: 'Europe/Lisbon', rule: { code: 'PT', threshold: 16 } },
  { prefix: 'Europe/Vienna', rule: { code: 'AT', threshold: 16 } },
  { prefix: 'Europe/Bratislava', rule: { code: 'SK', threshold: 16 } },

  { prefix: 'Europe/London', rule: { code: 'GB', threshold: 13 } },
  { prefix: 'Europe/Belfast', rule: { code: 'GB', threshold: 13 } },
  { prefix: 'Europe/Jersey', rule: { code: 'GB', threshold: 13 } },
  { prefix: 'Europe/Guernsey', rule: { code: 'GB', threshold: 13 } },
];

const DEFAULT_RULE: RegionAgeRule = { code: 'DEFAULT', threshold: 13 };
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
  return detectRegionRule().threshold;
}

function readRecord(): AgeGateRecord | null {
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

export function isAgeGateConfirmed(): boolean {
  return readRecord()?.confirmed === true;
}

export function isMinorMode(): boolean {
  const rec = readRecord();
  return rec?.confirmed === true && rec.isMinor === true;
}

/**
 * Record the user's age confirmation.
 *
 * @param ageEntered The age the user entered (integer years).
 */
export function confirmAgeGate(ageEntered: number): AgeGateRecord {
  const rule = detectRegionRule();
  const isMinor = ageEntered < rule.threshold;
  const record: AgeGateRecord = {
    confirmed: true,
    isMinor,
    confirmedAt: new Date().toISOString(),
    regionCode: rule.code,
    threshold: rule.threshold,
  };
  writeRecord(record);
  return record;
}

export function clearAgeGate(): void {
  storage.delete(MMKV_KEY);
}

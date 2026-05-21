/**
 * Age-gate service — country-aware minimum-age thresholds.
 *
 * Policy sources:
 *   - DPDP Act 2023 (India): 18+ for data processing without parental consent
 *   - EU AI Act Article 5(1)(b): minor protection from manipulative AI (16+ in
 *     EU member states where national laws set 16; defaulting to 13 for EU
 *     outside the explicit list below)
 *   - Google Play GenAI policy: must implement age gate if content is targeted
 *     to general audiences including minors
 *   - COPPA (US): 13+
 *   - Brazil LGPD + ECA: 18+ for autonomous consent; 13+ with parental consent
 *   - Utah / Louisiana Age Verification Acts: 18+ (enforcement-pending; use 13+
 *     as floor; external verification not done here per privacy constraint)
 *   - Default everywhere else: 13+
 *
 * Country detection: derived from Intl.DateTimeFormat().resolvedOptions().timeZone
 * mapped to a region. No IP geo lookup — locale only, per privacy constraint.
 *
 * Persistence: MMKV key "age-gate:v1" stores { confirmed: boolean, isMinor: boolean }
 */

import { storage } from '@/lib/mmkv';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgeGateRecord = {
  confirmed: boolean;
  isMinor: boolean;
  /** ISO 8601 timestamp of confirmation */
  confirmedAt: string;
  /** Detected region code used to derive threshold */
  regionCode: string;
  /** Minimum age threshold that applied */
  threshold: number;
};

// ---------------------------------------------------------------------------
// Country → minimum age threshold table
// ---------------------------------------------------------------------------

/**
 * Maps IANA timezone prefix (continent/region) or explicit timezone string to
 * the minimum age for self-consent.
 *
 * Full table:
 *  India (18+)    — DPDP Act 2023
 *  Brazil (18+)   — LGPD child consent requires guardian up to 18
 *  EU (16+)       — EU AI Act Article 5 + DSA; GDPR default for digital services
 *  UK (13+)       — UK GDPR, ICO age-appropriate design
 *  US (13+)       — COPPA
 *  Others (13+)   — COPPA-equivalent safe default
 */

type RegionAgeRule = {
  /** Region code used in stored records */
  code: string;
  threshold: number;
};

const TIMEZONE_TO_REGION: Array<{ prefix: string; rule: RegionAgeRule }> = [
  // India — 18+
  { prefix: 'Asia/Kolkata', rule: { code: 'IN', threshold: 18 } },
  { prefix: 'Asia/Calcutta', rule: { code: 'IN', threshold: 18 } },

  // Brazil — 18+
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

  // EU member-state timezones — 16+ per GDPR Art. 8 default
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

  // UK — 13+ (ICO Children's Code)
  { prefix: 'Europe/London', rule: { code: 'GB', threshold: 13 } },
  { prefix: 'Europe/Belfast', rule: { code: 'GB', threshold: 13 } },
  { prefix: 'Europe/Jersey', rule: { code: 'GB', threshold: 13 } },
  { prefix: 'Europe/Guernsey', rule: { code: 'GB', threshold: 13 } },
];

const DEFAULT_RULE: RegionAgeRule = { code: 'DEFAULT', threshold: 13 };
const MMKV_KEY = 'age-gate:v1';

// ---------------------------------------------------------------------------
// Region detection
// ---------------------------------------------------------------------------

/** Returns the region rule for the device's IANA timezone. */
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

/** Returns the minimum age threshold for the current device region. */
export function getAgeThreshold(): number {
  return detectRegionRule().threshold;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function readRecord(): AgeGateRecord | null {
  const raw = storage.getString(MMKV_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AgeGateRecord;
  } catch {
    return null;
  }
}

function writeRecord(record: AgeGateRecord): void {
  storage.set(MMKV_KEY, JSON.stringify(record));
}

/** True if the user has already confirmed age gate (either direction). */
export function isAgeGateConfirmed(): boolean {
  return readRecord()?.confirmed === true;
}

/**
 * Returns true if age gate was completed AND user is a minor.
 * Controls minor-safe mode globally.
 */
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

/** Clears the age gate record (used in tests + DSAR export). */
export function clearAgeGate(): void {
  storage.delete(MMKV_KEY);
}

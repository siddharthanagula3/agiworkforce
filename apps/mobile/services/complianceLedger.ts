import type {
  ConsentLedger,
  DisclosureLedger,
  DisclosureRecord,
  NamedProviderConsent,
} from '@agiworkforce/compliance';
import { DISCLOSURE_LEDGER_KEY } from '@agiworkforce/compliance';
import { storage } from '@/lib/mmkv';

const CONSENT_KEY_PREFIX = 'agi:provider-consent:v1:';

function parseJsonValue(raw: string | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDisclosureRecord(value: unknown): value is DisclosureRecord {
  if (!isObjectRecord(value)) return false;

  return (
    value['version'] === 1 &&
    typeof value['acceptedAt'] === 'string' &&
    ['mobile', 'web', 'desktop', 'cli'].includes(String(value['surface'])) &&
    typeof value['disclosureCopyHash'] === 'string' &&
    typeof value['managedCloudAccepted'] === 'boolean' &&
    Array.isArray(value['chineseHqProvidersAccepted'])
  );
}

function isNamedProviderConsent(value: unknown): value is NamedProviderConsent {
  if (!isObjectRecord(value)) return false;

  return (
    typeof value['providerId'] === 'string' &&
    typeof value['accepted'] === 'boolean' &&
    typeof value['acceptedAt'] === 'string' &&
    typeof value['disclosureVersion'] === 'string' &&
    ['mobile', 'web', 'desktop', 'cli'].includes(String(value['surface']))
  );
}

function consentKey(providerId: string): string {
  return `${CONSENT_KEY_PREFIX}${providerId.trim().toLowerCase()}`;
}

function readTyped<T>(key: string, isValid: (value: unknown) => value is T): T | null {
  const parsed = parseJsonValue(storage.getString(key));
  if (!parsed || !isValid(parsed)) {
    storage.delete(key);
    return null;
  }
  return parsed;
}

export const mmkvDisclosureLedger: DisclosureLedger = {
  read(): DisclosureRecord | null {
    return readTyped(DISCLOSURE_LEDGER_KEY, isDisclosureRecord);
  },
  write(record: DisclosureRecord): void {
    storage.set(DISCLOSURE_LEDGER_KEY, JSON.stringify(record));
  },
};

export const mmkvConsentLedger: ConsentLedger = {
  getNamedProviderConsent(providerId: string): NamedProviderConsent | null {
    return readTyped(consentKey(providerId), isNamedProviderConsent);
  },
};

export function recordNamedProviderConsent(consent: NamedProviderConsent): void {
  storage.set(consentKey(consent.providerId), JSON.stringify(consent));
}

export function clearNamedProviderConsent(providerId: string): void {
  storage.delete(consentKey(providerId));
}

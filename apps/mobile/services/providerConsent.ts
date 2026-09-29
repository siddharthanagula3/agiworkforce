import {
  CHINESE_HQ_PROVIDER_IDS,
  chineseHqProviderDisplayName,
  isChineseHqProvider,
  type ChineseHqProviderId,
} from '@agiworkforce/compliance';
import {
  mmkvRoutingConsentLedger,
  mmkvDisclosureLedger,
  recordNamedProviderConsent,
} from './complianceLedger';

const CONSENT_SURFACE = 'mobile' as const;
const DISCLOSURE_VERSION_FALLBACK = 'unrecorded';

export type ChineseHqConsentMap = Readonly<Record<ChineseHqProviderId, boolean>>;

export function readChineseHqConsent(): ChineseHqConsentMap {
  const entries = CHINESE_HQ_PROVIDER_IDS.map(
    (id) => [id, mmkvRoutingConsentLedger.getNamedProviderConsent(id)?.accepted === true] as const,
  );
  return Object.fromEntries(entries) as ChineseHqConsentMap;
}

export function isChineseHqProviderAccepted(providerId: ChineseHqProviderId): boolean {
  return mmkvRoutingConsentLedger.getNamedProviderConsent(providerId)?.accepted === true;
}

export function setChineseHqProviderConsent(
  providerId: ChineseHqProviderId,
  accepted: boolean,
  now: () => Date = () => new Date(),
): void {
  const disclosureVersion = mmkvDisclosureLedger.read()?.disclosureCopyHash;
  if (accepted && !disclosureVersion) {
    throw new Error('Accept the privacy disclosure before enabling this provider.');
  }
  recordNamedProviderConsent({
    providerId,
    accepted,
    acceptedAt: now().toISOString(),
    disclosureVersion: disclosureVersion ?? DISCLOSURE_VERSION_FALLBACK,
    surface: CONSENT_SURFACE,
  });
}

export function applyChineseHqProviderConsent(
  acceptedProviderIds: readonly ChineseHqProviderId[],
  now: () => Date = () => new Date(),
): void {
  for (const id of CHINESE_HQ_PROVIDER_IDS) {
    setChineseHqProviderConsent(id, acceptedProviderIds.includes(id), now);
  }
}

export function toChineseHqProviderId(providerId: string): ChineseHqProviderId | null {
  return isChineseHqProvider(providerId) ? providerId : null;
}

export { CHINESE_HQ_PROVIDER_IDS, chineseHqProviderDisplayName, type ChineseHqProviderId };

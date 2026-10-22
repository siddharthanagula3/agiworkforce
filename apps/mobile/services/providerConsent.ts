import { Alert } from 'react-native';
import {
  CHINESE_HQ_PROVIDER_IDS,
  NAMED_PROVIDER_NOTICE_PROVIDER_LIST_PATH,
  chineseHqProviderDisplayName,
  type ChineseHqProviderId,
} from '@agiworkforce/compliance';
import { getProviderOfferings, providerLabels } from '@agiworkforce/types';
import { storage } from '@/lib/mmkv';
import { PROVIDERS } from '@/lib/models';
import { openInAppBrowser } from '@/lib/safeOpenURL';
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

export { CHINESE_HQ_PROVIDER_IDS, chineseHqProviderDisplayName, type ChineseHqProviderId };

export const CLOUD_PROVIDER_CONSENT_KEY = 'agi:cloud-provider-consent:v1';
export const CLOUD_PROVIDER_LIST_URL = `https://agiworkforce.com${NAMED_PROVIDER_NOTICE_PROVIDER_LIST_PATH}`;
const CLOUD_PROVIDER_CONSENT_TITLE = 'Share with AI providers?';
export const CLOUD_PROVIDER_CONSENT_ALLOW_LABEL = 'Allow';
export const CLOUD_PROVIDER_CONSENT_DECLINE_LABEL = 'Not now';
export const CLOUD_PROVIDER_CONSENT_DETAILS_LABEL = 'Details';

export interface CloudProvider {
  readonly id: string;
  readonly name: string;
}

interface CloudProviderConsentRecord {
  readonly accepted: true;
  readonly acceptedAt: string;
  readonly providerIds: readonly string[];
  readonly surface: typeof CONSENT_SURFACE;
}

export class CloudProviderConsentRequiredError extends Error {
  override readonly name: string = 'CloudProviderConsentRequiredError';
  readonly code: string = 'cloud_provider_consent_required';

  constructor(message = 'Allow AGI Cloud to share this with its AI providers before sending.') {
    super(message);
  }
}

export class CloudProviderConsentDeclinedError extends CloudProviderConsentRequiredError {
  override readonly name: string = 'CloudProviderConsentDeclinedError';
  override readonly code: string = 'cloud_provider_consent_declined';

  constructor() {
    super('Nothing was sent. Allow AI providers to use AGI Cloud.');
  }
}

export function cloudAiProviders(): readonly CloudProvider[] {
  const ids = new Set<string>(PROVIDERS.map((provider) => provider.id));
  for (const offering of Object.values(getProviderOfferings())) ids.add(offering.provider);
  return [...ids].map((id) => ({
    id,
    name: providerLabels[id as keyof typeof providerLabels] ?? id,
  }));
}

export function cloudProviderConsentMessage(providers: readonly CloudProvider[]): string {
  return `AGI Cloud sends your messages, photos, files and voice to these AI providers to answer you: ${providers.map((provider) => provider.name).join(', ')}.`;
}

function isCloudProviderConsentRecord(value: unknown): value is CloudProviderConsentRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record['accepted'] === true &&
    typeof record['acceptedAt'] === 'string' &&
    Array.isArray(record['providerIds']) &&
    record['providerIds'].every((id) => typeof id === 'string') &&
    record['surface'] === CONSENT_SURFACE
  );
}

export function readCloudProviderConsent(): CloudProviderConsentRecord | null {
  const raw = storage.getString(CLOUD_PROVIDER_CONSENT_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isCloudProviderConsentRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function hasCurrentCloudProviderConsent(
  providers: readonly CloudProvider[] = cloudAiProviders(),
): boolean {
  const consent = readCloudProviderConsent();
  if (!consent) return false;
  const covered = new Set(consent.providerIds);
  return providers.every((provider) => covered.has(provider.id));
}

export function recordCloudProviderConsent(
  providers: readonly CloudProvider[] = cloudAiProviders(),
  now: () => Date = () => new Date(),
): void {
  const record: CloudProviderConsentRecord = {
    accepted: true,
    acceptedAt: now().toISOString(),
    providerIds: providers.map((provider) => provider.id),
    surface: CONSENT_SURFACE,
  };
  storage.set(CLOUD_PROVIDER_CONSENT_KEY, JSON.stringify(record));
  const disclosure = mmkvDisclosureLedger.read();
  if (disclosure && !disclosure.managedCloudAccepted) {
    mmkvDisclosureLedger.write({ ...disclosure, managedCloudAccepted: true });
  }
}

type ConsentChoice = 'allow' | 'decline' | 'details';

function askCloudProviderConsent(providers: readonly CloudProvider[]): Promise<ConsentChoice> {
  return new Promise((resolve) => {
    Alert.alert(
      CLOUD_PROVIDER_CONSENT_TITLE,
      cloudProviderConsentMessage(providers),
      [
        { text: CLOUD_PROVIDER_CONSENT_DETAILS_LABEL, onPress: () => resolve('details') },
        {
          text: CLOUD_PROVIDER_CONSENT_DECLINE_LABEL,
          style: 'cancel',
          onPress: () => resolve('decline'),
        },
        { text: CLOUD_PROVIDER_CONSENT_ALLOW_LABEL, onPress: () => resolve('allow') },
      ],
      { cancelable: true, onDismiss: () => resolve('decline') },
    );
  });
}

let pendingCloudConsent: Promise<boolean> | null = null;

async function promptCloudProviderConsent(providers: readonly CloudProvider[]): Promise<boolean> {
  for (;;) {
    const choice = await askCloudProviderConsent(providers);
    if (choice === 'allow') {
      recordCloudProviderConsent(providers);
      return true;
    }
    if (choice === 'decline') return false;
    await openInAppBrowser(CLOUD_PROVIDER_LIST_URL);
  }
}

export function ensureCloudProviderConsent(): Promise<boolean> {
  const providers = cloudAiProviders();
  if (hasCurrentCloudProviderConsent(providers)) return Promise.resolve(true);
  pendingCloudConsent ??= promptCloudProviderConsent(providers).finally(() => {
    pendingCloudConsent = null;
  });
  return pendingCloudConsent;
}

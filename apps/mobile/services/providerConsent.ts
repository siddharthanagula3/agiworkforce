import { Alert, AppState, Platform, type NativeEventSubscription } from 'react-native';
import {
  CHINESE_HQ_PROVIDER_IDS,
  NAMED_PROVIDER_NOTICE_PROVIDER_LIST_PATH,
  chineseHqProviderDisplayName,
  type ChineseHqProviderId,
} from '@agiworkforce/compliance';
import { getProviderOfferings, providerLabels } from '@agiworkforce/types';
import { storage } from '@/lib/mmkv';
import { PROVIDERS } from '@/lib/models';
import { recordedCloudAccountOwnerId } from '@/src/features/auth/services/cloudAccountSession';
import { openWebContentPage } from '@/src/platform/webContentPage';
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
export const CLOUD_PROVIDER_SHARING_LABEL = 'Share with AI providers';
const CLOUD_PROVIDER_CONSENT_TITLE = `${CLOUD_PROVIDER_SHARING_LABEL}?`;
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
  readonly ownerId: string;
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
    typeof record['ownerId'] === 'string' &&
    record['ownerId'].length > 0 &&
    Array.isArray(record['providerIds']) &&
    record['providerIds'].every((id) => typeof id === 'string') &&
    record['surface'] === CONSENT_SURFACE
  );
}

export const CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY = 'agi:cloud-provider-consent:withdrawing';
const THIS_LAUNCH = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

interface CloudProviderConsentWithdrawal {
  readonly launch: string;
  readonly standingWorkPaused: boolean;
}

function readWithdrawal(): CloudProviderConsentWithdrawal | null {
  const marker = storage.getString(CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY);
  if (typeof marker !== 'string' || marker.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(marker);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const { launch, standingWorkPaused } = parsed as Record<string, unknown>;
      if (typeof launch === 'string') {
        return { launch, standingWorkPaused: standingWorkPaused === true };
      }
    }
  } catch {
    // An unreadable marker is still a withdrawal, of unknown progress.
  }
  return { launch: '', standingWorkPaused: false };
}

function writeWithdrawal(withdrawal: CloudProviderConsentWithdrawal): void {
  storage.set(CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY, JSON.stringify(withdrawal));
}

export function cloudProviderConsentWithdrawalInProgress(): boolean {
  return readWithdrawal() !== null;
}

export function beginCloudProviderConsentWithdrawal(): void {
  writeWithdrawal({ launch: THIS_LAUNCH, standingWorkPaused: false });
  notifyCloudProviderConsentChange();
}

export function markCloudProviderConsentWithdrawalStandingWorkPaused(): void {
  if (readWithdrawal()?.launch !== THIS_LAUNCH) return;
  writeWithdrawal({ launch: THIS_LAUNCH, standingWorkPaused: true });
}

export function finishUnfinishedCloudProviderConsentWithdrawal(): {
  standingWorkPaused: boolean;
} | null {
  const withdrawal = readWithdrawal();
  if (withdrawal === null || withdrawal.launch === THIS_LAUNCH) return null;
  withdrawCloudProviderConsent();
  return { standingWorkPaused: withdrawal.standingWorkPaused };
}

export function readCloudProviderConsent(): CloudProviderConsentRecord | null {
  const raw = storage.getString(CLOUD_PROVIDER_CONSENT_KEY);
  if (!raw || readWithdrawal() !== null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isCloudProviderConsentRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const consentListeners = new Set<() => void>();

export function subscribeCloudProviderConsentChange(listener: () => void): () => void {
  consentListeners.add(listener);
  return () => {
    consentListeners.delete(listener);
  };
}

function notifyCloudProviderConsentChange(): void {
  for (const listener of [...consentListeners]) {
    try {
      listener();
    } catch (error) {
      console.warn('[providerConsent] a consent listener failed:', error);
    }
  }
}

export function hasCurrentCloudProviderConsent(
  providers: readonly CloudProvider[] = cloudAiProviders(),
): boolean {
  const consent = readCloudProviderConsent();
  if (!consent) return false;
  const ownerId = recordedCloudAccountOwnerId();
  if (ownerId === null || consent.ownerId !== ownerId) return false;
  const covered = new Set(consent.providerIds);
  return providers.every((provider) => covered.has(provider.id));
}

export function hasCloudProviderConsentForCurrentAccount(): boolean {
  const ownerId = recordedCloudAccountOwnerId();
  return ownerId !== null && readCloudProviderConsent()?.ownerId === ownerId;
}

export function recordCloudProviderConsent(
  providers: readonly CloudProvider[] = cloudAiProviders(),
  now: () => Date = () => new Date(),
  ownerId: string | null = recordedCloudAccountOwnerId(),
): boolean {
  if (ownerId === null || ownerId !== recordedCloudAccountOwnerId()) return false;
  const record: CloudProviderConsentRecord = {
    accepted: true,
    acceptedAt: now().toISOString(),
    ownerId,
    providerIds: providers.map((provider) => provider.id),
    surface: CONSENT_SURFACE,
  };
  storage.set(CLOUD_PROVIDER_CONSENT_KEY, JSON.stringify(record));
  storage.delete(CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY);
  const disclosure = mmkvDisclosureLedger.read();
  if (disclosure && !disclosure.managedCloudAccepted) {
    mmkvDisclosureLedger.write({ ...disclosure, managedCloudAccepted: true });
  }
  notifyCloudProviderConsentChange();
  return true;
}

export function withdrawCloudProviderConsent(): void {
  storage.delete(CLOUD_PROVIDER_CONSENT_KEY);
  storage.delete(CLOUD_PROVIDER_CONSENT_WITHDRAWAL_KEY);
  const disclosure = mmkvDisclosureLedger.read();
  if (disclosure?.managedCloudAccepted) {
    mmkvDisclosureLedger.write({ ...disclosure, managedCloudAccepted: false });
  }
  notifyCloudProviderConsentChange();
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

interface CloudConsentQuestion {
  readonly ownerId: string;
  readonly answer: Promise<boolean>;
  readonly settle: (accepted: boolean) => void;
  readonly mayHaveBeenLost: () => boolean;
}

let pendingCloudConsent: CloudConsentQuestion | null = null;

// Android opens the provider list without waiting for it to close, and its
// DialogModule drops an alert requested while the activity is paused (the
// pending alert lives on a helper it rebuilds on resume). There the question is
// shown again whenever the app comes back to the front.
function startCloudConsentQuestion(
  providers: readonly CloudProvider[],
  ownerId: string,
): CloudConsentQuestion {
  const followsAppState = Platform.OS === 'android';
  let settled = false;
  let browsing = false;
  let leftApp = false;
  let shownQuestion = 0;
  let subscription: NativeEventSubscription | null = null;
  let resolveAnswer: (accepted: boolean) => void = () => undefined;
  let rejectAnswer: (error: unknown) => void = () => undefined;
  const answer = new Promise<boolean>((resolve, reject) => {
    resolveAnswer = resolve;
    rejectAnswer = reject;
  });

  const end = (): boolean => {
    if (settled) return false;
    settled = true;
    subscription?.remove();
    return true;
  };
  const settle = (accepted: boolean) => {
    if (end()) resolveAnswer(accepted);
  };
  const fail = (error: unknown) => {
    if (end()) rejectAnswer(error);
  };

  const openProviderList = async () => {
    if (!followsAppState) {
      await openWebContentPage(CLOUD_PROVIDER_LIST_URL);
      present();
      return;
    }
    browsing = true;
    const opened = await openWebContentPage(CLOUD_PROVIDER_LIST_URL);
    if (!opened && browsing) present();
  };

  const answerWith = (choice: ConsentChoice) => {
    if (choice === 'allow') {
      settle(recordCloudProviderConsent(providers, undefined, ownerId));
    } else if (choice === 'decline') {
      settle(false);
    } else {
      openProviderList().catch(fail);
    }
  };

  function present(): void {
    if (settled) return;
    browsing = false;
    shownQuestion += 1;
    const question = shownQuestion;
    void askCloudProviderConsent(providers).then((choice) => {
      if (settled || question !== shownQuestion) return;
      try {
        answerWith(choice);
      } catch (error) {
        fail(error);
      }
    });
  }

  if (followsAppState) {
    subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        leftApp = true;
        return;
      }
      present();
    });
  }
  if (!followsAppState || AppState.currentState !== 'background') present();

  return {
    ownerId,
    answer,
    settle,
    mayHaveBeenLost: () => followsAppState && (browsing || leftApp),
  };
}

export function ensureCloudProviderConsent(): Promise<boolean> {
  const providers = cloudAiProviders();
  if (hasCurrentCloudProviderConsent(providers)) return Promise.resolve(true);
  const ownerId = recordedCloudAccountOwnerId();
  const pending = pendingCloudConsent;
  if (ownerId === null) {
    pending?.settle(false);
    return Promise.resolve(false);
  }
  if (pending && pending.ownerId === ownerId && !pending.mayHaveBeenLost()) return pending.answer;
  pending?.settle(false);
  const question = startCloudConsentQuestion(providers, ownerId);
  pendingCloudConsent = question;
  const release = () => {
    if (pendingCloudConsent === question) pendingCloudConsent = null;
  };
  question.answer.then(release, release);
  return question.answer;
}

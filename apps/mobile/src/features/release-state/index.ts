import registryJson from './mobileReleaseState.json';

export type MobileStoreId = 'apple' | 'google';

export type StoreDistributionStatus = 'unpublished' | 'published';

export interface StoreDistributionRecord {
  readonly store: MobileStoreId;
  readonly status: StoreDistributionStatus;
  readonly productionId: string;
  readonly listingId: string | null;
  readonly listingUrl: string | null;
  readonly subscriptionManagementUrl: string | null;
  readonly evidence: string;
}

export interface MobileReleaseState {
  readonly surface: 'mobile';
  readonly statusLabel: string;
  readonly released: boolean;
  readonly stores: Readonly<Record<MobileStoreId, StoreDistributionRecord>>;
}

export const MOBILE_RELEASE_STATE = registryJson as unknown as MobileReleaseState;

export const MOBILE_STORE_IDS: readonly MobileStoreId[] = ['apple', 'google'];

const STORE_DISPLAY_NAMES: Readonly<Record<MobileStoreId, string>> = {
  apple: 'the Apple App Store',
  google: 'Google Play',
};

export function getStoreDistribution(store: MobileStoreId): StoreDistributionRecord {
  return MOBILE_RELEASE_STATE.stores[store];
}

export function isStoreDistributionVerified(record: StoreDistributionRecord): boolean {
  return (
    record.status === 'published' &&
    typeof record.listingId === 'string' &&
    record.listingId.length > 0
  );
}

export function isStorePublished(store: MobileStoreId): boolean {
  return isStoreDistributionVerified(getStoreDistribution(store));
}

export function storeListingUrlOf(record: StoreDistributionRecord): string | null {
  if (!isStoreDistributionVerified(record)) return null;
  const url = record.listingUrl;
  if (typeof url !== 'string' || !url.startsWith('https://')) return null;
  if (record.listingId !== null && !url.includes(record.listingId)) return null;
  return url;
}

export function storeListingUrl(store: MobileStoreId): string | null {
  return storeListingUrlOf(getStoreDistribution(store));
}

export function storeSubscriptionManagementUrlOf(record: StoreDistributionRecord): string | null {
  if (!isStoreDistributionVerified(record)) return null;
  const url = record.subscriptionManagementUrl;
  if (typeof url !== 'string' || !url.startsWith('https://')) return null;
  return url;
}

export function storeSubscriptionManagementUrl(store: MobileStoreId): string | null {
  return storeSubscriptionManagementUrlOf(getStoreDistribution(store));
}

export function storeDisplayNameOf(record: StoreDistributionRecord): string | null {
  return isStoreDistributionVerified(record) ? STORE_DISPLAY_NAMES[record.store] : null;
}

export function storeDisplayName(store: MobileStoreId): string | null {
  return storeDisplayNameOf(getStoreDistribution(store));
}

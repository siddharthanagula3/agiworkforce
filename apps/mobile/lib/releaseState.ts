/**
 * Mobile release-state registry (CRIT-007).
 *
 * The audit found distribution claims stated from memory rather than from
 * evidence: the app named "the Apple App Store" and "Google Play" as the owner
 * of a subscription, and handed the user a store link, while AGI has never had
 * a listing on either store (zero `v-mobile-*` release tags in this
 * repository). A user who tapped through reached a store account page for an
 * app the store has never heard of.
 *
 * The fix is not new copy. It is that NO module may assert a distribution fact
 * on its own any more. `lib/mobileReleaseState.json` is the single record, this
 * module is the only reader, and every accessor here FAILS CLOSED: it returns
 * `null` unless the registry both declares the store published AND carries the
 * store-assigned listing id that `scripts/release/verify-store-listings.mjs`
 * resolved against the live listing. Setting the status without the verified
 * id therefore changes nothing a user can see.
 *
 * Consumers today:
 *   - `src/features/billing/subscriptionSource.ts` — store name + management URL
 *   - `scripts/release/verify-store-listings.mjs`  — release gate
 *   - `__tests__/mobile-release-state.test.ts`     — invariants + cross-surface
 *   - `__tests__/store-availability-copy.test.ts`  — copy guard
 *
 * The website states the same fact in `apps/web/lib/marketing-constants.ts`
 * (`SURFACE_STATUS.mobile`); the registry test asserts the two agree, so the
 * two surfaces cannot describe mobile's availability differently.
 *
 * Pure module by `lib/` rules: no React state, no I/O, no platform APIs.
 */
import registryJson from './mobileReleaseState.json';

/** The mobile app stores AGI can be distributed through. */
export type MobileStoreId = 'apple' | 'google';

export type StoreDistributionStatus = 'unpublished' | 'published';

export interface StoreDistributionRecord {
  readonly store: MobileStoreId;
  /** `published` only after an automated check resolved the live listing. */
  readonly status: StoreDistributionStatus;
  /** Bundle identifier (Apple) / package name (Google) this app builds as. */
  readonly productionId: string;
  /** Store-assigned listing identity. Null until verified. */
  readonly listingId: string | null;
  /** Public listing URL. Null until verified. */
  readonly listingUrl: string | null;
  /** Native subscription-management URL. Null until verified. */
  readonly subscriptionManagementUrl: string | null;
  /** Why the status is what it is — re-check before changing it. */
  readonly evidence: string;
}

export interface MobileReleaseState {
  readonly surface: 'mobile';
  /**
   * Status wording shared with the website registry
   * (`COMING_SOON_LABEL` in `apps/web/lib/marketing-constants.ts`).
   */
  readonly statusLabel: string;
  /** True only when the mobile surface itself has shipped. */
  readonly released: boolean;
  readonly stores: Readonly<Record<MobileStoreId, StoreDistributionRecord>>;
}

/**
 * The JSON literal widens to `null`-typed fields, which would make every
 * `string | null` field impossible to populate later. One documented cast at
 * the boundary keeps the record shape honest for consumers.
 */
export const MOBILE_RELEASE_STATE = registryJson as unknown as MobileReleaseState;

export const MOBILE_STORE_IDS: readonly MobileStoreId[] = ['apple', 'google'];

/** Display names, used ONLY once a store's distribution is verified. */
const STORE_DISPLAY_NAMES: Readonly<Record<MobileStoreId, string>> = {
  apple: 'the Apple App Store',
  google: 'Google Play',
};

export function getStoreDistribution(store: MobileStoreId): StoreDistributionRecord {
  return MOBILE_RELEASE_STATE.stores[store];
}

/**
 * Fail-closed predicate. A store counts as a real distribution channel only
 * when the registry says published AND names the exact listing that was
 * verified. An unknown or half-filled record is treated as unpublished.
 */
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

/**
 * Public listing URL, or null. The URL must also name the verified listing id,
 * so a stale link left behind from an earlier draft cannot be served next to a
 * different id.
 */
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

/** Native subscription-management URL, or null while the store is unverified. */
export function storeSubscriptionManagementUrlOf(record: StoreDistributionRecord): string | null {
  if (!isStoreDistributionVerified(record)) return null;
  const url = record.subscriptionManagementUrl;
  if (typeof url !== 'string' || !url.startsWith('https://')) return null;
  return url;
}

export function storeSubscriptionManagementUrl(store: MobileStoreId): string | null {
  return storeSubscriptionManagementUrlOf(getStoreDistribution(store));
}

/**
 * The store's name, for copy that attributes something to it. Null while the
 * store is unverified — callers must fall back to wording that claims no
 * distribution channel.
 */
export function storeDisplayNameOf(record: StoreDistributionRecord): string | null {
  return isStoreDistributionVerified(record) ? STORE_DISPLAY_NAMES[record.store] : null;
}

export function storeDisplayName(store: MobileStoreId): string | null {
  return storeDisplayNameOf(getStoreDistribution(store));
}

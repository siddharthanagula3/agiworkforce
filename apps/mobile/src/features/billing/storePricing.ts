import type { Product, ProductSubscription, SubscriptionOffer } from 'expo-iap';
import type { MobileIapStoreOffer } from '@agiworkforce/types';

export type StoreProduct = Product | ProductSubscription;

export interface StorePrice {
  /** The store's own localized string, never assembled from a number and a code. */
  label: string | null;
  currency: string | null;
  /** The Android offer a purchase must use, so the price shown is the price charged. */
  offerToken: string | null;
}

export const UNPRICED: StorePrice = { label: null, currency: null, offerToken: null };

function isAndroidSubscription(product: StoreProduct): product is ProductSubscription & {
  platform: 'android';
  subscriptionOffers: SubscriptionOffer[];
} {
  return product.type === 'subs' && product.platform === 'android';
}

function pricingPhaseCount(offer: SubscriptionOffer): number {
  return offer.pricingPhasesAndroid?.pricingPhaseList?.length ?? 0;
}

/**
 * The offer a purchase will actually use, which is the one the server's catalog
 * names and never whichever the store happens to list first. Display and
 * purchase read this same function because Google prices per offer, not per
 * product, so picking them separately shows one price and charges another.
 *
 * A base plan with no offer is the entry on that base plan whose price has a
 * single phase; every discounted offer adds a phase in front of it.
 */
export function purchasableOffer(
  product: StoreProduct,
  configured: MobileIapStoreOffer | null | undefined,
): SubscriptionOffer | null {
  if (!isAndroidSubscription(product) || !configured) return null;
  const onBasePlan = product.subscriptionOffers.filter(
    (offer) =>
      offer.basePlanIdAndroid === configured.basePlanId &&
      typeof offer.offerTokenAndroid === 'string' &&
      offer.offerTokenAndroid.length > 0,
  );
  if (configured.offerId !== null) {
    return onBasePlan.find((offer) => offer.id === configured.offerId) ?? null;
  }
  const undiscounted = onBasePlan.filter((offer) => pricingPhaseCount(offer) <= 1);
  return undiscounted.length === 1 ? (undiscounted[0] ?? null) : null;
}

/**
 * The recurring price rather than the introductory one. A row that renders a
 * single figure beside a plan name is read as what the plan costs, and a trial
 * phase's "Free" there is a promise the second month breaks.
 */
function recurringPhasePrice(offer: SubscriptionOffer): string | null {
  const phases = offer.pricingPhasesAndroid?.pricingPhaseList ?? [];
  const paid = phases.filter((phase) => Number(phase.priceAmountMicros) > 0);
  const chosen = paid.at(-1) ?? phases.at(-1);
  const formatted = chosen?.formattedPrice?.trim();
  return formatted ? formatted : null;
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * The price to show for one store product. Returns no label rather than a
 * synthesised one: a figure built from `price` and `currency` is not the
 * store's localized string and would not match the confirmation sheet.
 */
export function storePrice(
  product: StoreProduct | undefined,
  configured?: MobileIapStoreOffer | null,
): StorePrice {
  if (!product) return UNPRICED;

  if (isAndroidSubscription(product)) {
    const offer = purchasableOffer(product, configured);
    if (!offer) return UNPRICED;
    return {
      label:
        recurringPhasePrice(offer) ??
        nonEmpty(offer.displayPrice) ??
        nonEmpty(product.displayPrice),
      currency: nonEmpty(offer.currency) ?? nonEmpty(product.currency),
      offerToken: offer.offerTokenAndroid ?? null,
    };
  }

  return {
    label: nonEmpty(product.displayPrice),
    currency: nonEmpty(product.currency),
    offerToken: null,
  };
}

export function isPriced(price: StorePrice): boolean {
  return price.label !== null;
}

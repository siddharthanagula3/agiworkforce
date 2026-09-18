import type { Product, ProductSubscription, SubscriptionOffer } from 'expo-iap';

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

/**
 * The offer a purchase will actually use. Display and purchase read this same
 * function because Google prices per offer, not per product, so picking them
 * separately shows one price and charges another.
 */
export function purchasableOffer(product: StoreProduct): SubscriptionOffer | null {
  if (!isAndroidSubscription(product)) return null;
  return (
    product.subscriptionOffers.find((offer) => typeof offer.offerTokenAndroid === 'string') ?? null
  );
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
export function storePrice(product: StoreProduct | undefined): StorePrice {
  if (!product) return UNPRICED;

  const offer = purchasableOffer(product);
  if (offer) {
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

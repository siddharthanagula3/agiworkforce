import type Stripe from 'stripe';

export const CHECKOUT_TAX_POLICY = {
  engine: 'stripe-tax',
  priceMode: 'exclusive',
  collectsBusinessTaxIds: true,
  requiresFullBillingAddress: true,
  persistsTaxIdentifiers: false,
} as const;

export const SESSION_TAX_FIELDS_NEVER_PERSISTED = [
  'customer_details.tax_ids',
  'customer_details.address',
] as const;

export type CheckoutTaxParams = Pick<
  Stripe.Checkout.SessionCreateParams,
  'automatic_tax' | 'tax_id_collection' | 'billing_address_collection' | 'customer_update'
>;

export function buildCheckoutTaxParams(options: {
  hasExistingCustomer: boolean;
}): CheckoutTaxParams {
  const params: CheckoutTaxParams = {
    automatic_tax: { enabled: true },
    tax_id_collection: { enabled: true },
    billing_address_collection: 'required',
  };

  if (options.hasExistingCustomer) {
    params.customer_update = { address: 'auto', name: 'auto' };
  }

  return params;
}

export interface SessionTaxOutcome {
  status: 'complete' | 'failed' | 'requires_location_inputs' | 'not_requested';
  calculated: boolean;
  taxAmountMinor: number | null;
  taxIdTypes: string[];
}

/**
 * Read the tax result off a Checkout Session so the webhook can act on a failed
 * calculation instead of provisioning silently.
 *
 * Only the tax-ID *type* is surfaced. The number itself is a regulated
 * identifier that belongs on the Stripe Customer, and logging it would put it
 * into log retention (see {@link SESSION_TAX_FIELDS_NEVER_PERSISTED}).
 */
export function describeSessionTax(session: Stripe.Checkout.Session): SessionTaxOutcome {
  const automaticTax = session.automatic_tax;
  const taxIdTypes: string[] = (session.customer_details?.tax_ids ?? [])
    .map((taxId) => String(taxId.type))
    .filter((type) => type.length > 0);

  if (!automaticTax?.enabled) {
    return { status: 'not_requested', calculated: false, taxAmountMinor: null, taxIdTypes };
  }

  if (automaticTax.status !== 'complete') {
    return {
      status: automaticTax.status === 'failed' ? 'failed' : 'requires_location_inputs',
      calculated: false,
      taxAmountMinor: null,
      taxIdTypes,
    };
  }

  return {
    status: 'complete',
    calculated: true,
    taxAmountMinor: session.total_details?.amount_tax ?? 0,
    taxIdTypes,
  };
}

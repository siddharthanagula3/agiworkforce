import type Stripe from 'stripe';

/**
 * The ONE place that decides how AGI Workforce charges tax.
 *
 * ## Policy
 *
 * Prices in `packages/contracts/types` and on `/pricing` are **tax-exclusive**:
 * they are the net amount, and sales tax / VAT / GST is added on top at
 * checkout. `/terms` §10 states exactly that ("Prices exclude taxes unless
 * stated otherwise; you are responsible for applicable sales, use, VAT, GST and
 * similar taxes, excluding taxes on our income"), so the product only tells the
 * truth if a tax line is actually calculated on the Checkout Session.
 *
 * ## Supported jurisdictions
 *
 * There is deliberately **no jurisdiction list in this repository**. The set of
 * places we charge tax in is the set of tax registrations on the Stripe
 * account, and Stripe Tax is the calculation engine
 * (https://docs.stripe.com/tax). A hardcoded country list here would be a
 * second, silently-stale copy of that registration list, and the two would
 * disagree the first time Finance adds a registration. Stripe's behaviour is:
 *
 * - Buyer located where the account holds a registration → tax is calculated
 *   and added to the Session total, then remitted against that registration.
 * - Buyer located anywhere else → zero tax is calculated, which is the correct
 *   outcome, not a failure.
 * - EU/UK/AU/… business buyer who enters a valid-format VAT/GST/ABN number →
 *   Stripe Tax applies reverse charge or the zero rate per local law. That is
 *   why {@link buildCheckoutTaxParams} enables `tax_id_collection`: without it
 *   a B2B buyer is charged VAT they should not pay.
 *
 * ## Data we keep
 *
 * None of it. The collected billing address, business name and tax ID live on
 * the Stripe Customer and on the Stripe invoice; this product stores only
 * `stripe_customer_id` / `stripe_subscription_id` / `stripe_price_id` and reads
 * the rest back from Stripe on demand (`lib/services/billing-invoice-service.ts`).
 * Copying a customer's tax identifiers or postal address into `public.*` would
 * add a regulated data class to this database for no product capability, so
 * {@link SESSION_TAX_FIELDS_NEVER_PERSISTED} names them and
 * `app/api/stripe-webhook/lib/__tests__/checkout-tax.test.ts` pins that the
 * webhook never writes them.
 *
 * ## Stripe requirements this encodes (verified against Stripe docs, 2026-08)
 *
 * - `automatic_tax.enabled` requires Stripe Tax to be active on the account
 *   with an origin address; Stripe then derives the rate from the buyer's
 *   location.
 * - `tax_id_collection.enabled` **with an existing `customer`** requires
 *   `customer_update.name = 'auto'`. Omitting it is not a soft failure: Stripe
 *   rejects the create call with "Tax ID collection requires updating business
 *   name on the customer. To enable tax ID collection for an existing customer,
 *   please set `customer_update[name]` to `auto`."
 *   (https://docs.stripe.com/tax/checkout/tax-ids — "Existing customers").
 * - `customer_update.address = 'auto'` lets the address the buyer types during
 *   checkout be saved on the Customer, which is what makes the NEXT renewal
 *   invoice taxable without asking again.
 * - `customer_update` may only be sent when a `customer` is supplied, so a
 *   first-time buyer with no Customer yet must not receive it.
 * - `billing_address_collection: 'required'` collects the FULL address rather
 *   than the minimum Stripe needs to pick a rate, because an EU/UK tax invoice
 *   has to carry the buyer's address.
 */
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

/**
 * Build the tax portion of a Checkout Session.
 *
 * @param options.hasExistingCustomer whether the create call will carry a
 * `customer` id. Stripe validates `customer_update` against that: sending it
 * without a customer is rejected, and omitting `customer_update.name` WITH a
 * customer is rejected too (see the class doc above). Both rejections are
 * `StripeInvalidRequestError`s at session-create time, i.e. the buyer never
 * reaches Stripe at all — so this flag decides whether checkout works, and is
 * not a nicety.
 */
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

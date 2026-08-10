/**
 * The tax parameters a Checkout Session is created with are not cosmetic: two
 * of Stripe's validation rules make an inconsistent combination a hard
 * `StripeInvalidRequestError` at create time, which the checkout route turns
 * into "Invalid checkout configuration. Please contact support." — i.e. nobody
 * can buy anything. These cases pin both rules and the policy they implement.
 */
import { describe, expect, it } from 'vitest';

import { CHECKOUT_TAX_POLICY, buildCheckoutTaxParams, describeSessionTax } from './tax-policy';

describe('buildCheckoutTaxParams', () => {
  it('asks Stripe Tax to calculate tax and to collect a business tax id', () => {
    expect(buildCheckoutTaxParams({ hasExistingCustomer: false })).toMatchObject({
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
    });
  });

  it('collects a full billing address so the tax invoice can carry one', () => {
    expect(buildCheckoutTaxParams({ hasExistingCustomer: true }).billing_address_collection).toBe(
      'required',
    );
  });

  it('sets customer_update.name for an existing customer, which Stripe REQUIRES with tax_id_collection', () => {
    // Without this, Stripe rejects the session outright:
    //   "Tax ID collection requires updating business name on the customer. To
    //    enable tax ID collection for an existing customer, please set
    //    `customer_update[name]` to `auto`."
    // Every returning buyer — and every first-time buyer, because the checkout
    // route creates the Stripe customer before the session — hits that path,
    // so omitting it is a total checkout outage, not a missing tax line.
    expect(buildCheckoutTaxParams({ hasExistingCustomer: true }).customer_update).toEqual({
      address: 'auto',
      name: 'auto',
    });
  });

  it('omits customer_update entirely when no customer is attached', () => {
    // Stripe rejects `customer_update` when the session carries no `customer`.
    expect(buildCheckoutTaxParams({ hasExistingCustomer: false }).customer_update).toBeUndefined();
  });

  it('keeps prices tax-exclusive, which is what /terms tells the customer', () => {
    expect(CHECKOUT_TAX_POLICY.priceMode).toBe('exclusive');
    expect(CHECKOUT_TAX_POLICY.persistsTaxIdentifiers).toBe(false);
  });
});

describe('describeSessionTax', () => {
  it('treats a completed calculation of zero as collected, not as a failure', () => {
    // A buyer outside every registered jurisdiction, or an EU business that
    // supplied a VAT number and gets reverse charge, is correctly taxed 0.
    const outcome = describeSessionTax({
      id: 'cs_1',
      automatic_tax: { enabled: true, status: 'complete' },
      total_details: { amount_tax: 0 },
      customer_details: { tax_ids: [{ type: 'eu_vat', value: 'DE123456789' }] },
    } as never);

    expect(outcome).toEqual({
      status: 'complete',
      calculated: true,
      taxAmountMinor: 0,
      taxIdTypes: ['eu_vat'],
    });
  });

  it('never surfaces the tax id VALUE, only its type', () => {
    const outcome = describeSessionTax({
      id: 'cs_2',
      automatic_tax: { enabled: true, status: 'complete' },
      total_details: { amount_tax: 400 },
      customer_details: { tax_ids: [{ type: 'gb_vat', value: 'GB123456789' }] },
    } as never);

    expect(JSON.stringify(outcome)).not.toContain('GB123456789');
    expect(outcome.taxAmountMinor).toBe(400);
  });

  it('reports a failed calculation as uncollected', () => {
    expect(
      describeSessionTax({
        id: 'cs_3',
        automatic_tax: { enabled: true, status: 'failed' },
        total_details: { amount_tax: 0 },
      } as never),
    ).toMatchObject({ status: 'failed', calculated: false, taxAmountMinor: null });
  });

  it('reports a missing buyer location as uncollected', () => {
    expect(
      describeSessionTax({
        id: 'cs_4',
        automatic_tax: { enabled: true, status: 'requires_location_inputs' },
      } as never),
    ).toMatchObject({ status: 'requires_location_inputs', calculated: false });
  });

  it('reports a session created without automatic tax at all', () => {
    // A session made outside this product's policy (dashboard, old code path).
    expect(
      describeSessionTax({ id: 'cs_5', automatic_tax: { enabled: false, status: null } } as never),
    ).toMatchObject({ status: 'not_requested', calculated: false });
    expect(describeSessionTax({ id: 'cs_6' } as never)).toMatchObject({
      status: 'not_requested',
      calculated: false,
    });
  });
});

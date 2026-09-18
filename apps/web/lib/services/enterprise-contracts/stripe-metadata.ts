import 'server-only';

import type { CommercialAgreement, ExecutedCommercialAgreement } from './types';

export const CONTRACT_METADATA_KEY_INCLUDED_USAGE_CENTS_PER_MONTH =
  'included_usage_cents_per_month';
export const CONTRACT_METADATA_KEY_OVERAGE_PRICE_ID = 'overage_price_id';
export const CONTRACT_METADATA_KEY_COMMITTED_USAGE_BLOCK_CENTS = 'committed_usage_block_cents';
export const CONTRACT_METADATA_KEY_MINIMUM_ANNUAL_SPEND_CENTS = 'minimum_annual_spend_cents';
export const CONTRACT_METADATA_KEY_SUPPORT_TIER = 'support_tier';
export const CONTRACT_METADATA_KEY_CUSTOMER_LEGAL_ENTITY = 'customer_legal_entity';
export const CONTRACT_METADATA_KEY_BILLING_CONTACT_NAME = 'billing_contact_name';
export const CONTRACT_METADATA_KEY_BILLING_CONTACT_EMAIL = 'billing_contact_email';
export const CONTRACT_METADATA_KEY_PROCUREMENT_CONTACT_NAME = 'procurement_contact_name';
export const CONTRACT_METADATA_KEY_PROCUREMENT_CONTACT_EMAIL = 'procurement_contact_email';
export const CONTRACT_METADATA_KEY_NET_TERMS_DAYS = 'net_terms_days';
export const CONTRACT_METADATA_KEY_PROCUREMENT_REFERENCE = 'po_number';
export const CONTRACT_METADATA_KEY_ORDER_FORM_REFERENCE = 'order_form_reference';
export const CONTRACT_METADATA_KEY_AGREEMENT_VERSION = 'commercial_agreement_version';
export const CONTRACT_METADATA_KEY_COMMITTED_SEATS = 'committed_seats';
export const CONTRACT_METADATA_KEY_PAYMENT_METHOD_POLICY = 'payment_method_policy';

const CASE_INSENSITIVE_KEYS: ReadonlySet<string> = new Set([
  CONTRACT_METADATA_KEY_BILLING_CONTACT_EMAIL,
  CONTRACT_METADATA_KEY_PROCUREMENT_CONTACT_EMAIL,
]);

function put(target: Record<string, string>, key: string, value: string | number | null): void {
  if (value === null) return;
  const text = String(value).trim();
  if (text === '') return;
  target[key] = text;
}

/**
 * The Stripe subscription metadata a signed agreement implies. Stripe is a
 * downstream copy of these values, so this function is the only place they are
 * written in Stripe's vocabulary.
 */
export function toStripeContractMetadata(
  agreement: ExecutedCommercialAgreement,
): Record<string, string> {
  const { terms, signature } = agreement;
  const metadata: Record<string, string> = {};
  put(metadata, CONTRACT_METADATA_KEY_CUSTOMER_LEGAL_ENTITY, terms.customerLegalEntity);
  put(metadata, CONTRACT_METADATA_KEY_COMMITTED_SEATS, terms.committedSeats);
  put(metadata, CONTRACT_METADATA_KEY_NET_TERMS_DAYS, terms.paymentTermsDays);
  put(metadata, CONTRACT_METADATA_KEY_PAYMENT_METHOD_POLICY, terms.paymentMethodPolicy);
  put(
    metadata,
    CONTRACT_METADATA_KEY_INCLUDED_USAGE_CENTS_PER_MONTH,
    terms.includedUsageCentsPerPeriod,
  );
  put(metadata, CONTRACT_METADATA_KEY_COMMITTED_USAGE_BLOCK_CENTS, terms.committedUsageBlockCents);
  put(metadata, CONTRACT_METADATA_KEY_MINIMUM_ANNUAL_SPEND_CENTS, terms.minimumAnnualSpendCents);
  put(metadata, CONTRACT_METADATA_KEY_OVERAGE_PRICE_ID, terms.overageStripePriceId);
  put(metadata, CONTRACT_METADATA_KEY_SUPPORT_TIER, terms.supportTier);
  put(metadata, CONTRACT_METADATA_KEY_PROCUREMENT_REFERENCE, terms.procurementReference);
  put(metadata, CONTRACT_METADATA_KEY_BILLING_CONTACT_NAME, terms.billingContact?.name ?? null);
  put(metadata, CONTRACT_METADATA_KEY_BILLING_CONTACT_EMAIL, terms.billingContact?.email ?? null);
  put(
    metadata,
    CONTRACT_METADATA_KEY_PROCUREMENT_CONTACT_NAME,
    terms.procurementContact?.name ?? null,
  );
  put(
    metadata,
    CONTRACT_METADATA_KEY_PROCUREMENT_CONTACT_EMAIL,
    terms.procurementContact?.email ?? null,
  );
  put(metadata, CONTRACT_METADATA_KEY_ORDER_FORM_REFERENCE, signature.orderFormReference);
  put(metadata, CONTRACT_METADATA_KEY_AGREEMENT_VERSION, agreement.version);
  return metadata;
}

export interface ContractMetadataComparison {
  /** Keys Stripe carries with a value the signed agreement does not state. */
  mismatched: string[];
  /** Keys the agreement states that Stripe has not been given yet. */
  missing: string[];
}

function sameValue(key: string, expected: string, actual: string): boolean {
  const left = expected.trim();
  const right = actual.trim();
  return CASE_INSENSITIVE_KEYS.has(key)
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

/**
 * Compares what Stripe holds against what was signed. A value typed into the
 * Stripe dashboard that disagrees with the agreement is reported, never adopted:
 * the agreement is the term, and Stripe is the copy that has drifted.
 */
export function compareStripeContractMetadata(
  agreement: ExecutedCommercialAgreement,
  providerMetadata: Readonly<Record<string, string | null | undefined>> | null | undefined,
): ContractMetadataComparison {
  const expected = toStripeContractMetadata(agreement);
  const mismatched: string[] = [];
  const missing: string[] = [];

  for (const [key, value] of Object.entries(expected)) {
    const actual = providerMetadata?.[key];
    if (actual === undefined || actual === null || actual.trim() === '') {
      missing.push(key);
      continue;
    }
    if (!sameValue(key, value, actual)) mismatched.push(key);
  }

  return { mismatched: mismatched.sort(), missing: missing.sort() };
}

export function agreementMetadataVersion(
  agreement: CommercialAgreement | null | undefined,
): string | null {
  return agreement ? String(agreement.version) : null;
}

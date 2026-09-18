import 'server-only';

export const ENTERPRISE_PAYMENT_METHOD_POLICIES = [
  'invoice_ach_wire',
  'invoice_ach_wire_card',
  'card_only',
] as const;

export type EnterprisePaymentMethodPolicy = (typeof ENTERPRISE_PAYMENT_METHOD_POLICIES)[number];

export const DEFAULT_ENTERPRISE_PAYMENT_METHOD_POLICY: EnterprisePaymentMethodPolicy =
  'invoice_ach_wire';

const ALLOWED_COLLECTION_METHODS: Readonly<
  Record<EnterprisePaymentMethodPolicy, readonly string[]>
> = {
  invoice_ach_wire: ['send_invoice'],
  invoice_ach_wire_card: ['send_invoice', 'charge_automatically'],
  card_only: ['charge_automatically'],
};

const ALLOWED_PAYMENT_METHOD_TYPES: Readonly<
  Record<EnterprisePaymentMethodPolicy, readonly string[]>
> = {
  invoice_ach_wire: ['ach_credit_transfer', 'ach_debit', 'us_bank_account', 'customer_balance'],
  invoice_ach_wire_card: [
    'ach_credit_transfer',
    'ach_debit',
    'us_bank_account',
    'customer_balance',
    'card',
  ],
  card_only: ['card'],
};

export function isEnterprisePaymentMethodPolicy(
  value: unknown,
): value is EnterprisePaymentMethodPolicy {
  return (
    typeof value === 'string' &&
    ENTERPRISE_PAYMENT_METHOD_POLICIES.includes(value as EnterprisePaymentMethodPolicy)
  );
}

export function allowedCollectionMethods(policy: EnterprisePaymentMethodPolicy): readonly string[] {
  return ALLOWED_COLLECTION_METHODS[policy];
}

export function allowedPaymentMethodTypes(
  policy: EnterprisePaymentMethodPolicy,
): readonly string[] {
  return ALLOWED_PAYMENT_METHOD_TYPES[policy];
}

export interface PaymentMethodViolation {
  collectionMethod: string | null;
  paymentMethodTypes: readonly string[];
}

/**
 * Which of an invoice's payment rails the signed agreement does not allow. An
 * enterprise that negotiated net terms on invoice has not agreed to be charged
 * a card, and an invoice configured to do it is a term breach worth naming
 * rather than a silent settlement.
 */
export function paymentMethodViolations(
  policy: EnterprisePaymentMethodPolicy,
  invoice: PaymentMethodViolation,
): string[] {
  const violations: string[] = [];
  const collection = invoice.collectionMethod?.trim();
  if (collection && !allowedCollectionMethods(policy).includes(collection)) {
    violations.push(`collection_method:${collection}`);
  }
  const allowedTypes = allowedPaymentMethodTypes(policy);
  for (const type of invoice.paymentMethodTypes) {
    const normalized = type.trim();
    if (normalized && !allowedTypes.includes(normalized)) {
      violations.push(`payment_method_type:${normalized}`);
    }
  }
  return violations;
}

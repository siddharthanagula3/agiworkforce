/**
 * Payment terms, invoice state and the checks an enterprise invoice has to pass
 * before it exists. The contract decides all of them, not the invoice.
 */

import { addDaysToContractDate, contractDaysBetween } from './contract-lifecycle';

export const DUE_ON_RECEIPT_DAYS = 0;

/** The NET terms the Order Form template offers; anything else is a custom term. */
export const STANDARD_NET_TERM_DAYS: readonly number[] = Object.freeze([0, 15, 30, 45, 60]);

export const MAX_PAYMENT_TERM_DAYS = 180;

export function isStandardNetTerm(days: number): boolean {
  return STANDARD_NET_TERM_DAYS.includes(days);
}

export function isPayableNetTerm(days: number): boolean {
  return Number.isInteger(days) && days >= 0 && days <= MAX_PAYMENT_TERM_DAYS;
}

export function paymentTermLabel(days: number): string {
  if (!isPayableNetTerm(days)) {
    throw new RangeError(`A payment term of ${days} days is outside what a contract may carry.`);
  }
  return days === DUE_ON_RECEIPT_DAYS ? 'Due on receipt' : `NET ${days}`;
}

/** The day an invoice finalized on a given date falls due under a NET term. */
export function invoiceDueDate(finalizedOnIsoDate: string, netTermDays: number): string {
  if (!isPayableNetTerm(netTermDays)) {
    throw new RangeError(`A payment term of ${netTermDays} days is not payable.`);
  }
  return addDaysToContractDate(finalizedOnIsoDate, netTermDays);
}

export const ENTERPRISE_INVOICE_STATES = [
  'draft',
  'open',
  'overdue',
  'partially_paid',
  'paid',
  'uncollectible',
  'void',
] as const;

export type EnterpriseInvoiceState = (typeof ENTERPRISE_INVOICE_STATES)[number];

/** States whose amounts no longer move; a correction to one is a new document. */
export const FINALIZED_INVOICE_STATES: readonly EnterpriseInvoiceState[] = Object.freeze([
  'open',
  'overdue',
  'partially_paid',
  'paid',
  'uncollectible',
  'void',
]);

export interface InvoicePosition {
  readonly finalized: boolean;
  readonly voided: boolean;
  readonly uncollectible: boolean;
  readonly amountDueCents: number;
  readonly amountPaidCents: number;
  readonly dueOnIsoDate: string | null;
}

/**
 * One invoice's state, derived from its amounts and its due date rather than
 * from a status string a provider may not have refreshed yet.
 */
export function resolveInvoiceState(
  position: InvoicePosition,
  asOfIsoDate: string,
): EnterpriseInvoiceState {
  if (position.voided) return 'void';
  if (!position.finalized) return 'draft';
  if (position.amountPaidCents >= position.amountDueCents && position.amountDueCents >= 0) {
    return 'paid';
  }
  if (position.uncollectible) return 'uncollectible';
  const overdue =
    position.dueOnIsoDate !== null && contractDaysBetween(position.dueOnIsoDate, asOfIsoDate) > 0;
  if (position.amountPaidCents > 0) return overdue ? 'overdue' : 'partially_paid';
  return overdue ? 'overdue' : 'open';
}

export function invoiceOutstandingCents(position: InvoicePosition): number {
  if (position.voided) return 0;
  return Math.max(0, position.amountDueCents - position.amountPaidCents);
}

export const INVOICE_REFUSAL_REASONS = [
  'contract_not_in_force',
  'purchase_order_required',
  'invoice_recipient_missing',
  'negotiated_rate_missing',
  'payment_method_not_permitted',
  'currency_not_contracted',
] as const;

export type InvoiceRefusalReason = (typeof INVOICE_REFUSAL_REASONS)[number];

export interface InvoiceIssuanceTerms {
  readonly contractInForce: boolean;
  readonly purchaseOrderRequired: boolean;
  readonly purchaseOrderNumber: string | null;
  readonly invoiceRecipientEmails: readonly string[];
  readonly negotiatedRateCents: number | null;
  readonly billingCurrency: string;
  readonly permittedPaymentMethods: readonly string[];
}

export interface InvoiceIssuanceRequest {
  readonly currency: string;
  readonly collectionMethod: string | null;
  readonly paymentMethodTypes: readonly string[];
}

/**
 * Why an invoice must not be created. An empty list is the only thing that
 * permits one, so a missing PO number stops the invoice rather than printing
 * blank on it.
 */
export function invoiceIssuanceRefusals(
  terms: InvoiceIssuanceTerms,
  request: InvoiceIssuanceRequest,
): InvoiceRefusalReason[] {
  const refusals: InvoiceRefusalReason[] = [];
  if (!terms.contractInForce) refusals.push('contract_not_in_force');
  if (terms.purchaseOrderRequired && !(terms.purchaseOrderNumber ?? '').trim()) {
    refusals.push('purchase_order_required');
  }
  if (terms.invoiceRecipientEmails.filter((email) => email.trim().length > 0).length === 0) {
    refusals.push('invoice_recipient_missing');
  }
  if (terms.negotiatedRateCents === null || terms.negotiatedRateCents <= 0) {
    refusals.push('negotiated_rate_missing');
  }
  if (request.currency.trim().toLowerCase() !== terms.billingCurrency.trim().toLowerCase()) {
    refusals.push('currency_not_contracted');
  }
  const method = (request.collectionMethod ?? '').trim();
  if (method && !terms.permittedPaymentMethods.includes(method)) {
    refusals.push('payment_method_not_permitted');
  }
  for (const type of request.paymentMethodTypes) {
    const normalized = type.trim();
    if (normalized && !terms.permittedPaymentMethods.includes(normalized)) {
      refusals.push('payment_method_not_permitted');
      break;
    }
  }
  return refusals;
}

export const INVOICE_CORRECTIONS = ['void', 'mark_uncollectible', 'credit_note'] as const;

export type InvoiceCorrection = (typeof INVOICE_CORRECTIONS)[number];

/**
 * How a finalized invoice may still be corrected. Editing its amount is not on
 * the list, because the document the customer holds cannot be rewritten.
 */
export function allowedInvoiceCorrections(state: EnterpriseInvoiceState): InvoiceCorrection[] {
  if (state === 'void' || state === 'paid') return [];
  if (state === 'draft') return [];
  if (state === 'uncollectible') return ['credit_note'];
  return ['void', 'mark_uncollectible', 'credit_note'];
}

export function isInvoiceAmountMutable(state: EnterpriseInvoiceState): boolean {
  return !FINALIZED_INVOICE_STATES.includes(state);
}

export const OFFLINE_PAYMENT_METHODS = ['ach_credit_transfer', 'wire', 'check'] as const;

export type OfflinePaymentMethod = (typeof OFFLINE_PAYMENT_METHODS)[number];

export function isOfflinePaymentMethod(value: unknown): value is OfflinePaymentMethod {
  return (
    typeof value === 'string' && OFFLINE_PAYMENT_METHODS.includes(value as OfflinePaymentMethod)
  );
}

export const OFFLINE_PAYMENT_REFUSALS = [
  'invoice_not_finalized',
  'invoice_voided',
  'amount_exceeds_outstanding',
  'amount_not_positive',
  'method_not_permitted',
] as const;

export type OfflinePaymentRefusal = (typeof OFFLINE_PAYMENT_REFUSALS)[number];

/**
 * Whether an operator may record a bank transfer against an invoice. The amount
 * can never exceed what is outstanding, so a re-keyed remittance cannot
 * overpay a contract into credit nobody agreed to.
 */
export function offlinePaymentRefusal(input: {
  readonly state: EnterpriseInvoiceState;
  readonly outstandingCents: number;
  readonly amountCents: number;
  readonly method: OfflinePaymentMethod;
  readonly permittedPaymentMethods: readonly string[];
}): OfflinePaymentRefusal | null {
  if (input.state === 'void') return 'invoice_voided';
  if (input.state === 'draft') return 'invoice_not_finalized';
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) return 'amount_not_positive';
  if (input.amountCents > input.outstandingCents) return 'amount_exceeds_outstanding';
  if (!input.permittedPaymentMethods.includes(input.method)) return 'method_not_permitted';
  return null;
}

import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  commercialContractView,
  contractInvoiceTerms,
  invoiceDueDate,
  invoiceIssuanceRefusals,
  invoiceOutstandingCents,
  isOfflinePaymentMethod,
  OFFLINE_PAYMENT_METHODS,
  offlinePaymentRefusal,
  resolveInvoiceState,
  type CommercialContractView,
  type EnterpriseInvoiceState,
  type InvoiceIssuanceRequest,
  type InvoiceRefusalReason,
  type OfflinePaymentMethod,
} from '@agiworkforce/types';

import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';

import { allowedCollectionMethods, allowedPaymentMethodTypes } from './payment-methods';
import { agreementLifecycleState, type CommercialAgreement } from './types';

const AUDIT_ENDPOINT = '/api/settings/organization/billing-contract';
const AUDIT_SURFACE = 'enterprise_contracts';
const OFFLINE_PAYMENT_AUDIT_REASON = 'enterprise_offline_payment_reported';

/** Every rail the signed agreement permits, collection method and instrument alike. */
export function permittedPaymentMethods(agreement: CommercialAgreement): readonly string[] {
  const policy = agreement.terms.paymentMethodPolicy;
  return [...allowedCollectionMethods(policy), ...allowedPaymentMethodTypes(policy)];
}

/**
 * Which bank rails an operator may settle this contract on. A card-only
 * agreement settles no transfer, because nobody agreed to be invoiced.
 */
export function permittedOfflineMethods(
  agreement: CommercialAgreement,
): readonly OfflinePaymentMethod[] {
  return allowedCollectionMethods(agreement.terms.paymentMethodPolicy).includes('send_invoice')
    ? OFFLINE_PAYMENT_METHODS
    : [];
}

export function contractViewOf(
  agreement: CommercialAgreement,
  asOfDate: string,
): CommercialContractView {
  const { terms } = agreement;
  return commercialContractView({
    identity: {
      organizationId: agreement.organizationId,
      version: agreement.version,
      state: agreementLifecycleState(agreement),
      changeKind: agreement.changeKind,
      orderFormReference: agreement.signature?.orderFormReference ?? null,
      signedAt: agreement.signature?.signedAt ?? null,
      supersedesVersion: agreement.supersedesVersion,
    },
    window: {
      termStart: terms.contractTermStart,
      termEnd: terms.contractTermEnd,
      expiryGraceDays: terms.expiryGraceDays,
    },
    commercials: {
      committedSeats: terms.committedSeats,
      seatUnitPriceCents: terms.seatUnitPriceCents,
      includedUsageCentsPerPeriod: terms.includedUsageCentsPerPeriod,
      committedUsageBlockCents: terms.committedUsageBlockCents,
      minimumAnnualSpendCents: terms.minimumAnnualSpendCents,
      meteredUsage: terms.overageStripePriceId !== null,
      billingCurrency: terms.billingCurrency,
    },
    procurement: {
      paymentTermDays: terms.paymentTermsDays,
      purchaseOrderRequired: terms.purchaseOrderRequired,
      purchaseOrderNumber: terms.procurementReference,
      invoiceRecipientEmails: terms.invoiceRecipientEmails,
      permittedPaymentMethods: permittedPaymentMethods(agreement),
    },
    asOfDate,
  });
}

export function invoiceRefusalsFor(
  agreement: CommercialAgreement,
  request: InvoiceIssuanceRequest,
  asOfDate: string,
): InvoiceRefusalReason[] {
  return invoiceIssuanceRefusals(
    contractInvoiceTerms(contractViewOf(agreement, asOfDate)),
    request,
  );
}

/**
 * Refuses an enterprise invoice the contract does not permit. A missing PO
 * number stops the invoice here rather than printing blank on it and being
 * rejected by the customer's accounts payable.
 */
export function assertInvoiceIssuable(
  agreement: CommercialAgreement,
  request: InvoiceIssuanceRequest,
  asOfDate: string,
): void {
  const refusals = invoiceRefusalsFor(agreement, request, asOfDate);
  if (refusals.length === 0) return;
  throw createError.validation(
    'This invoice cannot be issued under the signed agreement.',
    refusals,
  );
}

export function contractInvoiceDueDate(
  agreement: CommercialAgreement,
  finalizedOnIsoDate: string,
): string {
  return invoiceDueDate(finalizedOnIsoDate, agreement.terms.paymentTermsDays);
}

export interface EnterpriseInvoicePosition {
  stripeInvoiceId: string;
  invoiceNumber: string | null;
  currency: string;
  amountDueCents: number;
  providerPaidCents: number;
  /** Transfers finance matched to the bank; these settle the invoice. */
  reconciledOfflineCents: number;
  /** Transfers the workspace says it sent; these settle nothing yet. */
  reportedOfflineCents: number;
  outstandingCents: number;
  state: EnterpriseInvoiceState;
  dueOn: string | null;
}

interface InvoiceRow {
  stripe_invoice_id: string;
  invoice_number: string | null;
  status: string;
  currency: string;
  amount_due_cents: number | string;
  amount_paid_cents: number | string;
  due_at: string | Date | null;
  voided_at: string | Date | null;
}

function isoDateOrNull(value: string | Date | null): string | null {
  if (value === null) return null;
  return (value instanceof Date ? value.toISOString() : value).slice(0, 10);
}

/**
 * What each invoice still owes. A transfer counts only once finance has
 * matched it to the bank, so a workspace cannot settle its own invoice by
 * reporting a payment, and the invoice row itself is never rewritten.
 */
export async function readEnterpriseInvoicePositions(
  db: DatabaseAdapter,
  organizationId: string,
  asOfDate: string,
  limit = 24,
): Promise<EnterpriseInvoicePosition[]> {
  const rows = await db.query<
    InvoiceRow & {
      reconciled_offline_cents: number | string | null;
      reported_offline_cents: number | string | null;
    }
  >(
    `select i.stripe_invoice_id, i.invoice_number, i.status, i.currency, i.amount_due_cents,
            i.amount_paid_cents, i.due_at, i.voided_at,
            coalesce(sum(o.amount_cents) filter (where o.reconciled_at is not null), 0)
              as reconciled_offline_cents,
            coalesce(sum(o.amount_cents) filter (where o.reconciled_at is null), 0)
              as reported_offline_cents
       from public.organization_billing_invoices i
       left join public.enterprise_offline_payment_records o
              on o.stripe_invoice_id = i.stripe_invoice_id
      where i.organization_id = $1::uuid
      group by i.stripe_invoice_id, i.invoice_number, i.status, i.currency, i.amount_due_cents,
               i.amount_paid_cents, i.due_at, i.voided_at
      order by i.created_at desc
      limit $2::integer`,
    [organizationId, limit],
  );

  return rows.map((row) => {
    const reconciledOfflineCents = Number(row.reconciled_offline_cents ?? 0);
    const position = {
      finalized: row.status !== 'draft',
      voided: row.voided_at !== null,
      uncollectible: row.status === 'uncollectible',
      amountDueCents: Number(row.amount_due_cents),
      amountPaidCents: Number(row.amount_paid_cents) + reconciledOfflineCents,
      dueOnIsoDate: isoDateOrNull(row.due_at),
    };
    return {
      stripeInvoiceId: row.stripe_invoice_id,
      invoiceNumber: row.invoice_number,
      currency: row.currency,
      amountDueCents: position.amountDueCents,
      providerPaidCents: Number(row.amount_paid_cents),
      reconciledOfflineCents,
      reportedOfflineCents: Number(row.reported_offline_cents ?? 0),
      outstandingCents: invoiceOutstandingCents(position),
      state: resolveInvoiceState(position, asOfDate),
      dueOn: position.dueOnIsoDate,
    };
  });
}

export interface ReportOfflinePaymentInput {
  organizationId: string;
  stripeInvoiceId: string;
  method: OfflinePaymentMethod;
  amountCents: number;
  remittanceReference: string;
  receivedOn: string;
  reportedBy: string;
  note?: string | null;
}

export interface OfflinePaymentRecord {
  id: string;
  stripeInvoiceId: string;
  method: OfflinePaymentMethod;
  amountCents: number;
  currency: string;
  remittanceReference: string;
  receivedOn: string;
  reportedBy: string;
  reconciledAt: string | null;
  createdAt: string;
}

interface OfflinePaymentRow {
  id: string;
  stripe_invoice_id: string;
  method: string;
  amount_cents: number | string;
  currency: string;
  remittance_reference: string;
  received_on: string | Date;
  reported_by: string;
  reconciled_at: string | Date | null;
  created_at: string | Date;
}

function toOfflinePaymentRecord(row: OfflinePaymentRow): OfflinePaymentRecord {
  if (!isOfflinePaymentMethod(row.method)) {
    throw new Error(`Offline payment ${row.id} carries an unknown method.`);
  }
  return {
    id: row.id,
    stripeInvoiceId: row.stripe_invoice_id,
    method: row.method,
    amountCents: Number(row.amount_cents),
    currency: row.currency,
    remittanceReference: row.remittance_reference,
    receivedOn: isoDateOrNull(row.received_on) ?? '',
    reportedBy: row.reported_by,
    reconciledAt:
      row.reconciled_at instanceof Date ? row.reconciled_at.toISOString() : row.reconciled_at,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

const OFFLINE_PAYMENT_COLUMNS = `id, stripe_invoice_id, method, amount_cents, currency,
       remittance_reference, received_on, reported_by, reconciled_at, created_at`;

export interface OfflinePaymentOutcome {
  /** False when this remittance had already been reported against this invoice. */
  recorded: boolean;
  payment: OfflinePaymentRecord;
  position: EnterpriseInvoicePosition;
}

/**
 * Reports a bank transfer against an enterprise invoice. The same remittance
 * reference reported twice writes once, and nothing here settles the invoice:
 * finance reconciles the report against the bank before it counts.
 */
export async function reportOfflinePayment(
  db: DatabaseAdapter,
  agreement: CommercialAgreement,
  input: ReportOfflinePaymentInput,
  asOfDate: string,
): Promise<OfflinePaymentOutcome> {
  const reference = input.remittanceReference.trim();
  if (reference === '') {
    throw createError.validation(
      'A reported transfer has to carry the bank reference it came in under.',
    );
  }

  const positions = await readEnterpriseInvoicePositions(db, input.organizationId, asOfDate, 200);
  const position = positions.find(
    (candidate) => candidate.stripeInvoiceId === input.stripeInvoiceId,
  );
  if (!position) {
    throw createError.notFound('That invoice does not belong to this workspace.');
  }

  const existing = await db.query<OfflinePaymentRow>(
    `select ${OFFLINE_PAYMENT_COLUMNS}
       from public.enterprise_offline_payment_records
      where organization_id = $1::uuid
        and stripe_invoice_id = $2
        and remittance_reference = $3
      limit 1`,
    [input.organizationId, input.stripeInvoiceId, reference],
  );
  const already = existing[0];
  if (already) {
    return { recorded: false, payment: toOfflinePaymentRecord(already), position };
  }

  const refusal = offlinePaymentRefusal({
    state: position.state,
    outstandingCents: position.outstandingCents,
    amountCents: input.amountCents,
    method: input.method,
    permittedPaymentMethods: permittedOfflineMethods(agreement),
  });
  if (refusal !== null) {
    throw createError.conflict(`This transfer cannot be applied to the invoice: ${refusal}.`);
  }

  const [row] = await db.query<OfflinePaymentRow>(
    `insert into public.enterprise_offline_payment_records
       (organization_id, stripe_invoice_id, method, amount_cents, currency, remittance_reference,
        received_on, reported_by, note)
     values ($1::uuid, $2::text, $3::text, $4::bigint, $5::text, $6::text, $7::date, $8::text,
             $9::text)
     on conflict (stripe_invoice_id, remittance_reference) do nothing
     returning ${OFFLINE_PAYMENT_COLUMNS}`,
    [
      input.organizationId,
      input.stripeInvoiceId,
      input.method,
      input.amountCents,
      position.currency,
      reference,
      input.receivedOn,
      input.reportedBy,
      input.note ?? null,
    ],
  );

  if (!row) {
    const [raced] = await db.query<OfflinePaymentRow>(
      `select ${OFFLINE_PAYMENT_COLUMNS}
         from public.enterprise_offline_payment_records
        where organization_id = $1::uuid
          and stripe_invoice_id = $2
          and remittance_reference = $3
        limit 1`,
      [input.organizationId, input.stripeInvoiceId, reference],
    );
    if (!raced) {
      throw createError.internal('The transfer could not be reported against the invoice.');
    }
    return { recorded: false, payment: toOfflinePaymentRecord(raced), position };
  }

  const payment = toOfflinePaymentRecord(row);
  logger.info(
    {
      organizationId: input.organizationId,
      invoiceId: input.stripeInvoiceId,
      method: payment.method,
    },
    'Bank transfer reported against an enterprise invoice, pending reconciliation',
  );
  await recordAuditEvent({
    organizationId: input.organizationId,
    userId: input.reportedBy,
    eventType: 'plan_changed',
    severity: 'info',
    endpoint: AUDIT_ENDPOINT,
    surface: AUDIT_SURFACE,
    detail: {
      resourceType: 'organization_billing_invoice',
      resourceId: input.stripeInvoiceId,
      reason: OFFLINE_PAYMENT_AUDIT_REASON,
      status: payment.method,
      changedKeys: [payment.remittanceReference],
    },
  });

  const updated = await readEnterpriseInvoicePositions(db, input.organizationId, asOfDate, 200);
  return {
    recorded: true,
    payment,
    position:
      updated.find((candidate) => candidate.stripeInvoiceId === input.stripeInvoiceId) ?? position,
  };
}

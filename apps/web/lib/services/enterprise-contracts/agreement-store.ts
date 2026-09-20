import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  applyContractEvent,
  authoredVersionState,
  changeKindForEvent,
  type ContractChangeKind,
  type ContractLifecycleEvent,
} from '@agiworkforce/types';

import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';

import { isEnterprisePaymentMethodPolicy } from './payment-methods';
import {
  agreementLifecycleState,
  isExecutedAgreement,
  type CommercialAgreement,
  type CommercialAgreementSignature,
  type CommercialAgreementStatus,
  type CommercialAgreementTerms,
} from './types';

const AUDIT_ENDPOINT = '/api/enterprise/commercial-agreements';
const AUDIT_SURFACE = 'enterprise_contracts';
const AGREEMENT_AUTHORED_AUDIT_REASON = 'commercial_agreement_version_authored';
const AGREEMENT_TERMINATED_AUDIT_REASON = 'commercial_agreement_terminated';

const AGREEMENT_COLUMNS = `id, organization_id, version, status, order_form_reference,
       signature_provider, signature_envelope_id, signed_at, signed_by_name, signed_by_email,
       customer_legal_entity, committed_seats, seat_unit_price_cents, billing_cadence,
       billing_currency, contract_term_start, contract_term_end, expiry_grace_days,
       payment_terms_days, payment_method_policy, purchase_order_required,
       invoice_recipient_emails, included_usage_cents_per_period, committed_usage_block_cents,
       minimum_annual_spend_cents, overage_stripe_price_id, support_tier, procurement_reference,
       billing_contact_name, billing_contact_email, procurement_contact_name,
       procurement_contact_email, tax_exempt_status, amendment_reason, change_kind,
       supersedes_version, authored_by, superseded_at, terminated_at, termination_reason,
       created_at`;

interface AgreementRow {
  id: string;
  organization_id: string;
  version: number | string;
  status: CommercialAgreementStatus;
  order_form_reference: string | null;
  signature_provider: CommercialAgreementSignature['provider'] | null;
  signature_envelope_id: string | null;
  signed_at: string | Date | null;
  signed_by_name: string | null;
  signed_by_email: string | null;
  customer_legal_entity: string;
  committed_seats: number | string;
  seat_unit_price_cents: number | string | null;
  billing_cadence: CommercialAgreementTerms['billingCadence'];
  billing_currency: string;
  contract_term_start: string | Date;
  contract_term_end: string | Date;
  expiry_grace_days: number | string;
  payment_terms_days: number | string;
  payment_method_policy: string;
  purchase_order_required: boolean;
  invoice_recipient_emails: string[] | null;
  included_usage_cents_per_period: number | string;
  committed_usage_block_cents: number | string;
  minimum_annual_spend_cents: number | string;
  overage_stripe_price_id: string | null;
  support_tier: string | null;
  procurement_reference: string | null;
  billing_contact_name: string | null;
  billing_contact_email: string | null;
  procurement_contact_name: string | null;
  procurement_contact_email: string | null;
  tax_exempt_status: CommercialAgreementTerms['taxExemptStatus'];
  amendment_reason: string | null;
  change_kind: ContractChangeKind;
  supersedes_version: number | string | null;
  authored_by: string | null;
  superseded_at: string | Date | null;
  terminated_at: string | Date | null;
  termination_reason: string | null;
  created_at: string | Date;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function isoOrNull(value: string | Date | null): string | null {
  return value === null ? null : iso(value);
}

function isoDate(value: string | Date): string {
  return iso(value).slice(0, 10);
}

function contactOrNull(name: string | null, email: string | null) {
  return name || email ? { name, email } : null;
}

export function toCommercialAgreement(row: AgreementRow): CommercialAgreement {
  const policy = row.payment_method_policy;
  if (!isEnterprisePaymentMethodPolicy(policy)) {
    throw new Error(`Commercial agreement ${row.id} carries an unknown payment method policy.`);
  }

  const signedAt = isoOrNull(row.signed_at);
  const seatUnitPriceCents = row.seat_unit_price_cents;
  return {
    id: row.id,
    organizationId: row.organization_id,
    version: Number(row.version),
    status: row.status,
    changeKind: row.change_kind,
    supersedesVersion: row.supersedes_version === null ? null : Number(row.supersedes_version),
    terms: {
      customerLegalEntity: row.customer_legal_entity,
      committedSeats: Number(row.committed_seats),
      seatUnitPriceCents: seatUnitPriceCents === null ? null : Number(seatUnitPriceCents),
      billingCadence: row.billing_cadence,
      billingCurrency: row.billing_currency,
      contractTermStart: isoDate(row.contract_term_start),
      contractTermEnd: isoDate(row.contract_term_end),
      expiryGraceDays: Number(row.expiry_grace_days),
      paymentTermsDays: Number(row.payment_terms_days),
      paymentMethodPolicy: policy,
      purchaseOrderRequired: row.purchase_order_required === true,
      invoiceRecipientEmails: row.invoice_recipient_emails ?? [],
      includedUsageCentsPerPeriod: Number(row.included_usage_cents_per_period),
      committedUsageBlockCents: Number(row.committed_usage_block_cents),
      minimumAnnualSpendCents: Number(row.minimum_annual_spend_cents),
      overageStripePriceId: row.overage_stripe_price_id,
      supportTier: row.support_tier,
      procurementReference: row.procurement_reference,
      billingContact: contactOrNull(row.billing_contact_name, row.billing_contact_email),
      procurementContact: contactOrNull(
        row.procurement_contact_name,
        row.procurement_contact_email,
      ),
      taxExemptStatus: row.tax_exempt_status,
    },
    signature:
      row.order_form_reference && row.signature_provider && signedAt
        ? {
            orderFormReference: row.order_form_reference,
            provider: row.signature_provider,
            envelopeId: row.signature_envelope_id,
            signedAt,
            signerName: row.signed_by_name,
            signerEmail: row.signed_by_email,
          }
        : null,
    amendmentReason: row.amendment_reason,
    authoredBy: row.authored_by,
    supersededAt: isoOrNull(row.superseded_at),
    terminatedAt: isoOrNull(row.terminated_at),
    terminationReason: row.termination_reason,
    createdAt: iso(row.created_at),
  };
}

export async function readCurrentCommercialAgreement(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<CommercialAgreement | null> {
  const [row] = await db.query<AgreementRow>(
    `select ${AGREEMENT_COLUMNS}
       from public.organization_commercial_agreements
      where organization_id = $1::uuid
        and superseded_at is null
      order by version desc
      limit 1`,
    [organizationId],
  );
  return row ? toCommercialAgreement(row) : null;
}

export async function readCommercialAgreementHistory(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<CommercialAgreement[]> {
  const rows = await db.query<AgreementRow>(
    `select ${AGREEMENT_COLUMNS}
       from public.organization_commercial_agreements
      where organization_id = $1::uuid
      order by version desc`,
    [organizationId],
  );
  return rows.map(toCommercialAgreement);
}

export async function readAgreementByEnvelope(
  db: DatabaseAdapter,
  organizationId: string,
  envelopeId: string,
): Promise<CommercialAgreement | null> {
  const [row] = await db.query<AgreementRow>(
    `select ${AGREEMENT_COLUMNS}
       from public.organization_commercial_agreements
      where organization_id = $1::uuid
        and signature_envelope_id = $2
      order by version desc
      limit 1`,
    [organizationId, envelopeId],
  );
  return row ? toCommercialAgreement(row) : null;
}

export interface AuthorCommercialAgreementInput {
  organizationId: string;
  terms: CommercialAgreementTerms;
  signature?: CommercialAgreementSignature | null;
  status?: CommercialAgreementStatus;
  amendmentReason?: string | null;
  authoredBy?: string | null;
  /** Which lifecycle event authors this version; omitted for the first one. */
  event?: Extract<ContractLifecycleEvent, 'amend' | 'renew'>;
}

function refuse(message: string): never {
  throw createError.conflict(message);
}

/**
 * Writes a new version of a workspace's Order Form. An amendment never edits the
 * row it replaces: the prior version is marked superseded with its terms intact,
 * and the new terms land at version n+1, so the agreement history is the record
 * of what was agreed and when.
 */
export async function authorCommercialAgreementVersion(
  db: DatabaseAdapter,
  input: AuthorCommercialAgreementInput,
): Promise<CommercialAgreement> {
  const { organizationId, terms } = input;
  const status: CommercialAgreementStatus =
    input.status ?? (input.signature ? 'executed' : 'draft');
  if (status === 'executed' && !input.signature) {
    throw new Error('An executed commercial agreement must carry a signed order reference.');
  }
  if (status === 'executed' && authoredVersionState(true) !== 'executed') {
    throw new Error('An executed version must be authored from a signature.');
  }

  return db.transaction(async (tx) => {
    const current = await readCurrentCommercialAgreement(tx, organizationId);
    const event = input.event ?? null;
    let changeKind: ContractChangeKind = 'initial';

    if (current) {
      const state = agreementLifecycleState(current);
      if (event === null) {
        refuse(
          'This workspace already has a commercial agreement; a new version has to be recorded as an amendment or a renewal.',
        );
      }
      const transition = applyContractEvent(state, event);
      if (!transition.allowed) {
        refuse(
          `A ${event === 'amend' ? 'n amendment' : ' renewal'} cannot be recorded against an agreement that is ${state} (${transition.refusal}).`,
        );
      }
      changeKind = changeKindForEvent(event) ?? 'initial';
      await tx.execute(
        `update public.organization_commercial_agreements
            set superseded_at = now(),
                status = case when status = 'executed' then 'superseded' else status end
          where organization_id = $1::uuid
            and superseded_at is null`,
        [organizationId],
      );
    } else if (event !== null) {
      refuse('There is no agreement to amend or renew for this workspace.');
    }

    const [highest] = await tx.query<{ highest: number | string | null }>(
      `select max(version) as highest
         from public.organization_commercial_agreements
        where organization_id = $1::uuid`,
      [organizationId],
    );
    const nextVersion = Number(highest?.highest ?? 0) + 1;

    const [row] = await tx.query<AgreementRow>(
      `insert into public.organization_commercial_agreements
         (organization_id, version, status, order_form_reference, signature_provider,
          signature_envelope_id, signed_at, signed_by_name, signed_by_email, customer_legal_entity,
          committed_seats, seat_unit_price_cents, billing_cadence, billing_currency,
          contract_term_start, contract_term_end, expiry_grace_days, payment_terms_days,
          payment_method_policy, purchase_order_required, invoice_recipient_emails,
          included_usage_cents_per_period, committed_usage_block_cents, minimum_annual_spend_cents,
          overage_stripe_price_id, support_tier, procurement_reference, billing_contact_name,
          billing_contact_email, procurement_contact_name, procurement_contact_email,
          tax_exempt_status, amendment_reason, change_kind, supersedes_version, authored_by)
       values ($1::uuid, $2::integer, $3::text, $4::text, $5::text, $6::text, $7::timestamptz,
               $8::text, $9::text, $10::text, $11::integer, $12::bigint, $13::text, $14::text,
               $15::date, $16::date, $17::integer, $18::integer, $19::text, $20::boolean,
               $21::text[], $22::bigint, $23::bigint, $24::bigint, $25::text, $26::text, $27::text,
               $28::text, $29::text, $30::text, $31::text, $32::text, $33::text, $34::text,
               $35::integer, $36::text)
       returning ${AGREEMENT_COLUMNS}`,
      [
        organizationId,
        nextVersion,
        status,
        input.signature?.orderFormReference ?? null,
        input.signature?.provider ?? null,
        input.signature?.envelopeId ?? null,
        input.signature?.signedAt ?? null,
        input.signature?.signerName ?? null,
        input.signature?.signerEmail ?? null,
        terms.customerLegalEntity,
        terms.committedSeats,
        terms.seatUnitPriceCents,
        terms.billingCadence,
        terms.billingCurrency,
        terms.contractTermStart,
        terms.contractTermEnd,
        terms.expiryGraceDays,
        terms.paymentTermsDays,
        terms.paymentMethodPolicy,
        terms.purchaseOrderRequired,
        terms.invoiceRecipientEmails,
        terms.includedUsageCentsPerPeriod,
        terms.committedUsageBlockCents,
        terms.minimumAnnualSpendCents,
        terms.overageStripePriceId,
        terms.supportTier,
        terms.procurementReference,
        terms.billingContact?.name ?? null,
        terms.billingContact?.email ?? null,
        terms.procurementContact?.name ?? null,
        terms.procurementContact?.email ?? null,
        terms.taxExemptStatus,
        input.amendmentReason ?? null,
        changeKind,
        current?.version ?? null,
        input.authoredBy ?? null,
      ],
    );

    if (!row) {
      throw new Error('The commercial agreement version could not be written.');
    }

    const agreement = toCommercialAgreement(row);
    logger.info(
      {
        organizationId,
        version: agreement.version,
        status: agreement.status,
        changeKind: agreement.changeKind,
      },
      'Commercial agreement version authored',
    );
    await recordAuditEvent({
      organizationId,
      userId: input.authoredBy ?? null,
      eventType: 'plan_changed',
      severity: 'info',
      endpoint: AUDIT_ENDPOINT,
      surface: AUDIT_SURFACE,
      detail: {
        resourceType: 'organization_commercial_agreement',
        resourceId: agreement.id,
        reason: AGREEMENT_AUTHORED_AUDIT_REASON,
        status: agreement.status,
        version: String(agreement.version),
        changedKeys: [agreement.changeKind],
      },
    });

    return agreement;
  });
}

export interface TerminateCommercialAgreementInput {
  organizationId: string;
  reason: string;
  terminatedBy: string | null;
  terminatedAt?: string;
}

/**
 * Ends the live agreement. The version keeps its terms and its signature: what
 * was agreed stays readable, and only the fact that it stopped is added.
 */
export async function terminateCommercialAgreement(
  db: DatabaseAdapter,
  input: TerminateCommercialAgreementInput,
): Promise<CommercialAgreement> {
  const reason = input.reason.trim();
  if (reason === '') {
    throw createError.validation('A termination has to state why the agreement ended.');
  }

  return db.transaction(async (tx) => {
    const current = await readCurrentCommercialAgreement(tx, input.organizationId);
    if (!current || !isExecutedAgreement(current)) {
      throw createError.notFound('This workspace has no executed agreement to terminate.');
    }
    const state = agreementLifecycleState(current);
    const transition = applyContractEvent(state, 'terminate');
    if (!transition.allowed) {
      if (state === 'terminated') return current;
      refuse(`An agreement that is ${state} cannot be terminated (${transition.refusal}).`);
    }

    const [row] = await tx.query<AgreementRow>(
      `update public.organization_commercial_agreements
          set terminated_at = coalesce($3::timestamptz, now()),
              termination_reason = $4::text
        where id = $1::uuid
          and organization_id = $2::uuid
          and terminated_at is null
        returning ${AGREEMENT_COLUMNS}`,
      [current.id, input.organizationId, input.terminatedAt ?? null, reason],
    );
    if (!row) return current;

    const terminated = toCommercialAgreement(row);
    logger.warn(
      { organizationId: input.organizationId, version: terminated.version },
      'Commercial agreement terminated; the workspace is no longer contracted',
    );
    await recordAuditEvent({
      organizationId: input.organizationId,
      userId: input.terminatedBy,
      eventType: 'plan_changed',
      severity: 'warning',
      endpoint: AUDIT_ENDPOINT,
      surface: AUDIT_SURFACE,
      detail: {
        resourceType: 'organization_commercial_agreement',
        resourceId: terminated.id,
        reason: AGREEMENT_TERMINATED_AUDIT_REASON,
        status: 'terminated',
        version: String(terminated.version),
      },
    });
    return terminated;
  });
}

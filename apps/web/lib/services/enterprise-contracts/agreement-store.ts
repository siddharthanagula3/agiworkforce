import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';

import { isEnterprisePaymentMethodPolicy } from './payment-methods';
import type {
  CommercialAgreement,
  CommercialAgreementSignature,
  CommercialAgreementStatus,
  CommercialAgreementTerms,
} from './types';

const AUDIT_ENDPOINT = '/api/enterprise/commercial-agreements';
const AUDIT_SURFACE = 'enterprise_contracts';
const AGREEMENT_AUTHORED_AUDIT_REASON = 'commercial_agreement_version_authored';

const AGREEMENT_COLUMNS = `id, organization_id, version, status, order_form_reference,
       signature_provider, signature_envelope_id, signed_at, signed_by_name, signed_by_email,
       customer_legal_entity, committed_seats, billing_cadence, contract_term_start,
       contract_term_end, payment_terms_days, payment_method_policy,
       included_usage_cents_per_period, committed_usage_block_cents, minimum_annual_spend_cents,
       overage_stripe_price_id, support_tier, procurement_reference, billing_contact_name,
       billing_contact_email, procurement_contact_name, procurement_contact_email,
       tax_exempt_status, amendment_reason, authored_by, superseded_at, created_at`;

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
  billing_cadence: CommercialAgreementTerms['billingCadence'];
  contract_term_start: string | Date;
  contract_term_end: string | Date;
  payment_terms_days: number | string;
  payment_method_policy: string;
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
  authored_by: string | null;
  superseded_at: string | Date | null;
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
  return {
    id: row.id,
    organizationId: row.organization_id,
    version: Number(row.version),
    status: row.status,
    terms: {
      customerLegalEntity: row.customer_legal_entity,
      committedSeats: Number(row.committed_seats),
      billingCadence: row.billing_cadence,
      contractTermStart: isoDate(row.contract_term_start),
      contractTermEnd: isoDate(row.contract_term_end),
      paymentTermsDays: Number(row.payment_terms_days),
      paymentMethodPolicy: policy,
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

export interface AuthorCommercialAgreementInput {
  organizationId: string;
  terms: CommercialAgreementTerms;
  signature?: CommercialAgreementSignature | null;
  status?: CommercialAgreementStatus;
  amendmentReason?: string | null;
  authoredBy?: string | null;
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

  await db.execute(
    `update public.organization_commercial_agreements
        set superseded_at = now(),
            status = case when status = 'executed' then 'superseded' else status end
      where organization_id = $1::uuid
        and superseded_at is null`,
    [organizationId],
  );

  const [highest] = await db.query<{ highest: number | string | null }>(
    `select max(version) as highest
       from public.organization_commercial_agreements
      where organization_id = $1::uuid`,
    [organizationId],
  );
  const nextVersion = Number(highest?.highest ?? 0) + 1;

  const [row] = await db.query<AgreementRow>(
    `insert into public.organization_commercial_agreements
       (organization_id, version, status, order_form_reference, signature_provider,
        signature_envelope_id, signed_at, signed_by_name, signed_by_email, customer_legal_entity,
        committed_seats, billing_cadence, contract_term_start, contract_term_end,
        payment_terms_days, payment_method_policy, included_usage_cents_per_period,
        committed_usage_block_cents, minimum_annual_spend_cents, overage_stripe_price_id,
        support_tier, procurement_reference, billing_contact_name, billing_contact_email,
        procurement_contact_name, procurement_contact_email, tax_exempt_status, amendment_reason,
        authored_by)
     values ($1::uuid, $2::integer, $3::text, $4::text, $5::text, $6::text, $7::timestamptz,
             $8::text, $9::text, $10::text, $11::integer, $12::text, $13::date, $14::date,
             $15::integer, $16::text, $17::bigint, $18::bigint, $19::bigint, $20::text, $21::text,
             $22::text, $23::text, $24::text, $25::text, $26::text, $27::text, $28::text, $29::text)
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
      terms.billingCadence,
      terms.contractTermStart,
      terms.contractTermEnd,
      terms.paymentTermsDays,
      terms.paymentMethodPolicy,
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
      input.authoredBy ?? null,
    ],
  );

  if (!row) {
    throw new Error('The commercial agreement version could not be written.');
  }

  const agreement = toCommercialAgreement(row);
  logger.info(
    { organizationId, version: agreement.version, status: agreement.status },
    'Commercial agreement version authored',
  );
  await recordAuditEvent({
    organizationId,
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
    },
  });

  return agreement;
}

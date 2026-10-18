import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { ContractForce } from '@agiworkforce/types';

import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';

import {
  authorCommercialAgreementVersion,
  readCurrentCommercialAgreement,
} from './agreement-store';
import { compareStripeContractMetadata } from './stripe-metadata';
import {
  agreementForce,
  isExecutedAgreement,
  type ActivationBlockedReason,
  type CommercialAgreement,
  type CommercialAgreementSignature,
  type CommercialAgreementTerms,
  type ExecutedCommercialAgreement,
} from './types';

const AUDIT_ENDPOINT = '/api/stripe-webhook';
const AUDIT_SURFACE = 'enterprise_contracts';
const MISSING_SIGNED_ORDER_AUDIT_REASON = 'enterprise_billing_without_signed_order';
const TERMS_MISMATCH_AUDIT_REASON = 'enterprise_contract_terms_mismatch';
const OUT_OF_TERM_AUDIT_REASON = 'enterprise_billing_outside_contract_term';

const NO_AGREEMENT_FORCE: ContractForce = {
  inForce: false,
  reason: 'not_executed',
  lifecycleState: 'draft',
  grantsThrough: null,
};

export interface EnterpriseActivationState {
  agreement: CommercialAgreement | null;
  blockedReason: ActivationBlockedReason | null;
  /** Whether the agreement grants anything today, term and grace included. */
  force: ContractForce;
  signedOrderReference: string | null;
  signedAt: string | null;
  metadataMismatchedKeys: string[];
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Whether an enterprise workspace has the signed commercial basis its billing
 * claims, and whether that basis is still in force. Billing that runs without
 * one is not silently accepted: it is recorded on the contract row and
 * audited, so the gap is visible to whoever has to answer for the invoice.
 */
export function resolveActivationState(
  agreement: CommercialAgreement | null,
  providerMetadata?: Readonly<Record<string, string | null | undefined>> | null,
  asOfDate: string = today(),
): EnterpriseActivationState {
  if (!isExecutedAgreement(agreement)) {
    return {
      agreement,
      blockedReason: 'missing_signed_order',
      force: agreement ? agreementForce(agreement, asOfDate) : NO_AGREEMENT_FORCE,
      signedOrderReference: null,
      signedAt: null,
      metadataMismatchedKeys: [],
    };
  }

  const comparison = compareStripeContractMetadata(agreement, providerMetadata);
  return {
    agreement,
    blockedReason: comparison.mismatched.length > 0 ? 'agreement_terms_mismatch' : null,
    force: agreementForce(agreement, asOfDate),
    signedOrderReference: agreement.signature.orderFormReference,
    signedAt: agreement.signature.signedAt,
    metadataMismatchedKeys: comparison.mismatched,
  };
}

export async function readEnterpriseActivationState(
  db: DatabaseAdapter,
  organizationId: string,
  providerMetadata?: Readonly<Record<string, string | null | undefined>> | null,
  asOfDate: string = today(),
): Promise<EnterpriseActivationState> {
  const agreement = await readCurrentCommercialAgreement(db, organizationId);
  return resolveActivationState(agreement, providerMetadata, asOfDate);
}

export async function auditActivationState(
  organizationId: string,
  state: EnterpriseActivationState,
  resourceId: string,
): Promise<void> {
  if (state.blockedReason === null && state.force.inForce) return;

  if (state.blockedReason === 'missing_signed_order') {
    logger.error(
      { organizationId, resourceId },
      'Enterprise billing is running with no signed order form recorded',
    );
    await recordAuditEvent({
      organizationId,
      eventType: 'plan_changed',
      severity: 'warning',
      endpoint: AUDIT_ENDPOINT,
      surface: AUDIT_SURFACE,
      detail: {
        resourceType: 'organization_billing_contract',
        resourceId,
        reason: MISSING_SIGNED_ORDER_AUDIT_REASON,
        status: state.blockedReason,
      },
    });
    return;
  }

  if (!state.force.inForce) {
    logger.error(
      {
        organizationId,
        resourceId,
        forceReason: state.force.reason,
        grantsThrough: state.force.grantsThrough,
        agreementVersion: state.agreement?.version ?? null,
      },
      'Enterprise billing is running outside the term of the signed agreement',
    );
    await recordAuditEvent({
      organizationId,
      eventType: 'plan_changed',
      severity: 'warning',
      endpoint: AUDIT_ENDPOINT,
      surface: AUDIT_SURFACE,
      detail: {
        resourceType: 'organization_billing_contract',
        resourceId,
        reason: OUT_OF_TERM_AUDIT_REASON,
        status: state.force.reason,
        version: String(state.agreement?.version ?? ''),
      },
    });
    if (state.blockedReason === null) return;
  }

  logger.error(
    {
      organizationId,
      resourceId,
      mismatchedKeys: state.metadataMismatchedKeys,
      agreementVersion: state.agreement?.version ?? null,
    },
    'Stripe subscription metadata disagrees with the signed commercial agreement; the agreement is kept',
  );
  await recordAuditEvent({
    organizationId,
    eventType: 'plan_changed',
    severity: 'warning',
    endpoint: AUDIT_ENDPOINT,
    surface: AUDIT_SURFACE,
    detail: {
      resourceType: 'organization_billing_contract',
      resourceId,
      reason: TERMS_MISMATCH_AUDIT_REASON,
      status: state.blockedReason ?? 'agreement_terms_mismatch',
      changedKeys: state.metadataMismatchedKeys,
      version: String(state.agreement?.version ?? ''),
    },
  });
}

export interface RecordSignedOrderInput {
  organizationId: string;
  terms: CommercialAgreementTerms;
  signature: CommercialAgreementSignature;
  amendmentReason?: string | null;
  authoredBy?: string | null;
  event?: 'amend' | 'renew';
}

export async function recordSignedOrder(
  db: DatabaseAdapter,
  input: RecordSignedOrderInput,
): Promise<ExecutedCommercialAgreement> {
  const agreement = await authorCommercialAgreementVersion(db, {
    organizationId: input.organizationId,
    terms: input.terms,
    signature: input.signature,
    status: 'executed',
    amendmentReason: input.amendmentReason ?? null,
    authoredBy: input.authoredBy ?? null,
    ...(input.event ? { event: input.event } : {}),
  });
  if (!isExecutedAgreement(agreement)) {
    throw new Error('The signed order form was not recorded as an executed agreement.');
  }
  return agreement;
}

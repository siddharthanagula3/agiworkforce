import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';

import {
  authorCommercialAgreementVersion,
  readCurrentCommercialAgreement,
} from './agreement-store';
import { isEnvelopeExecuted, type ESignatureEnvelope } from './e-signature';
import { compareStripeContractMetadata } from './stripe-metadata';
import {
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

export interface EnterpriseActivationState {
  agreement: CommercialAgreement | null;
  blockedReason: ActivationBlockedReason | null;
  signedOrderReference: string | null;
  signedAt: string | null;
  metadataMismatchedKeys: string[];
}

/**
 * Whether an enterprise workspace has the signed commercial basis its billing
 * claims. Billing that runs without one is not silently accepted: it is
 * recorded on the contract row and audited, so the gap is visible to whoever
 * has to answer for the invoice.
 */
export function resolveActivationState(
  agreement: CommercialAgreement | null,
  providerMetadata?: Readonly<Record<string, string | null | undefined>> | null,
): EnterpriseActivationState {
  if (!isExecutedAgreement(agreement)) {
    return {
      agreement,
      blockedReason: 'missing_signed_order',
      signedOrderReference: null,
      signedAt: null,
      metadataMismatchedKeys: [],
    };
  }

  const comparison = compareStripeContractMetadata(agreement, providerMetadata);
  return {
    agreement,
    blockedReason: comparison.mismatched.length > 0 ? 'agreement_terms_mismatch' : null,
    signedOrderReference: agreement.signature.orderFormReference,
    signedAt: agreement.signature.signedAt,
    metadataMismatchedKeys: comparison.mismatched,
  };
}

export async function readEnterpriseActivationState(
  db: DatabaseAdapter,
  organizationId: string,
  providerMetadata?: Readonly<Record<string, string | null | undefined>> | null,
): Promise<EnterpriseActivationState> {
  const agreement = await readCurrentCommercialAgreement(db, organizationId);
  return resolveActivationState(agreement, providerMetadata);
}

export async function auditActivationState(
  organizationId: string,
  state: EnterpriseActivationState,
  resourceId: string,
): Promise<void> {
  if (state.blockedReason === null) return;

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
      status: state.blockedReason,
      changedKeys: state.metadataMismatchedKeys,
      version: String(state.agreement?.version ?? ''),
    },
  });
}

export async function assertEnterpriseBillingActivated(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<ExecutedCommercialAgreement> {
  const state = await readEnterpriseActivationState(db, organizationId);
  if (state.blockedReason !== null || !isExecutedAgreement(state.agreement)) {
    throw createError.forbidden(
      'This workspace has no signed order form on file, so enterprise billing cannot be activated.',
    );
  }
  return state.agreement;
}

export interface RecordSignedOrderInput {
  organizationId: string;
  terms: CommercialAgreementTerms;
  signature: CommercialAgreementSignature;
  amendmentReason?: string | null;
  authoredBy?: string | null;
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
  });
  if (!isExecutedAgreement(agreement)) {
    throw new Error('The signed order form was not recorded as an executed agreement.');
  }
  return agreement;
}

export async function recordSignedOrderFromEnvelope(
  db: DatabaseAdapter,
  input: {
    organizationId: string;
    orderFormReference: string;
    terms: CommercialAgreementTerms;
    envelope: ESignatureEnvelope;
    amendmentReason?: string | null;
    authoredBy?: string | null;
  },
): Promise<ExecutedCommercialAgreement> {
  if (!isEnvelopeExecuted(input.envelope)) {
    throw createError.badRequest('This order form has not been signed yet.');
  }
  return recordSignedOrder(db, {
    organizationId: input.organizationId,
    terms: input.terms,
    signature: {
      orderFormReference: input.orderFormReference,
      provider: input.envelope.provider,
      envelopeId: input.envelope.envelopeId,
      signedAt: input.envelope.completedAt ?? new Date().toISOString(),
      signerName: input.envelope.signerName,
      signerEmail: input.envelope.signerEmail,
    },
    amendmentReason: input.amendmentReason ?? null,
    authoredBy: input.authoredBy ?? null,
  });
}

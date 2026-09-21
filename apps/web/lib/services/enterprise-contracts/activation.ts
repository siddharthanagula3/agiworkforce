import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { ContractForce } from '@agiworkforce/types';

import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';

import {
  authorCommercialAgreementVersion,
  readAgreementByEnvelope,
  readCurrentCommercialAgreement,
} from './agreement-store';
import { isEnvelopeExecuted, type ESignatureEnvelope } from './e-signature';
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

const FORCE_REFUSALS: Readonly<Record<ContractForce['reason'], string>> = {
  in_force: '',
  in_grace: '',
  not_started: 'The signed agreement for this workspace has not started yet.',
  expired: 'The signed agreement for this workspace has ended and its grace period has run out.',
  terminated: 'The signed agreement for this workspace was terminated.',
  superseded: 'The signed agreement for this workspace has been superseded.',
  not_executed:
    'This workspace has no signed order form on file, so enterprise billing cannot be activated.',
};

/**
 * The gate every enterprise entitlement passes. An agreement that is not in
 * force grants nothing, whatever its status column still says.
 */
export async function assertEnterpriseBillingActivated(
  db: DatabaseAdapter,
  organizationId: string,
  asOfDate: string = today(),
): Promise<ExecutedCommercialAgreement> {
  const state = await readEnterpriseActivationState(db, organizationId, null, asOfDate);
  if (state.blockedReason !== null || !isExecutedAgreement(state.agreement)) {
    throw createError.forbidden(
      state.blockedReason === 'agreement_terms_mismatch'
        ? 'The provider subscription for this workspace disagrees with the signed agreement.'
        : FORCE_REFUSALS.not_executed,
    );
  }
  if (!state.force.inForce) {
    throw createError.forbidden(FORCE_REFUSALS[state.force.reason]);
  }
  return state.agreement;
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

/**
 * Records the signature an envelope carries, once. A provider that delivers
 * the same completed envelope twice returns the version it already authored
 * rather than amending the workspace with terms nobody renegotiated.
 */
export async function recordSignedOrderFromEnvelope(
  db: DatabaseAdapter,
  input: {
    organizationId: string;
    orderFormReference: string;
    terms: CommercialAgreementTerms;
    envelope: ESignatureEnvelope;
    amendmentReason?: string | null;
    authoredBy?: string | null;
    event?: 'amend' | 'renew';
  },
): Promise<ExecutedCommercialAgreement> {
  if (!isEnvelopeExecuted(input.envelope)) {
    throw createError.badRequest('This order form has not been signed yet.');
  }

  const envelopeId = input.envelope.envelopeId;
  if (envelopeId) {
    const existing = await readAgreementByEnvelope(db, input.organizationId, envelopeId);
    if (existing) {
      if (!isExecutedAgreement(existing)) {
        throw createError.conflict(
          'This envelope is already recorded against a version that is not executed.',
        );
      }
      logger.info(
        { organizationId: input.organizationId, version: existing.version },
        'Signed order form already recorded for this envelope; no new version authored',
      );
      return existing;
    }
  }

  return recordSignedOrder(db, {
    organizationId: input.organizationId,
    terms: input.terms,
    signature: {
      orderFormReference: input.orderFormReference,
      provider: input.envelope.provider,
      envelopeId,
      signedAt: input.envelope.completedAt ?? new Date().toISOString(),
      signerName: input.envelope.signerName,
      signerEmail: input.envelope.signerEmail,
    },
    amendmentReason: input.amendmentReason ?? null,
    authoredBy: input.authoredBy ?? null,
    ...(input.event ? { event: input.event } : {}),
  });
}

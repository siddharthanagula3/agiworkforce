import 'server-only';

import {
  PERSISTED_CONTRACT_STATES,
  resolveContractForce,
  type ContractChangeKind,
  type ContractForce,
  type ContractLifecycleState,
  type ContractTermWindow,
} from '@agiworkforce/types';

import type { BillingCadence } from '@/lib/server/neon-types';

import type { EnterprisePaymentMethodPolicy } from './payment-methods';

export const COMMERCIAL_AGREEMENT_STATUSES = [
  'draft',
  'pending_signature',
  'executed',
  'superseded',
] as const;

export type CommercialAgreementStatus = (typeof COMMERCIAL_AGREEMENT_STATUSES)[number];

export const E_SIGNATURE_PROVIDERS = ['docusign', 'manual_countersigned'] as const;

export type ESignatureProviderId = (typeof E_SIGNATURE_PROVIDERS)[number];

export type TaxExemptStatus = 'none' | 'exempt' | 'reverse';

export interface CommercialAgreementContact {
  name: string | null;
  email: string | null;
}

/**
 * The negotiated commercial terms of one Order Form, authored here and signed
 * here. Stripe subscription metadata is generated from these values; it is
 * never the place they come from.
 */
export interface CommercialAgreementTerms {
  customerLegalEntity: string;
  committedSeats: number;
  seatUnitPriceCents: number | null;
  billingCadence: BillingCadence;
  billingCurrency: string;
  contractTermStart: string;
  contractTermEnd: string;
  expiryGraceDays: number;
  paymentTermsDays: number;
  paymentMethodPolicy: EnterprisePaymentMethodPolicy;
  purchaseOrderRequired: boolean;
  invoiceRecipientEmails: string[];
  includedUsageCentsPerPeriod: number;
  committedUsageBlockCents: number;
  minimumAnnualSpendCents: number;
  overageStripePriceId: string | null;
  supportTier: string | null;
  procurementReference: string | null;
  billingContact: CommercialAgreementContact | null;
  procurementContact: CommercialAgreementContact | null;
  taxExemptStatus: TaxExemptStatus;
}

export interface CommercialAgreementSignature {
  orderFormReference: string;
  provider: ESignatureProviderId;
  envelopeId: string | null;
  signedAt: string;
  signerName: string | null;
  signerEmail: string | null;
}

export interface CommercialAgreement {
  id: string;
  organizationId: string;
  version: number;
  status: CommercialAgreementStatus;
  changeKind: ContractChangeKind;
  supersedesVersion: number | null;
  terms: CommercialAgreementTerms;
  signature: CommercialAgreementSignature | null;
  amendmentReason: string | null;
  authoredBy: string | null;
  supersededAt: string | null;
  terminatedAt: string | null;
  terminationReason: string | null;
  createdAt: string;
}

export interface ExecutedCommercialAgreement extends CommercialAgreement {
  status: 'executed';
  signature: CommercialAgreementSignature;
}

export function isExecutedAgreement(
  agreement: CommercialAgreement | null | undefined,
): agreement is ExecutedCommercialAgreement {
  return agreement?.status === 'executed' && agreement.signature !== null;
}

export function agreementTermWindow(terms: CommercialAgreementTerms): ContractTermWindow {
  return {
    termStart: terms.contractTermStart,
    termEnd: terms.contractTermEnd,
    expiryGraceDays: terms.expiryGraceDays,
  };
}

/**
 * Where a stored agreement sits in the lifecycle. An ending is a date on the
 * row, so the state is read from the dates rather than from a status a sweep
 * would have had to write.
 */
export function agreementLifecycleState(agreement: CommercialAgreement): ContractLifecycleState {
  if (agreement.supersededAt !== null || agreement.status === 'superseded') return 'superseded';
  if (agreement.terminatedAt !== null) return 'terminated';
  return agreement.status;
}

export function agreementForce(agreement: CommercialAgreement, asOfDate: string): ContractForce {
  return resolveContractForce({
    state: agreementLifecycleState(agreement),
    window: agreementTermWindow(agreement.terms),
    asOfDate,
  });
}

export function isPersistedAgreementStatus(value: unknown): value is CommercialAgreementStatus {
  return (
    typeof value === 'string' &&
    PERSISTED_CONTRACT_STATES.includes(value as ContractLifecycleState) &&
    COMMERCIAL_AGREEMENT_STATUSES.includes(value as CommercialAgreementStatus)
  );
}

export const ACTIVATION_BLOCKED_REASONS = [
  'missing_signed_order',
  'agreement_terms_mismatch',
] as const;

export type ActivationBlockedReason = (typeof ACTIVATION_BLOCKED_REASONS)[number];

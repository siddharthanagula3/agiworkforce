/**
 * The canonical contract object every surface reads. It is derived from the
 * signed agreement, so no surface decides on its own what a contract grants.
 */

import { resolveCommercialModel, type CommercialModel, type CommitmentShape } from './commitments';
import {
  resolveContractForce,
  type ContractChangeKind,
  type ContractForceReason,
  type ContractLifecycleEvent,
  type ContractLifecycleState,
  type ContractTermWindow,
  allowedContractEvents,
} from './contract-lifecycle';
import { paymentTermLabel, type InvoiceIssuanceTerms } from './invoice-terms';

export interface CommercialContractIdentity {
  readonly organizationId: string;
  readonly version: number;
  readonly state: ContractLifecycleState;
  readonly changeKind: ContractChangeKind;
  readonly orderFormReference: string | null;
  readonly signedAt: string | null;
  readonly supersedesVersion: number | null;
}

export interface CommercialContractCommercials {
  readonly committedSeats: number;
  readonly seatUnitPriceCents: number | null;
  readonly includedUsageCentsPerPeriod: number;
  readonly committedUsageBlockCents: number;
  readonly minimumAnnualSpendCents: number;
  readonly meteredUsage: boolean;
  readonly billingCurrency: string;
}

export interface CommercialContractProcurement {
  readonly paymentTermDays: number;
  readonly purchaseOrderRequired: boolean;
  readonly purchaseOrderNumber: string | null;
  readonly invoiceRecipientEmails: readonly string[];
  readonly permittedPaymentMethods: readonly string[];
}

export interface CommercialContractInput {
  readonly identity: CommercialContractIdentity;
  readonly window: ContractTermWindow;
  readonly commercials: CommercialContractCommercials;
  readonly procurement: CommercialContractProcurement;
  readonly asOfDate: string;
}

export interface CommercialContractView {
  readonly organizationId: string;
  readonly version: number;
  readonly state: ContractLifecycleState;
  readonly changeKind: ContractChangeKind;
  readonly model: CommercialModel | null;
  readonly inForce: boolean;
  readonly forceReason: ContractForceReason;
  readonly termStart: string;
  readonly termEnd: string;
  readonly grantsThrough: string | null;
  readonly paymentTermLabel: string;
  readonly availableEvents: readonly ContractLifecycleEvent[];
  readonly identity: CommercialContractIdentity;
  readonly commercials: CommercialContractCommercials;
  readonly procurement: CommercialContractProcurement;
}

export function commitmentShapeOf(commercials: CommercialContractCommercials): CommitmentShape {
  return {
    committedSeats: commercials.committedSeats,
    committedUsageBlockCents: commercials.committedUsageBlockCents,
    includedUsageCentsPerPeriod: commercials.includedUsageCentsPerPeriod,
    minimumAnnualSpendCents: commercials.minimumAnnualSpendCents,
    meteredUsage: commercials.meteredUsage,
  };
}

export function commercialContractView(input: CommercialContractInput): CommercialContractView {
  const force = resolveContractForce({
    state: input.identity.state,
    window: input.window,
    asOfDate: input.asOfDate,
  });
  return {
    organizationId: input.identity.organizationId,
    version: input.identity.version,
    state: force.lifecycleState,
    changeKind: input.identity.changeKind,
    model: resolveCommercialModel(commitmentShapeOf(input.commercials)),
    inForce: force.inForce,
    forceReason: force.reason,
    termStart: input.window.termStart,
    termEnd: input.window.termEnd,
    grantsThrough: force.grantsThrough,
    paymentTermLabel: paymentTermLabel(input.procurement.paymentTermDays),
    availableEvents: allowedContractEvents(force.lifecycleState),
    identity: input.identity,
    commercials: input.commercials,
    procurement: input.procurement,
  };
}

/**
 * The enterprise entitlement a contract grants. An agreement that is not in
 * force grants nothing, whatever its status column still says.
 */
export function contractGrantsEnterprise(view: CommercialContractView): boolean {
  return view.inForce;
}

export function contractInvoiceTerms(view: CommercialContractView): InvoiceIssuanceTerms {
  return {
    contractInForce: view.inForce,
    purchaseOrderRequired: view.procurement.purchaseOrderRequired,
    purchaseOrderNumber: view.procurement.purchaseOrderNumber,
    invoiceRecipientEmails: view.procurement.invoiceRecipientEmails,
    negotiatedRateCents: view.commercials.seatUnitPriceCents,
    billingCurrency: view.commercials.billingCurrency,
    permittedPaymentMethods: view.procurement.permittedPaymentMethods,
  };
}

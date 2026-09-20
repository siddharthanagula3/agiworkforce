import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  OFFLINE_PAYMENT_METHODS,
  type CommercialContractView,
  type ContractLifecycleEvent,
} from '@agiworkforce/types';

import { withErrorHandler } from '@/lib/error-handler';
import { SETTINGS_API_ROUTE_DEADLINE_MS } from '@/lib/deadline-policy';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { readJsonBody } from '@/lib/read-json-body';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { logAdminDataAccess } from '@/lib/server/admin-data-access';
import { requireOrgMember, resolveOrgMembership } from '@/lib/services/org-sharing-service';
import { requireMemberPermission } from '@/lib/services/organization-permission-service';
import { requireTeamAdminAccess } from '@/app/api/settings/team/team-admin-access';
import {
  readEnterpriseContractSummary,
  type EnterpriseContractSummary,
  type EnterpriseInvoiceSummary,
} from '@/lib/services/enterprise-billing-service';
import {
  contractViewOf,
  permittedOfflineMethods,
  readCommercialAgreementHistory,
  readCurrentCommercialAgreement,
  readEnterpriseInvoicePositions,
  reportOfflinePayment,
  terminateCommercialAgreement,
  today,
  type EnterpriseInvoicePosition,
  type OfflinePaymentRecord,
} from '@/lib/services/enterprise-contracts';

export const runtime = 'nodejs';

export interface CommercialAgreementVersionSummary {
  version: number;
  state: CommercialContractView['state'];
  changeKind: CommercialContractView['changeKind'];
  supersedesVersion: number | null;
  orderFormReference: string | null;
  signedAt: string | null;
  termStart: string;
  termEnd: string;
  amendmentReason: string | null;
  terminationReason: string | null;
}

export interface EnterpriseContractResponse {
  contract: EnterpriseContractSummary | null;
  invoices: EnterpriseInvoiceSummary[];
  agreement: CommercialContractView | null;
  availableEvents: ContractLifecycleEvent[];
  history: CommercialAgreementVersionSummary[];
  invoicePositions: EnterpriseInvoicePosition[];
}

export interface OfflinePaymentResponse {
  recorded: boolean;
  payment: OfflinePaymentRecord;
  invoice: EnterpriseInvoicePosition;
}

const ReportPaymentSchema = z
  .object({
    action: z.literal('report_offline_payment'),
    stripeInvoiceId: z.string().trim().min(1).max(255),
    method: z.enum(OFFLINE_PAYMENT_METHODS),
    amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    remittanceReference: z.string().trim().min(1).max(200),
    receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

const TerminateSchema = z
  .object({
    action: z.literal('terminate'),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();

const ContractActionSchema = z.discriminatedUnion('action', [ReportPaymentSchema, TerminateSchema]);

async function requireContractAccess(request: NextRequest, permission: 'read' | 'manage') {
  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  await requireTeamAdminAccess(db, userId, membership.organizationId);

  await requireMemberPermission(
    membership.organizationId,
    userId,
    permission === 'read' ? 'billing.read' : 'billing.contracts.manage',
    permission === 'read'
      ? 'Your workspace role does not allow viewing the enterprise contract and invoices.'
      : 'Your workspace role does not allow changing the enterprise contract.',
  );

  return { db, userId, membership };
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, membership } = await requireContractAccess(request, 'read');
  const asOfDate = today();

  const [summary, agreement, history, invoicePositions] = await Promise.all([
    readEnterpriseContractSummary(db, membership.organizationId),
    readCurrentCommercialAgreement(db, membership.organizationId),
    readCommercialAgreementHistory(db, membership.organizationId),
    readEnterpriseInvoicePositions(db, membership.organizationId, asOfDate),
  ]);

  await logAdminDataAccess(request, {
    userId,
    organizationId: membership.organizationId,
    role: membership.role,
    resourceType: 'enterprise_contract',
  });

  const view = agreement ? contractViewOf(agreement, asOfDate) : null;
  const payload: EnterpriseContractResponse = {
    contract: summary.contract,
    invoices: summary.invoices,
    agreement: view,
    availableEvents: view ? [...view.availableEvents] : [],
    history: history.map((version) => ({
      version: version.version,
      state: contractViewOf(version, asOfDate).state,
      changeKind: version.changeKind,
      supersedesVersion: version.supersedesVersion,
      orderFormReference: version.signature?.orderFormReference ?? null,
      signedAt: version.signature?.signedAt ?? null,
      termStart: version.terms.contractTermStart,
      termEnd: version.terms.contractTermEnd,
      amendmentReason: version.amendmentReason,
      terminationReason: version.terminationReason,
    })),
    invoicePositions,
  };
  return NextResponse.json(payload);
}

async function handlePost(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, membership } = await requireContractAccess(request, 'manage');

  const parsed = ContractActionSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid enterprise contract action', parsed.error.issues);
  }
  const asOfDate = today();

  if (parsed.data.action === 'terminate') {
    const terminated = await terminateCommercialAgreement(db, {
      organizationId: membership.organizationId,
      reason: parsed.data.reason,
      terminatedBy: userId,
    });
    return NextResponse.json({ agreement: contractViewOf(terminated, asOfDate) });
  }

  const agreement = await readCurrentCommercialAgreement(db, membership.organizationId);
  if (!agreement) {
    throw createError.notFound('This workspace has no commercial agreement to settle against.');
  }
  if (permittedOfflineMethods(agreement).length === 0) {
    throw createError.conflict(
      'This agreement is settled by card, so a bank transfer cannot be applied to it.',
    );
  }

  const outcome = await reportOfflinePayment(
    db,
    agreement,
    {
      organizationId: membership.organizationId,
      stripeInvoiceId: parsed.data.stripeInvoiceId,
      method: parsed.data.method,
      amountCents: parsed.data.amountCents,
      remittanceReference: parsed.data.remittanceReference,
      receivedOn: parsed.data.receivedOn,
      reportedBy: userId,
      note: parsed.data.note ?? null,
    },
    asOfDate,
  );

  const payload: OfflinePaymentResponse = {
    recorded: outcome.recorded,
    payment: outcome.payment,
    invoice: outcome.position,
  };
  return NextResponse.json(payload, { status: outcome.recorded ? 201 : 200 });
}

export const GET = withErrorHandler(handleGet, {
  deadlineMs: SETTINGS_API_ROUTE_DEADLINE_MS,
  circuit: 'settings.organization.billing-contract',
});

export const POST = withErrorHandler(handlePost, {
  deadlineMs: SETTINGS_API_ROUTE_DEADLINE_MS,
  circuit: 'settings.organization.billing-contract',
});

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

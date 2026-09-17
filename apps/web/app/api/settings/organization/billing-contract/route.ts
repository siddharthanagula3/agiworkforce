import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { SETTINGS_API_ROUTE_DEADLINE_MS } from '@/lib/deadline-policy';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
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

export const runtime = 'nodejs';

export interface EnterpriseContractResponse {
  contract: EnterpriseContractSummary | null;
  invoices: EnterpriseInvoiceSummary[];
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  await requireTeamAdminAccess(db, userId, membership.organizationId);

  await requireMemberPermission(
    membership.organizationId,
    userId,
    'billing.read',
    'Your workspace role does not allow viewing the enterprise contract and invoices.',
  );

  await logAdminDataAccess(request, {
    userId,
    organizationId: membership.organizationId,
    role: membership.role,
    resourceType: 'enterprise_contract',
  });
  const payload: EnterpriseContractResponse = await readEnterpriseContractSummary(
    db,
    membership.organizationId,
  );
  return NextResponse.json(payload);
}

export const GET = withErrorHandler(handleGet, {
  deadlineMs: SETTINGS_API_ROUTE_DEADLINE_MS,
  circuit: 'settings.organization.billing-contract',
});

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

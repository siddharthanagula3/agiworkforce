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
  readOrganizationUsage,
  resolveUsageWindow,
  type OrganizationUsage,
} from '@/lib/services/organization-usage-service';

export const runtime = 'nodejs';

const DIMENSIONS = ['daily', 'member', 'model', 'provider', 'workload', 'project'] as const;

type Dimension = (typeof DIMENSIONS)[number];

function resolveDimension(value: string | null): Dimension {
  return DIMENSIONS.includes(value as Dimension) ? (value as Dimension) : 'daily';
}

/**
 * A leading =, +, - or @ makes a spreadsheet treat the cell as a formula, and
 * these cells carry member ids and project ids a member chose. Prefixing with a
 * quote keeps the value readable and inert.
 */
function cell(value: string | number): string {
  const text = String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /["\n,]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

function rowsFor(usage: OrganizationUsage, dimension: Dimension): string[][] {
  if (dimension === 'daily') {
    return usage.daily.map((row) => [row.day, String(row.requests), String(row.costCents)]);
  }

  const breakdown = {
    member: usage.byMember,
    model: usage.byModel,
    provider: usage.byProvider,
    workload: usage.byWorkload,
    project: usage.byProject,
  }[dimension];

  return breakdown.map((row) => [
    row.key,
    String(row.requests),
    String(row.inputTokens),
    String(row.outputTokens),
    String(row.costCents),
  ]);
}

function headerFor(dimension: Dimension): string[] {
  return dimension === 'daily'
    ? ['day', 'requests', 'cost_cents']
    : [dimension, 'requests', 'input_tokens', 'output_tokens', 'cost_cents'];
}

/**
 * The same figures the dashboard reads, as a file a finance team can reconcile
 * against its own records. Admin-only for the reason the dashboard is: a
 * per-member export is a record of what each named person did.
 */
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
    'Your workspace role does not allow exporting workspace usage and spend.',
  );

  const params = new URL(request.url).searchParams;
  const window = resolveUsageWindow(params.get('from'), params.get('to'));
  const dimension = resolveDimension(params.get('dimension'));

  const usage = await readOrganizationUsage(db, membership.organizationId, window);

  await logAdminDataAccess(request, {
    userId,
    organizationId: membership.organizationId,
    role: membership.role,
    resourceType: 'organization_usage_export',
  });

  const lines = [
    ['# organization_id', usage.organizationId],
    ['# window_from', usage.from],
    ['# window_to', usage.to],
    ['# as_of', usage.freshness.asOf],
    ['# latest_activity_at', usage.freshness.latestActivityAt ?? ''],
    ['# unsettled_requests', String(usage.freshness.unsettledRequests)],
    headerFor(dimension),
    ...rowsFor(usage, dimension),
  ]
    .map((row) => row.map(cell).join(','))
    .join('\n');

  const filename = `usage-${dimension}-${usage.from.slice(0, 10)}-to-${usage.to.slice(0, 10)}.csv`;

  return new NextResponse(`${lines}\n`, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export const GET = withErrorHandler(handleGet, {
  deadlineMs: SETTINGS_API_ROUTE_DEADLINE_MS,
  circuit: 'settings.organization.usage-analytics.export',
});

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

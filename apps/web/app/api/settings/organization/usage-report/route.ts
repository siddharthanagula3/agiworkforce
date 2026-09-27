import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { handleCorsPreflightRequest } from '@/lib/cors';
import { SETTINGS_API_ROUTE_DEADLINE_MS } from '@/lib/deadline-policy';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { readValidatedSearchParams } from '@/lib/read-json-body';
import { logAdminDataAccess } from '@/lib/server/admin-data-access';
import { getNeonDb } from '@/lib/server/neon-db';
import { resolveWorkspaceApiCaller } from '@/lib/server/service-principals/caller';
import {
  readWorkspaceUsageReport,
  resolveUsageReportWindow,
  USAGE_REPORT_DEFAULT_BUCKETS,
  USAGE_REPORT_MAX_BUCKETS,
  type UsageReportPage,
} from '@/lib/services/workspace-usage-report-service';

export const runtime = 'nodejs';

const ROUTE = '/api/settings/organization/usage-report';

const QuerySchema = z
  .object({
    from: z.string().max(64),
    to: z.string().max(64).optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(USAGE_REPORT_MAX_BUCKETS)
      .default(USAGE_REPORT_DEFAULT_BUCKETS),
    page: z.string().max(64).optional(),
  })
  .strict();

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const limited = await withRateLimit(request, 'settings-org');
  if (limited) return limited;

  const caller = await resolveWorkspaceApiCaller(request, ROUTE, 'GET');
  const query = readValidatedSearchParams(request, QuerySchema, 'Invalid usage report query');
  const window = resolveUsageReportWindow({
    from: query.from,
    to: query.to ?? null,
    page: query.page ?? null,
    limit: query.limit,
  });

  const report: UsageReportPage = await readWorkspaceUsageReport(
    getNeonDb(),
    caller.organizationId,
    window,
  );

  await logAdminDataAccess(request, {
    userId: caller.actorUserId,
    organizationId: caller.organizationId,
    role: caller.role,
    resourceType: 'organization_usage_report',
  });

  return NextResponse.json(report);
}

export const GET = withErrorHandler(handleGet, {
  deadlineMs: SETTINGS_API_ROUTE_DEADLINE_MS,
  circuit: 'settings.organization.usage-report',
});

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

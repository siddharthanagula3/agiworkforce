import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import {
  serviceDashboardViews,
  type ServiceDashboardsReport,
} from '@/lib/observability/dashboards';
import { resolveOtelExportConfig } from '@/lib/observability/otel-config';

const NO_STORE = 'private, no-store';

/**
 * The §87 dashboards as the operator can act on them: every panel with the
 * query that draws it, and whether a metrics backend is configured to answer
 * it. A console that rendered the panels without saying the exporter is unset
 * would show empty charts and read as an outage.
 */
async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;

  await requirePlatformAdmin(request);

  const exporter = resolveOtelExportConfig(process.env);
  const report: ServiceDashboardsReport = {
    metricsBackendConfigured: exporter !== null,
    serviceName: exporter?.serviceName ?? null,
    dashboards: serviceDashboardViews(),
  };

  return NextResponse.json(report, { headers: { 'Cache-Control': NO_STORE } });
}

export const GET = withErrorHandler(handleGet);

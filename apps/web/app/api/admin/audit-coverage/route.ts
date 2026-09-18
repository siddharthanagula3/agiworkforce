import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { buildAuditCoverageReport, resolveAuditCoverageRoot } from '@/lib/services/audit-coverage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;
  await requirePlatformAdmin(request);

  // The sweep classifies route sources, so a build deployed without them can
  // say it has no answer rather than report an empty route tree as coverage.
  const appRoot = resolveAuditCoverageRoot(process.cwd());
  if (appRoot === null) {
    return NextResponse.json(
      {
        error: 'Route sources are not deployed with this build, so coverage cannot be swept here.',
        code: 'route_sources_unavailable',
      },
      { status: 503, headers: NO_STORE },
    );
  }

  return NextResponse.json(buildAuditCoverageReport(appRoot), { headers: NO_STORE });
}

export const GET = withErrorHandler(handleGet);

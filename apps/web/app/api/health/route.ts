import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  getCachedHealthChecks,
  type DependencyObservation,
  type HealthCheckResult,
} from '@/lib/server/health-check';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest, getCorsHeaders } from '@/lib/cors';

export const runtime = 'nodejs';

/**
 * Stated here rather than left to dashboard-only state. This route is public
 * and is the thing an external uptime monitor will poll; a cache miss still
 * reaches Stripe and Neon, and an unbounded probe is the worst possible shape
 * for a health endpoint during the incident it exists to reveal.
 */
export const maxDuration = 30;

// A dependency id or a component name paired with a finding tells a stranger
// which part of the deployment is weak, so the public answer counts what the
// operator surfaces name, the same reduction `environment` already makes.
function toPublicHealthCheck(healthCheck: HealthCheckResult) {
  const { configuration = [], dependencies = [], ...rest } = healthCheck;
  const missingCount = rest.checks.environment.missingCount;
  const tally = (observation: DependencyObservation) =>
    dependencies.filter((entry) => entry.observation === observation).length;

  return {
    ...rest,
    checks: {
      ...rest.checks,
      environment: {
        status: rest.checks.environment.status,
        ...(missingCount === undefined ? {} : { missingCount }),
      },
    },
    dependencyCounts: {
      total: dependencies.length,
      ok: tally('ok'),
      failing: tally('failing'),
      unconfigured: tally('unconfigured'),
      unobserved: tally('unobserved'),
    },
    configurationFindings: configuration.filter((entry) => entry.state !== 'ok').length,
  };
}

export async function GET(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'health-check');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // Cached, not `runHealthChecks`: this route is public, uncacheable at the
  // edge (`no-store` below), and the checks make 1 + N Stripe API calls plus a
  // database round trip. Run per request they turn a public URL into a
  // traffic-proportional load generator against the exact dependencies an
  // incident is already straining. `timestamp` in the payload is the moment the
  // checks actually ran, so a cached answer never claims to be fresher than it
  // is, and an external monitor still sees the real result.
  const healthCheck = await getCachedHealthChecks();

  const statusCode = healthCheck.status === 'unhealthy' ? 503 : 200;

  return NextResponse.json(toPublicHealthCheck(healthCheck), {
    status: statusCode,
    headers: {
      ...getCorsHeaders(request),
      // An external uptime monitor is the only detector that survives this
      // deployment being down; a 200 with no freshness directive is
      // heuristically cacheable, so a proxy could answer "healthy" for it
      // while the platform is unreachable.
      'Cache-Control': 'no-store',
    },
  });
}

export function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}

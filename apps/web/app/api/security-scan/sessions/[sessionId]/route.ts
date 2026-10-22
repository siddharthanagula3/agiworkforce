import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { recordAuditEvent } from '@/lib/security-audit';
import { securityScanRouteContext } from '@/features/security-scan/server/route-access';
import { rethrowSecurityScanError } from '@/features/security-scan/server/route-errors';
import { parseScanScope } from '@/features/security-scan/server/selection';
import { readSecurityScanState, runSecurityScan } from '@/features/security-scan/server/service';

export const runtime = 'nodejs';
export const maxDuration = 300;

type RouteContext = { params: Promise<{ sessionId: string }> };

async function requestObject(request: NextRequest): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw createError.validation('Invalid JSON request body');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw createError.validation('Request body must be an object');
  }
  return value as Record<string, unknown>;
}

async function handleRead(request: NextRequest, context: RouteContext) {
  const { sessionId } = await context.params;
  try {
    const scan = await securityScanRouteContext(request, sessionId, { mutation: false });
    if (scan instanceof Response) return scan;
    return NextResponse.json(await readSecurityScanState(scan));
  } catch (error) {
    rethrowSecurityScanError(error);
  }
}

async function handleScan(request: NextRequest, context: RouteContext) {
  const { sessionId } = await context.params;
  try {
    const scan = await securityScanRouteContext(request, sessionId, { mutation: true });
    if (scan instanceof Response) return scan;
    const body = await requestObject(request);
    if (body['consent'] !== true) {
      throw createError.validation(
        'Confirm that repository files may be sent to the model before scanning',
      );
    }
    const scope = parseScanScope(body['scope']);
    const report = await runSecurityScan(scan, scope);
    await recordAuditEvent({
      userId: scan.owner.userId,
      organizationId: scan.owner.organizationId,
      request,
      eventType: 'code_session_lifecycle_changed',
      detail: {
        resourceType: 'code_session',
        resourceId: scan.sessionId,
        status: 'security_scan_completed',
        count: report.findings.length,
      },
    });
    return NextResponse.json({ report });
  } catch (error) {
    rethrowSecurityScanError(error);
  }
}

export const GET = withErrorHandler(handleRead);
export const POST = withErrorHandler(handleScan);

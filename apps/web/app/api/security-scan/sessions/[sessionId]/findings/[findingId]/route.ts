import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  SECURITY_SCAN_DECISIONS,
  SECURITY_SCAN_FINDING_ID_PATTERN,
  SecurityScanDecisionRequestSchema,
  type SecurityScanDecisionResponse,
} from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { recordAuditEvent } from '@/lib/security-audit';
import { securityScanRouteContext } from '@/features/security-scan/server/route-access';
import { rethrowSecurityScanError } from '@/features/security-scan/server/route-errors';
import { decideSecurityScanFinding } from '@/features/security-scan/server/service';

export const runtime = 'nodejs';
export const maxDuration = 120;

type RouteContext = { params: Promise<{ sessionId: string; findingId: string }> };

async function handleDecision(request: NextRequest, context: RouteContext) {
  const { sessionId, findingId } = await context.params;
  try {
    const scan = await securityScanRouteContext(request, sessionId, { mutation: true });
    if (scan instanceof Response) return scan;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw createError.validation('Invalid JSON request body');
    }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw createError.validation('Request body must be an object');
    }
    const parsed = SecurityScanDecisionRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw createError.validation(
        `Give a scanId and a decision of ${SECURITY_SCAN_DECISIONS.join(' or ')}`,
      );
    }
    if (!SECURITY_SCAN_FINDING_ID_PATTERN.test(findingId)) throw createError.notFound();
    const { scanId, decision } = parsed.data;
    const result: SecurityScanDecisionResponse = await decideSecurityScanFinding(scan, {
      scanId,
      findingId,
      decision,
    });
    await recordAuditEvent({
      userId: scan.owner.userId,
      organizationId: scan.owner.organizationId,
      request,
      eventType: 'code_session_lifecycle_changed',
      detail: {
        resourceType: 'code_session',
        resourceId: scan.sessionId,
        status: decision === 'approve' ? 'security_finding_approved' : 'security_finding_dismissed',
        ...(result.delivery ? { reason: result.delivery.status } : {}),
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    rethrowSecurityScanError(error);
  }
}

export const POST = withErrorHandler(handleDecision);

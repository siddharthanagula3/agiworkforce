import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';
import { resolveComplianceCaller } from '@/lib/server/compliance-caller';
import { getNeonDb } from '@/lib/server/neon-db';
import { iterateLegalHoldExport, readLegalHold } from '@/lib/services/ediscovery-export-service';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function handleGet(
  request: NextRequest,
  context: { params: Promise<{ holdId: string }> },
): Promise<Response> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { holdId } = await context.params;
  if (!UUID_RE.test(holdId)) throw createError.validation('holdId must be a uuid');

  const caller = await resolveComplianceCaller(
    request,
    'content.govern',
    'Your workspace role does not allow exporting held records.',
  );

  const privileged = getNeonDb();
  const hold = await readLegalHold(privileged, caller.organizationId, holdId);
  if (!hold) {
    throw createError.notFound('No legal hold with that id in this workspace.');
  }

  await recordAuditEvent({
    userId: caller.actorUserId,
    eventType: 'ediscovery_export',
    organizationId: caller.organizationId,
    request,
    outcome: 'success',
    severity: 'critical',
    detail: {
      resourceType: 'legal_hold',
      resourceId: hold.id,
      resourceName: hold.name,
      scope: hold.scope,
      targetUserId: hold.subjectUserId ?? undefined,
      role: caller.role,
      source: caller.kind,
    },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const batch of iterateLegalHoldExport(privileged, hold)) {
          controller.enqueue(
            encoder.encode(batch.map((record) => JSON.stringify(record)).join('\n') + '\n'),
          );
        }
        controller.close();
      } catch (error) {
        logger.error({ error, holdId: hold.id }, '[ediscovery-export] stream failed mid-export');
        controller.error(error);
      }
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Content-Disposition': `attachment; filename="agi-legal-hold-${hold.id}-${stamp}.jsonl"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export const GET = withErrorHandler(handleGet);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

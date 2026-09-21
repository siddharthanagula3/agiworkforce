import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';
import { resolveComplianceCaller } from '@/lib/server/compliance-caller';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  EdiscoveryManifestBuilder,
  iterateLegalHoldExport,
  readLegalHold,
  recordEdiscoveryExport,
  type EdiscoveryFilter,
} from '@/lib/services/ediscovery-export-service';
import { LEGAL_HOLD_RESOURCE_TYPES } from '@/lib/services/retention-service';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FilterSchema = z
  .object({
    resourceTypes: z.array(z.enum(LEGAL_HOLD_RESOURCE_TYPES)).min(1).nullable(),
    custodians: z.array(z.string().trim().min(1).max(255)).min(1).nullable(),
    from: z.string().datetime({ offset: true }).nullable(),
    to: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

function csv(value: string | null): string[] | null {
  if (value === null) return null;
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : null;
}

function parseFilter(url: URL): EdiscoveryFilter {
  const parsed = FilterSchema.safeParse({
    resourceTypes: csv(url.searchParams.get('resourceTypes')),
    custodians: csv(url.searchParams.get('custodians')),
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
  });
  if (!parsed.success) {
    throw createError.validation('Invalid export filter', parsed.error.issues);
  }
  const { custodians, ...rest } = parsed.data;
  if (rest.from && rest.to && Date.parse(rest.from) >= Date.parse(rest.to)) {
    throw createError.validation('The export window ends before it starts.');
  }
  return { ...rest, custodianUserIds: custodians };
}

async function handleGet(
  request: NextRequest,
  context: { params: Promise<{ holdId: string }> },
): Promise<Response> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { holdId } = await context.params;
  if (!UUID_RE.test(holdId)) throw createError.validation('holdId must be a uuid');

  const filter = parseFilter(new URL(request.url));

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
      scopes: filter.resourceTypes ?? undefined,
      role: caller.role,
      source: caller.kind,
    },
  });

  const startedAt = new Date().toISOString();
  const manifest = new EdiscoveryManifestBuilder(hold, filter);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of iterateLegalHoldExport(privileged, hold, filter)) {
          const bytes = encoder.encode(
            chunk.records.map((record) => JSON.stringify(record)).join('\n') + '\n',
          );
          manifest.add(chunk.resourceType, chunk.records.length, bytes, chunk.referenceOnly);
          controller.enqueue(bytes);
        }

        // The manifest is the last line rather than the first: its checksums
        // cover bytes that do not exist until the stream has produced them, and
        // a manifest written up front could only describe what was intended.
        const built = manifest.build(new Date().toISOString());
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: 'manifest', data: built }) + '\n'),
        );

        const custody = await recordEdiscoveryExport(privileged, {
          organizationId: caller.organizationId,
          holdId: hold.id,
          holdName: hold.name,
          requestedByUserId: caller.actorUserId,
          requestedVia: caller.kind,
          filter,
          manifest: built,
          outcome: 'completed',
          error: null,
          startedAt,
          completedAt: built.generatedAt,
        });
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: 'custody',
              data: {
                id: custody.id,
                previousHash: custody.previousHash,
                entryHash: custody.entryHash,
              },
            }) + '\n',
          ),
        );
        controller.close();
      } catch (error) {
        logger.error({ error, holdId: hold.id }, '[ediscovery-export] stream failed mid-export');
        // The bytes already sent are in somebody's hands, so the custody trail
        // records the partial export rather than only the runs that finished.
        await recordEdiscoveryExport(privileged, {
          organizationId: caller.organizationId,
          holdId: hold.id,
          holdName: hold.name,
          requestedByUserId: caller.actorUserId,
          requestedVia: caller.kind,
          filter,
          manifest: manifest.build(new Date().toISOString()),
          outcome: 'failed',
          error: error instanceof Error ? error.message : String(error),
          startedAt,
          completedAt: new Date().toISOString(),
        }).catch((custodyError: unknown) => {
          logger.error(
            { custodyError, holdId: hold.id },
            '[ediscovery-export] custody record could not be written for a failed export',
          );
        });
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

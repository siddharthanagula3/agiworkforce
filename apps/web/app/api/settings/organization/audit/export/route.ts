import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  isOrgAdminRole,
  requireOrgMember,
  resolveOrgMembership,
} from '@/lib/services/org-sharing-service';
import { requireTeamAdminAccess } from '@/app/api/settings/team/team-admin-access';
import { readOrganizationPolicy } from '@/lib/services/organization-policy-service';
import { evaluateOrganizationPolicy } from '@/lib/services/organization-policy-evaluator';
import {
  iterateAuditEventsForExport,
  type AuditEventFilters,
} from '@/lib/services/enterprise-audit-service';

export const runtime = 'nodejs';

const QuerySchema = z.object({
  actorUserId: z.string().max(255).optional(),
  action: z.string().max(160).optional(),
  resourceType: z.string().max(160).optional(),
  outcome: z.enum(['success', 'failure', 'denied']).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

function readParams(request: NextRequest): Record<string, string> {
  const out: Record<string, string> = {};
  // new URL(request.url) rather than request.nextUrl: the latter exists only on
  // a real NextRequest, so reading it makes the handler untestable with a plain
  // Request and turns a bad query string into a 500 instead of a 400.
  new URL(request.url).searchParams.forEach((value, key) => {
    if (value !== '') out[key] = value;
  });
  return out;
}

/**
 * Streams the workspace's audit trail as JSONL.
 *
 * JSONL rather than a JSON array so a multi-million-row extract never has to be
 * assembled in memory on either side, and so a consumer can process it line by
 * line. One event per line, in the same order the reader paginates.
 *
 * Gated on the `audit_export` policy resource. That resource has existed in the
 * evaluator since the policy plane landed and had nothing to govern; this is the
 * route that makes it real, which is the condition for offering the toggle back
 * to admins in the settings UI.
 */
async function handleGet(request: NextRequest): Promise<Response> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  await requireTeamAdminAccess(db, userId, membership.organizationId);

  if (!isOrgAdminRole(membership.role)) {
    throw createError.forbidden('Only an organization owner or admin can export the audit trail.');
  }

  const parsed = QuerySchema.safeParse(readParams(request));
  if (!parsed.success) {
    throw createError.validation('Invalid audit export query', parsed.error.issues);
  }
  const q = parsed.data;

  if (q.from && q.to && new Date(q.from) > new Date(q.to)) {
    throw createError.validation('The start of the range must not be after its end.');
  }

  // A saved policy may switch export off for the whole workspace. An
  // unconfigured organization is ungoverned and allowed, matching how every
  // other policy-gated path treats absence.
  const policy = await readOrganizationPolicy(db, membership.organizationId);
  if (policy) {
    const decision = evaluateOrganizationPolicy(policy, { resource: 'audit_export' });
    if (!decision.allowed) {
      await recordAuditEvent({
        userId,
        eventType: 'data_exported',
        organizationId: membership.organizationId,
        request,
        outcome: 'denied',
        severity: 'warning',
        detail: {
          resourceType: 'enterprise_audit_events',
          resourceId: membership.organizationId,
          reason: decision.code,
        },
      });
      throw createError.forbidden(decision.reason);
    }
  }

  const filters: AuditEventFilters = {
    ...(q.actorUserId ? { actorUserId: q.actorUserId } : {}),
    ...(q.action ? { action: q.action } : {}),
    ...(q.resourceType ? { resourceType: q.resourceType } : {}),
    ...(q.outcome ? { outcome: q.outcome } : {}),
    ...(q.severity ? { severity: q.severity } : {}),
    ...(q.from ? { from: q.from } : {}),
    ...(q.to ? { to: q.to } : {}),
  };

  // Reading the trail is itself an audited act. Recorded BEFORE the stream
  // opens: an export that fails halfway still has to leave evidence that
  // someone asked for the data.
  await recordAuditEvent({
    userId,
    eventType: 'data_exported',
    organizationId: membership.organizationId,
    request,
    outcome: 'success',
    severity: 'warning',
    detail: {
      resourceType: 'enterprise_audit_events',
      resourceId: membership.organizationId,
      role: membership.role,
      changedKeys: Object.keys(filters),
    },
  });

  const organizationId = membership.organizationId;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const batch of iterateAuditEventsForExport(db, organizationId, filters)) {
          controller.enqueue(encoder.encode(batch.map((e) => JSON.stringify(e)).join('\n') + '\n'));
        }
        controller.close();
      } catch (error) {
        logger.error({ error, organizationId }, '[audit-export] stream failed mid-export');
        // The response has already begun, so the status cannot change. Erroring
        // the stream truncates the download rather than letting a partial file
        // look complete to whoever receives it.
        controller.error(error);
      }
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Content-Disposition': `attachment; filename="agi-audit-${organizationId}-${stamp}.jsonl"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export const GET = withErrorHandler(handleGet);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

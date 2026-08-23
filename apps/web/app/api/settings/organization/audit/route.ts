import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  isOrgAdminRole,
  requireOrgMember,
  resolveOrgMembership,
} from '@/lib/services/org-sharing-service';
import { requireTeamAdminAccess } from '@/app/api/settings/team/team-admin-access';
import {
  AUDIT_PAGE_SIZE_DEFAULT,
  AUDIT_PAGE_SIZE_MAX,
  listAuditEvents,
  listAuditFacets,
  type AuditCursor,
  type AuditEventFilters,
} from '@/lib/services/enterprise-audit-service';
import type { EnterpriseAuditEvent } from '@agiworkforce/types';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const QuerySchema = z.object({
  actorUserId: z.string().max(255).optional(),
  action: z.string().max(160).optional(),
  resourceType: z.string().max(160).optional(),
  outcome: z.enum(['success', 'failure', 'denied']).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(AUDIT_PAGE_SIZE_MAX).optional(),
  cursorAt: z.string().datetime({ offset: true }).optional(),
  cursorId: z.string().regex(UUID_RE).optional(),
  facets: z.enum(['true', 'false']).optional(),
});

export interface OrganizationAuditResponse {
  organizationId: string;
  events: EnterpriseAuditEvent[];
  nextCursor: AuditCursor | null;
  facets?: { actions: string[]; resourceTypes: string[]; actors: string[] };
}

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

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  await requireTeamAdminAccess(db, userId, membership.organizationId);

  // The audit trail records who did what to whom. A plain member reading it
  // would be a disclosure, so this is owner/admin only — matching the
  // `enterprise_audit_events_admin_read` RLS policy rather than relying on it.
  if (!isOrgAdminRole(membership.role)) {
    throw createError.forbidden('Only an organization owner or admin can read the audit trail.');
  }

  const parsed = QuerySchema.safeParse(readParams(request));
  if (!parsed.success) {
    throw createError.validation('Invalid audit query', parsed.error.issues);
  }
  const q = parsed.data;

  if (q.from && q.to && new Date(q.from) > new Date(q.to)) {
    throw createError.validation('The start of the range must not be after its end.');
  }
  if ((q.cursorAt && !q.cursorId) || (q.cursorId && !q.cursorAt)) {
    throw createError.validation('A page cursor needs both cursorAt and cursorId.');
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

  const page = await listAuditEvents(db, membership.organizationId, filters, {
    limit: q.limit ?? AUDIT_PAGE_SIZE_DEFAULT,
    ...(q.cursorAt && q.cursorId ? { cursor: { createdAt: q.cursorAt, id: q.cursorId } } : {}),
  });

  const payload: OrganizationAuditResponse = {
    organizationId: membership.organizationId,
    events: page.events,
    nextCursor: page.nextCursor,
    ...(q.facets === 'true'
      ? { facets: await listAuditFacets(db, membership.organizationId) }
      : {}),
  };

  return NextResponse.json(payload);
}

export const GET = withErrorHandler(handleGet);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

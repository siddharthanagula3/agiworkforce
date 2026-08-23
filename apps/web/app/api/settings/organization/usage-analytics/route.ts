import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

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
  readOrganizationUsage,
  resolveUsageWindow,
  type OrganizationUsage,
} from '@/lib/services/organization-usage-service';

export const runtime = 'nodejs';

export interface OrganizationUsageResponse {
  currentUserRole: 'owner' | 'admin' | 'member' | 'viewer';
  usage: OrganizationUsage;
}

/**
 * Admin-only. Per-member spend is operational insight an administrator needs to
 * run a budget, and it is also a record of what each named person did — so it
 * is gated on the role that is accountable for the workspace rather than served
 * to everyone in it.
 */
async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  await requireTeamAdminAccess(db, userId, membership.organizationId);

  if (!isOrgAdminRole(membership.role)) {
    throw createError.forbidden(
      'Only an organization owner or admin can view workspace usage and spend.',
    );
  }

  const params = new URL(request.url).searchParams;
  const window = resolveUsageWindow(params.get('from'), params.get('to'));

  const usage = await readOrganizationUsage(db, membership.organizationId, window);

  const payload: OrganizationUsageResponse = { currentUserRole: membership.role, usage };
  return NextResponse.json(payload);
}

export const GET = withErrorHandler(handleGet);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

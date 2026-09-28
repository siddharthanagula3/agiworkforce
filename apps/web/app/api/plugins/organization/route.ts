import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { MemberOrganizationPluginsResponse } from '@agiworkforce/cloud-contracts';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { listWorkspaceMemberships } from '@/lib/services/active-workspace-service';
import {
  isMissingOrganizationPluginSchema,
  listMemberOrganizationPlugins,
} from '@/lib/services/organization-plugin-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'model-catalog', `user:${userId}`);
  if (limited) return limited;

  const empty: MemberOrganizationPluginsResponse = {
    organizationId: null,
    organizationName: null,
    plugins: [],
  };
  if (!organizationId) return NextResponse.json(empty);
  try {
    const [plugins, memberships] = await Promise.all([
      listMemberOrganizationPlugins(db, userId, organizationId),
      listWorkspaceMemberships(db, userId),
    ]);
    const body: MemberOrganizationPluginsResponse = {
      organizationId,
      organizationName:
        memberships.find((membership) => membership.id === organizationId)?.name ?? null,
      plugins,
    };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (isMissingOrganizationPluginSchema(error)) return NextResponse.json(empty);
    throw error;
  }
}

export const GET = withCorsRoute(withErrorHandler(handleGet));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

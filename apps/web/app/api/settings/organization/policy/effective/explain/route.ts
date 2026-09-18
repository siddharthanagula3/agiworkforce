import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { getNeonDb } from '@/lib/server/neon-db';
import { explainMemberAuthorization, resolveAuthorizationFacts } from '@/lib/authorization';
import {
  requirePermission,
  resolveOrganizationAccess,
} from '@/lib/services/organization-permission-service';

export const runtime = 'nodejs';

const INSPECT_OTHERS_DENIED =
  'Your workspace role does not allow inspecting the effective access of another member.';

// Anybody may ask about themselves; asking about somebody else is an
// administrative act and needs members.manage.
async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId, organizationId } = await getUserScopedDb(request);
  if (!organizationId) {
    return NextResponse.json({
      organizationId: null,
      governed: false,
      subjectUserId: userId,
      explanation: null,
      controls: null,
    });
  }

  const requested = request.nextUrl.searchParams.get('userId')?.trim() || userId;
  if (requested !== userId) {
    requirePermission(
      await resolveOrganizationAccess(organizationId, userId),
      'members.manage',
      INSPECT_OTHERS_DENIED,
    );
  }

  const db = getNeonDb();
  const projectId = request.nextUrl.searchParams.get('projectId')?.trim() || null;
  const deviceId = request.nextUrl.searchParams.get('deviceId')?.trim() || null;
  const scope = { organizationId, projectId, deviceId };

  const [explanation, facts] = await Promise.all([
    explainMemberAuthorization(db, organizationId, requested, scope),
    resolveAuthorizationFacts(db, requested, scope),
  ]);

  return NextResponse.json(
    {
      organizationId,
      governed: true,
      subjectUserId: requested,
      explanation,
      controls: facts.controls,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export const GET = withErrorHandler(handleGet);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

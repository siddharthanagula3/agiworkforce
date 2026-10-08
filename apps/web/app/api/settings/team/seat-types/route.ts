import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { TeamSeatTypeSummary } from '@agiworkforce/types';
import { getClerkAuthUser } from '@/lib/api-auth';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import { resolveOrganizationMembershipId } from '@/lib/services/active-workspace-service';
import { readSeatTypeSummary } from '@/lib/services/team-seat-type-service';

const OrganizationIdSchema = z.string().uuid('organizationId must be a UUID');

async function handleRead(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-team-list');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const parsed = OrganizationIdSchema.safeParse(
    new URL(request.url).searchParams.get('organizationId'),
  );
  if (!parsed.success) {
    throw createError.validation('organizationId must be a UUID', parsed.error.issues);
  }

  const db = getNeonDb();
  if (!(await resolveOrganizationMembershipId(db, userId, parsed.data))) {
    throw createError.forbidden('You are not a member of this organization');
  }

  const seatTypes: TeamSeatTypeSummary | null = await readSeatTypeSummary(db, parsed.data);
  return NextResponse.json({ seatTypes });
}

export const GET = withErrorHandler(handleRead);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}

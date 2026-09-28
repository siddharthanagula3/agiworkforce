import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { DATA_REGION_IDS } from '@agiworkforce/compliance';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import { completeOrganizationRegionMove, listPendingRegionMoves } from '@/lib/server/data-region';

const CompleteSchema = z
  .object({
    organizationId: z.string().trim().min(1).max(255),
    region: z.enum(DATA_REGION_IDS),
  })
  .strict();

async function handleList(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'admin-security');
  if (rateLimitResponse) return rateLimitResponse;

  await requirePlatformAdmin(request);

  return NextResponse.json(
    { moves: await listPendingRegionMoves(getNeonDb()) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

async function handleComplete(request: NextRequest): Promise<NextResponse> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'admin-security');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await requirePlatformAdmin(request);

  const parsed = CompleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.badRequest('Invalid region move completion', parsed.error.flatten());
  }

  try {
    const region = await completeOrganizationRegionMove({
      db: getNeonDb(),
      organizationId: parsed.data.organizationId,
      actorUserId: userId,
      target: parsed.data.region,
    });
    return NextResponse.json({ region });
  } catch (error) {
    if (error instanceof RegionMoveNotRequestedError) {
      throw createError.conflict(error.message);
    }
    throw error;
  }
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handleComplete);

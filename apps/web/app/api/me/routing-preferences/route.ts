
import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import type { ProfileRow } from '@/lib/server/neon-types';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';

const RoutingPreferencesSchema = z.object({
  us_only: z.boolean().optional(),
  geo_overlay: z.enum(['auto', 'us', 'in', 'cn']).optional(),
});

type RoutingPreferences = z.infer<typeof RoutingPreferencesSchema>;

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  try {
    const [row] = await db.query<ProfileRow>(
      'select routing_preferences from profiles where id = $1 limit 1',
      [userId],
    );
    const raw = row?.routing_preferences;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return NextResponse.json({});
    }
    return NextResponse.json(raw);
  } catch (error) {
    logger.warn(
      { userId, error: error instanceof Error ? error.message : String(error) },
      '[routing-preferences] read failed · returning {}',
    );
    return NextResponse.json({});
  }
}

async function handlePut(request: NextRequest): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw createError.validation('Invalid JSON body');
  }

  const parsed = RoutingPreferencesSchema.safeParse(raw);
  if (!parsed.success) {
    const messages = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw createError.validation(`Invalid routing preferences: ${messages}`);
  }

  const next: RoutingPreferences = parsed.data;

  const count = await db.execute(
    'update profiles set routing_preferences = $1::jsonb, updated_at = now() where id = $2',
    [JSON.stringify(next), userId],
  );

  if (count === 0) {
    logger.warn({ userId }, '[routing-preferences] no profile row matched');
    throw createError.notFound('Profile not found');
  }

  return NextResponse.json(next);
}

export const GET = withErrorHandler(handleGet);
export const PUT = withErrorHandler(handlePut);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}

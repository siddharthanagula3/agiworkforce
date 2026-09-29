import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { RoutingPreferencesSchema, type RoutingPreferences } from '@agiworkforce/cloud-contracts';

import { getUserScopedDb } from '@/lib/server/rls-db';
import type { ProfileRow } from '@/lib/server/neon-types';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';

/** Each stored field is read on its own, so one invalid value never hides the rest. */
function readStoredPreferences(value: unknown): RoutingPreferences {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(RoutingPreferencesSchema.shape).flatMap(([key, field]) => {
      const parsed = field.safeParse(record[key]);
      return parsed.success && parsed.data !== undefined ? [[key, parsed.data]] : [];
    }),
  ) as RoutingPreferences;
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request, { resolveOrganization: false });

  try {
    const [row] = await db.query<ProfileRow>(
      'select routing_preferences from profiles where id = $1 limit 1',
      [userId],
    );
    return NextResponse.json(readStoredPreferences(row?.routing_preferences));
  } catch (error) {
    logger.warn(
      { userId, error: error instanceof Error ? error.message : String(error) },
      '[routing-preferences] read failed · returning {}',
    );
    const preferences: RoutingPreferences = {};
    return NextResponse.json(preferences);
  }
}

async function handlePut(request: NextRequest): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request, { resolveOrganization: false });

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

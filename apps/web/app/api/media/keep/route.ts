import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  ManagedMediaKeepRequestSchema,
  type ManagedMediaKeepResponse,
} from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { saveTemporaryChatAssetToLibrary } from '@/lib/server/media-assets';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';

export const runtime = 'nodejs';

async function handleKeepMedia(request: NextRequest): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }
  const parsed = ManagedMediaKeepRequestSchema.safeParse(rawBody);
  if (!parsed.success) throw createError.validation('Choose a file to keep');

  const { db, userId } = await getUserScopedDb(request);
  const kept = await saveTemporaryChatAssetToLibrary(userId, parsed.data.id, db);
  if (!kept) throw createError.notFound('That file is no longer waiting to be kept');

  const reply: ManagedMediaKeepResponse = { kept: true };
  return NextResponse.json(reply);
}

export const POST = withCorsRoute(withErrorHandler(handleKeepMedia));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

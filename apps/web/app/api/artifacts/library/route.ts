import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { requireCsrfToken } from '@/lib/csrf';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  CreateStudioLibraryItemSchema,
  STUDIO_LIBRARY_KINDS,
  StudioLibraryLimitError,
  createStudioLibraryItem,
  listStudioLibraryItems,
} from '@/lib/services/studio-library-service';

export const runtime = 'nodejs';

const KindSchema = z.enum(STUDIO_LIBRARY_KINDS).optional();

async function handleList(request: NextRequest): Promise<Response> {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;
  const kind = KindSchema.safeParse(new URL(request.url).searchParams.get('kind') ?? undefined);
  if (!kind.success) throw createError.validation('Unknown library kind');
  const { db, userId } = await getUserScopedDb(request);
  const items = await listStudioLibraryItems(db, {
    userId,
    ...(kind.data ? { kind: kind.data } : {}),
  });
  return NextResponse.json({ items });
}

async function handleCreate(request: NextRequest): Promise<Response> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Request body must be JSON');
  }
  const parsed = CreateStudioLibraryItemSchema.safeParse(rawBody);
  if (!parsed.success) throw createError.validation('Invalid library item', parsed.error.flatten());
  const { db, userId } = await getUserScopedDb(request);
  try {
    const item = await createStudioLibraryItem(db, { userId, ...parsed.data });
    if (!item) throw createError.internal('The item was not saved');
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof StudioLibraryLimitError) throw createError.conflict(error.message);
    throw error;
  }
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handleCreate);

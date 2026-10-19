import 'server-only';

import { NextRequest } from 'next/server';
import { StudioLibraryItemIdSchema } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { requireCsrfToken } from '@/lib/csrf';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { deleteStudioLibraryItem } from '@/lib/services/studio-library-service';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ itemId: string }> };

async function handleDelete(request: NextRequest, context: RouteContext): Promise<Response> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;
  const { itemId } = await context.params;
  if (!StudioLibraryItemIdSchema.safeParse(itemId).success)
    throw createError.notFound('Item not found');
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;
  const { db, userId } = await getUserScopedDb(request);
  if (!(await deleteStudioLibraryItem(db, { userId, itemId }))) {
    throw createError.notFound('Item not found');
  }
  return new Response(null, { status: 204 });
}

export const DELETE = withErrorHandler(handleDelete);

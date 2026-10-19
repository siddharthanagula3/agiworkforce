import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { requireCsrfToken } from '@/lib/csrf';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { PUBLISHED_TOKEN_REGEX } from '@/lib/services/published-artifact-service';
import {
  ViewerEmailSchema,
  ViewerLimitError,
  addSiteViewer,
  listSiteViewers,
  removeSiteViewer,
} from '@/lib/services/published-site-viewer-service';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ token: string }> };

const BodySchema = z.object({ email: ViewerEmailSchema });

async function readToken(context: RouteContext): Promise<string> {
  const { token } = await context.params;
  if (!PUBLISHED_TOKEN_REGEX.test(token))
    throw createError.notFound('Published artifact not found');
  return token;
}

async function readEmail(request: NextRequest): Promise<string> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Request body must be JSON');
  }
  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) throw createError.validation('Enter a valid email address');
  return parsed.data.email;
}

async function handleList(request: NextRequest, context: RouteContext): Promise<Response> {
  const token = await readToken(context);
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;
  const { db, userId } = await getUserScopedDb(request);
  const viewers = await listSiteViewers(db, { userId, token });
  if (!viewers) throw createError.notFound('Published artifact not found');
  return NextResponse.json({ viewers });
}

async function handleAdd(request: NextRequest, context: RouteContext): Promise<Response> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;
  const token = await readToken(context);
  const rateLimitResponse = await withRateLimit(request, 'share-create');
  if (rateLimitResponse) return rateLimitResponse;
  const email = await readEmail(request);
  const { db, userId } = await getUserScopedDb(request);
  try {
    const viewers = await addSiteViewer(db, { userId, token, email });
    if (!viewers) throw createError.notFound('Published artifact not found');
    return NextResponse.json({ viewers });
  } catch (error) {
    if (error instanceof ViewerLimitError) throw createError.conflict(error.message);
    throw error;
  }
}

async function handleRemove(request: NextRequest, context: RouteContext): Promise<Response> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;
  const token = await readToken(context);
  const rateLimitResponse = await withRateLimit(request, 'share-create');
  if (rateLimitResponse) return rateLimitResponse;
  const email = await readEmail(request);
  const { db, userId } = await getUserScopedDb(request);
  const viewers = await removeSiteViewer(db, { userId, token, email });
  if (!viewers) throw createError.notFound('Published artifact not found');
  return NextResponse.json({ viewers });
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handleAdd);
export const DELETE = withErrorHandler(handleRemove);

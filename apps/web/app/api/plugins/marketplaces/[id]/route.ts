import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getClerkAuthUser } from '@/lib/api-auth';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import { createError } from '@/lib/errors';
import {
  deleteMarketplaceSource,
  isMissingPluginMarketplaceSchema,
} from '@/lib/services/plugin-marketplace-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ id: z.string().uuid() });

type RouteContext = { params: Promise<{ id: string }> };

async function handleDelete(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { userId } = await getClerkAuthUser(request);
  const csrf = await requireCsrfToken(request, userId);
  if (csrf) return csrf as NextResponse;
  const limited = await withRateLimit(request, 'plugin-installation-write', `user:${userId}`);
  if (limited) return limited;

  const params = ParamsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json(
      { error: { code: 'MARKETPLACE_SOURCE_NOT_FOUND', message: 'Marketplace source not found.' } },
      { status: 404 },
    );
  }

  let removed: boolean;
  try {
    removed = await deleteMarketplaceSource(getNeonDb(), userId, params.data.id);
  } catch (error) {
    if (isMissingPluginMarketplaceSchema(error)) {
      throw createError.serviceUnavailable(
        'The plugin marketplace is not available yet. Please try again later.',
      );
    }
    throw error;
  }
  if (!removed) {
    return NextResponse.json(
      { error: { code: 'MARKETPLACE_SOURCE_NOT_FOUND', message: 'Marketplace source not found.' } },
      { status: 404 },
    );
  }
  return new NextResponse(null, { status: 204 });
}

export const DELETE = withCorsRoute(withErrorHandler(handleDelete));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

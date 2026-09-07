import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getClerkAuthUser } from '@/lib/api-auth';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  isMissingPluginMarketplaceSchema,
  refreshMarketplaceSource,
} from '@/lib/services/plugin-marketplace-service';
import { marketplaceUnavailableError } from '@/features/plugins/server/directory/install-responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ id: z.string().uuid() });

type RouteContext = { params: Promise<{ id: string }> };

async function handlePost(request: NextRequest, context: RouteContext): Promise<NextResponse> {
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

  let source;
  try {
    source = await refreshMarketplaceSource(getNeonDb(), userId, params.data.id);
  } catch (error) {
    if (isMissingPluginMarketplaceSchema(error)) throw marketplaceUnavailableError();
    throw error;
  }
  if (!source) {
    return NextResponse.json(
      { error: { code: 'MARKETPLACE_SOURCE_NOT_FOUND', message: 'Marketplace source not found.' } },
      { status: 404 },
    );
  }
  return NextResponse.json({ source });
}

export const POST = withCorsRoute(withErrorHandler(handlePost));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

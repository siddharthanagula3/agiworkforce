import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { PluginScanResponse } from '@agiworkforce/cloud-contracts';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { findPluginScanForUser } from '@/lib/services/plugin-marketplace-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9._-]{0,127}$/),
});

async function handleGet(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { db, userId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'model-catalog', `user:${userId}`);
  if (limited) return limited;

  const params = ParamsSchema.safeParse(await context.params);
  const body: PluginScanResponse = {
    scan: params.success ? await findPluginScanForUser(db, userId, params.data.id) : null,
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}

export const GET = withCorsRoute(withErrorHandler(handleGet));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

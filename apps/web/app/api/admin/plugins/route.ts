import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { PLUGIN_DIRECTORY_MAX_SEARCH_CHARS } from '@/features/plugins/server/directory/constants';
import { requirePlatformAdmin } from '@/lib/auth-guards';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import { listPluginModerationEntries } from '@/lib/services/plugin-registry-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const SearchSchema = z.string().trim().max(PLUGIN_DIRECTORY_MAX_SEARCH_CHARS);

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;
  await requirePlatformAdmin(request);

  const search = SearchSchema.safeParse(request.nextUrl.searchParams.get('q') ?? '');
  if (!search.success) throw createError.validation('The search is too long.');

  const { entries, total } = await listPluginModerationEntries(getNeonDb(), search.data);
  return NextResponse.json({ plugins: entries, total }, { headers: NO_STORE });
}

export const GET = withCorsRoute(withErrorHandler(handleGet));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

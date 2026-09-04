import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { getClerkAuthUser } from '@/lib/api-auth';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import { createError } from '@/lib/errors';
import {
  isMissingPluginMarketplaceSchema,
  listMarketplaceEntriesForUser,
} from '@/lib/services/plugin-marketplace-service';
import type { PluginMarketplaceEntryListResponse } from '@agiworkforce/cloud-contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const { userId } = await getClerkAuthUser(request);
  const limited = await withRateLimit(request, 'model-catalog', `user:${userId}`);
  if (limited) return limited;

  let entries;
  try {
    entries = await listMarketplaceEntriesForUser(getNeonDb(), userId);
  } catch (error) {
    if (isMissingPluginMarketplaceSchema(error)) {
      throw createError.serviceUnavailable(
        'The plugin marketplace is not available yet. Please try again later.',
      );
    }
    throw error;
  }

  const body: PluginMarketplaceEntryListResponse = { entries };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}

export const GET = withCorsRoute(withErrorHandler(handleGet));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

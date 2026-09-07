import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { getClerkAuthUser } from '@/lib/api-auth';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  isMissingPluginMarketplaceSchema,
  listMarketplaceEntriesForUser,
  listMarketplaceSources,
} from '@/lib/services/plugin-marketplace-service';
import { isShadowSourceName } from '@/features/plugins/server/directory/constants';
import { marketplaceUnavailableError } from '@/features/plugins/server/directory/install-responses';
import type { PluginMarketplaceEntryListResponse } from '@agiworkforce/cloud-contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const { userId } = await getClerkAuthUser(request);
  const limited = await withRateLimit(request, 'model-catalog', `user:${userId}`);
  if (limited) return limited;

  let entries;
  let sources;
  try {
    [entries, sources] = await Promise.all([
      listMarketplaceEntriesForUser(getNeonDb(), userId),
      listMarketplaceSources(getNeonDb(), userId),
    ]);
  } catch (error) {
    if (isMissingPluginMarketplaceSchema(error)) {
      throw marketplaceUnavailableError();
    }
    throw error;
  }

  const hiddenSourceIds = new Set(
    sources.filter((source) => isShadowSourceName(source.name)).map((source) => source.id),
  );
  const body: PluginMarketplaceEntryListResponse = {
    entries: entries.filter((entry) => !hiddenSourceIds.has(entry.sourceId)),
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}

export const GET = withCorsRoute(withErrorHandler(handleGet));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  listMarketplaceEntriesForUser,
  listMarketplaceSources,
} from '@/lib/services/plugin-marketplace-service';
import { isShadowSourceName } from '@/features/plugins/server/directory/constants';
import type { PluginMarketplaceEntryListResponse } from '@agiworkforce/cloud-contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const { db, userId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'model-catalog', `user:${userId}`);
  if (limited) return limited;

  const [entries, sources] = await Promise.all([
    listMarketplaceEntriesForUser(db, userId),
    listMarketplaceSources(db, userId),
  ]);

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

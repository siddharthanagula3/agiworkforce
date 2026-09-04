import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { resolveAuthModeForRecord } from '@/lib/connectors/directory/auth-probe';
import {
  pendingSiteIconSource,
  resolveSiteIconForRecord,
} from '@/lib/connectors/directory/favicon-probe';
import { getSnapshotRecords } from '@/lib/connectors/directory/memory-cache';
import { discoverAndCacheToolNames } from '@/lib/connectors/directory/tool-discovery';
import { toDirectoryEntryView } from '@/lib/connectors/directory/view';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGet(
  request: NextRequest,
  context: { params: Promise<{ id: string[] }> },
): Promise<NextResponse> {
  const rateLimited = await withRateLimit(request, 'chat-conversation');
  if (rateLimited) return rateLimited;

  const { id } = await context.params;
  const connectorId = id.map((segment) => decodeURIComponent(segment)).join('/');
  if (!connectorId) throw createError.validation('Connector directory id is required');

  const records = await getSnapshotRecords();
  let record = records.find((entry) => entry.id === connectorId) ?? null;
  if (!record) throw createError.notFound('Connector directory entry not found');

  if (record.authMode === 'unknown') {
    record = await resolveAuthModeForRecord(record);
  }

  if (pendingSiteIconSource(record)) {
    record = await resolveSiteIconForRecord(record);
  }

  if (record.toolNames.length === 0) {
    const auth = await getClerkAuthUser(request).catch(() => null);
    if (auth?.userId) {
      const discovered = await discoverAndCacheToolNames(auth.userId, record.id, record.toolNames);
      if (discovered && discovered.length > 0) record = { ...record, toolNames: discovered };
    }
  }

  return NextResponse.json(
    { entry: toDirectoryEntryView(record) },
    { status: 200, headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } },
  );
}

export const GET = withCorsRoute(withErrorHandler(handleGet));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { DIRECTORY_CATEGORIES } from '@/lib/connectors/directory/categorize';
import { readDirectorySnapshot } from '@/lib/connectors/directory/snapshot-cache';
import { toDirectoryEntryView } from '@/lib/connectors/directory/view';
import type {
  DirectoryAuthMode,
  DirectoryConnectableMode,
  DirectoryRecord,
} from '@/lib/connectors/directory/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIRECTORY_DEFAULT_LIMIT = 25;
const DIRECTORY_MAX_LIMIT = 100;
const AUTH_MODES: readonly DirectoryAuthMode[] = ['none', 'oauth', 'api-key', 'unknown'];
const CONNECTABLE_MODES: readonly DirectoryConnectableMode[] = [
  'connect',
  'api-key-form',
  'desktop-and-cli',
  'needs-setup',
];

const QuerySchema = z.object({
  search: z.string().trim().min(1).max(200).optional(),
  category: z.enum(DIRECTORY_CATEGORIES).optional(),
  authMode: z.enum(AUTH_MODES as [DirectoryAuthMode, ...DirectoryAuthMode[]]).optional(),
  connectableOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(DIRECTORY_MAX_LIMIT).optional(),
  cursor: z.string().regex(/^\d+$/).optional(),
});

function matchesSearch(record: DirectoryRecord, search: string): boolean {
  const needle = search.toLowerCase();
  return (
    record.name.toLowerCase().includes(needle) ||
    record.publisher.toLowerCase().includes(needle) ||
    record.description.toLowerCase().includes(needle)
  );
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimited = await withRateLimit(request, 'chat-conversation');
  if (rateLimited) return rateLimited;

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    search: url.searchParams.get('search') ?? undefined,
    category: url.searchParams.get('category') ?? undefined,
    authMode: url.searchParams.get('authMode') ?? undefined,
    connectableOnly: url.searchParams.get('connectableOnly') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    cursor: url.searchParams.get('cursor') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_QUERY', message: 'Invalid connector directory query' } },
      { status: 400 },
    );
  }

  try {
    const snapshot = await readDirectorySnapshot();
    const records = snapshot?.records ?? [];
    const query = parsed.data;

    const filtered = records.filter((record) => {
      if (query.search && !matchesSearch(record, query.search)) return false;
      if (query.category && !record.categories.includes(query.category)) return false;
      if (query.authMode && record.authMode !== query.authMode) return false;
      if (query.connectableOnly && record.connectable !== 'connect') return false;
      return true;
    });

    const limit = query.limit ?? DIRECTORY_DEFAULT_LIMIT;
    const offset = query.cursor ? Number.parseInt(query.cursor, 10) : 0;
    const page = filtered.slice(offset, offset + limit);
    const nextOffset = offset + page.length;

    return NextResponse.json(
      {
        entries: page.map(toDirectoryEntryView),
        total: filtered.length,
        nextCursor: nextOffset < filtered.length ? String(nextOffset) : null,
        updatedAt: snapshot?.updatedAt ?? null,
        categories: DIRECTORY_CATEGORIES,
        connectableModes: CONNECTABLE_MODES,
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
      },
    );
  } catch (error) {
    logger.error({ error }, 'Connector directory list failed');
    return NextResponse.json(
      {
        error: {
          code: 'CONNECTOR_DIRECTORY_UNAVAILABLE',
          message: 'Connector directory unavailable',
        },
      },
      { status: 503 },
    );
  }
}

export const GET = withCorsRoute(withErrorHandler(handleGet));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

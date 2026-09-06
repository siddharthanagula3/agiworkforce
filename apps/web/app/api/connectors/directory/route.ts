import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { DIRECTORY_CATEGORIES } from '@/lib/connectors/directory/categorize';
import { getSnapshotView } from '@/lib/connectors/directory/memory-cache';
import {
  DIRECTORY_AUTH_MODES,
  DIRECTORY_BADGES,
  DIRECTORY_CONNECTABLE_MODES,
  compareDirectoryRecordsByName,
  isConnectableNow,
} from '@/lib/connectors/directory/snapshot-view';
import { toDirectoryEntryView } from '@/lib/connectors/directory/view';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIRECTORY_DEFAULT_LIMIT = 25;
const DIRECTORY_MAX_LIMIT = 100;
const SEARCH_MAX_LENGTH = 200;
const DIRECTORY_SORTS = ['popular', 'name'] as const;
type DirectorySort = (typeof DIRECTORY_SORTS)[number];
const DEFAULT_SORT: DirectorySort = 'popular';
const NAME_SORT: DirectorySort = 'name';

function enumOf<Value extends string>(values: readonly Value[]) {
  return z.enum(values as [Value, ...Value[]]);
}

const BooleanParam = z.enum(['true', 'false']).transform((value) => value === 'true');

const QuerySchema = z.object({
  search: z.string().trim().min(1).max(SEARCH_MAX_LENGTH).optional(),
  category: z.enum(DIRECTORY_CATEGORIES).optional(),
  badge: enumOf(DIRECTORY_BADGES).optional(),
  connectable: enumOf(DIRECTORY_CONNECTABLE_MODES).optional(),
  connectableOnly: BooleanParam.optional(),
  authMode: enumOf(DIRECTORY_AUTH_MODES).optional(),
  sort: z.enum(DIRECTORY_SORTS).default(DEFAULT_SORT),
  limit: z.coerce.number().int().min(1).max(DIRECTORY_MAX_LIMIT).default(DIRECTORY_DEFAULT_LIMIT),
  cursor: z.string().regex(/^\d+$/).optional(),
});

type DirectoryQuery = z.infer<typeof QuerySchema>;

type SearchMatcher = (record: DirectoryRecord, needle: string) => boolean;

const SEARCH_MATCHERS: readonly SearchMatcher[] = [
  (record, needle) => record.name.toLowerCase() === needle,
  (record, needle) => record.name.toLowerCase().startsWith(needle),
  (record, needle) => record.name.toLowerCase().includes(needle),
  (record, needle) => record.publisher.toLowerCase().includes(needle),
  (record, needle) => record.toolNames.some((tool) => tool.toLowerCase().includes(needle)),
  (record, needle) => record.description.toLowerCase().includes(needle),
];

function searchRank(record: DirectoryRecord, needle: string): number {
  return SEARCH_MATCHERS.findIndex((matches) => matches(record, needle));
}

function matchesFilters(record: DirectoryRecord, query: DirectoryQuery): boolean {
  if (query.category && !record.categories.includes(query.category)) return false;
  if (query.badge && record.badge !== query.badge) return false;
  if (query.connectable && record.connectable !== query.connectable) return false;
  if (query.connectableOnly && !isConnectableNow(record)) return false;
  if (query.authMode && record.authMode !== query.authMode) return false;
  return true;
}

function selectRecords(
  records: readonly DirectoryRecord[],
  query: DirectoryQuery,
): DirectoryRecord[] {
  const filtered = records.filter((record) => matchesFilters(record, query));
  const needle = query.search?.toLowerCase();
  const selected = needle
    ? filtered
        .map((record) => ({ record, rank: searchRank(record, needle) }))
        .filter(({ rank }) => rank >= 0)
        .sort((left, right) => left.rank - right.rank)
        .map(({ record }) => record)
    : filtered;
  if (query.sort === NAME_SORT) selected.sort(compareDirectoryRecordsByName);
  return selected;
}

function readQuery(url: URL) {
  const raw = Object.fromEntries(
    Object.keys(QuerySchema.shape).map((key) => [key, url.searchParams.get(key) ?? undefined]),
  );
  return QuerySchema.safeParse(raw);
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimited = await withRateLimit(request, 'chat-conversation');
  if (rateLimited) return rateLimited;

  const parsed = readQuery(new URL(request.url));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_QUERY', message: 'Invalid connector directory query' } },
      { status: 400 },
    );
  }

  try {
    const query = parsed.data;
    const view = await getSnapshotView();
    const selected = selectRecords(view.records, query);

    const offset = query.cursor ? Number.parseInt(query.cursor, 10) : 0;
    const page = selected.slice(offset, offset + query.limit);
    const nextOffset = offset + page.length;

    return NextResponse.json(
      {
        entries: page.map(toDirectoryEntryView),
        total: selected.length,
        nextCursor: nextOffset < selected.length ? String(nextOffset) : null,
        categories: DIRECTORY_CATEGORIES,
        connectableModes: DIRECTORY_CONNECTABLE_MODES,
        stats: {
          ...view.counts,
          bootstrapComplete: view.bootstrapComplete,
          lastSyncAt: view.lastSyncAt,
        },
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

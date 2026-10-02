import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  ConnectorDirectoryQuerySchema,
  type ConnectorDirectoryListResponse,
  type ConnectorDirectoryQuery,
  type ConnectorDirectorySort,
  type ConnectorErrorResponse,
} from '@agiworkforce/cloud-contracts';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { DIRECTORY_CATEGORIES } from '@/lib/connectors/directory/categorize';
import { getSnapshotView } from '@/lib/connectors/directory/memory-cache';
import {
  DIRECTORY_CONNECTABLE_MODES,
  compareDirectoryRecordsByName,
  isConnectableNow,
} from '@/lib/connectors/directory/snapshot-view';
import { toDirectoryEntryView } from '@/lib/connectors/directory/view';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NAME_SORT: ConnectorDirectorySort = 'name';

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

function matchesFilters(record: DirectoryRecord, query: ConnectorDirectoryQuery): boolean {
  if (query.category && !record.categories.includes(query.category)) return false;
  if (query.badge && record.badge !== query.badge) return false;
  if (query.connectable && record.connectable !== query.connectable) return false;
  if (query.connectableOnly && !isConnectableNow(record)) return false;
  if (query.authMode && record.authMode !== query.authMode) return false;
  return true;
}

function selectRecords(
  records: readonly DirectoryRecord[],
  query: ConnectorDirectoryQuery,
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
    Object.keys(ConnectorDirectoryQuerySchema.shape).map((key) => [
      key,
      url.searchParams.get(key) ?? undefined,
    ]),
  );
  return ConnectorDirectoryQuerySchema.safeParse(raw);
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimited = await withRateLimit(request, 'chat-conversation');
  if (rateLimited) return rateLimited;

  const parsed = readQuery(new URL(request.url));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: { code: 'INVALID_QUERY', message: 'Invalid connector directory query' },
      } satisfies ConnectorErrorResponse,
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
        categories: [...DIRECTORY_CATEGORIES],
        connectableModes: [...DIRECTORY_CONNECTABLE_MODES],
        stats: {
          ...view.counts,
          bootstrapComplete: view.bootstrapComplete,
          lastSyncAt: view.lastSyncAt,
        },
      } satisfies ConnectorDirectoryListResponse,
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
          'Vercel-CDN-Cache-Control': 'max-age=3600, stale-while-revalidate=86400',
          Vary: 'Origin',
        },
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
      } satisfies ConnectorErrorResponse,
      { status: 503 },
    );
  }
}

export const GET = withCorsRoute(withErrorHandler(handleGet));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

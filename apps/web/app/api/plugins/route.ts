import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withRateLimit } from '@/lib/rate-limit';
import { getCorsHeaders, getSecurityHeaders, handleCorsPreflightRequest } from '@/lib/cors';
import { logger } from '@/lib/logger';
import { loadPluginDirectory } from '@/features/plugins/server/directory/catalog';
import {
  PLUGIN_DIRECTORY_MAX_CURSOR_CHARS,
  PLUGIN_DIRECTORY_MAX_LIMIT,
  PLUGIN_DIRECTORY_MAX_SEARCH_CHARS,
  PLUGIN_SORTS,
  PLUGIN_SOURCE_FACETS,
  PLUGIN_WORKS_WITH,
} from '@/features/plugins/server/directory/constants';
import { queryPluginDirectory } from '@/features/plugins/server/directory/query';
import type { PluginDirectoryListResponse } from '@/features/plugins/server/directory/types';
import { PLUGIN_REGISTRY_STATUSES, type PluginRegistryStatus } from '@agiworkforce/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CURSOR_PATTERN = new RegExp(`^\\d{1,${PLUGIN_DIRECTORY_MAX_CURSOR_CHARS}}$`);
const CATEGORY_MAX_CHARS = 100;
const OFFSET_MAX = 10_000;
const BooleanParam = z.enum(['true', 'false']).transform((value) => value === 'true');

const QuerySchema = z.object({
  search: z.string().trim().min(1).max(PLUGIN_DIRECTORY_MAX_SEARCH_CHARS).optional(),
  verified: BooleanParam.optional(),
  worksWith: z.enum(PLUGIN_WORKS_WITH).optional(),
  source: z.enum(PLUGIN_SOURCE_FACETS).optional(),
  category: z.string().trim().min(1).max(CATEGORY_MAX_CHARS).optional(),
  status: z.enum(PLUGIN_REGISTRY_STATUSES as unknown as [string, ...string[]]).optional(),
  sort: z.enum(PLUGIN_SORTS).optional(),
  limit: z.coerce.number().int().min(1).max(PLUGIN_DIRECTORY_MAX_LIMIT).optional(),
  cursor: z.string().regex(CURSOR_PATTERN).optional(),
  offset: z.coerce.number().int().min(0).max(OFFSET_MAX).optional(),
});

function readQuery(url: URL) {
  const raw = Object.fromEntries(
    Object.keys(QuerySchema.shape).map((key) => [key, url.searchParams.get(key) ?? undefined]),
  );
  return QuerySchema.safeParse(raw);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const preflight = handleCorsPreflightRequest(request);
  if (preflight) return preflight;

  const rateLimited = await withRateLimit(request, 'model-catalog');
  if (rateLimited) return rateLimited;

  const headers = { ...getCorsHeaders(request), ...getSecurityHeaders() };
  const parsed = readQuery(new URL(request.url));

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_QUERY',
          message: 'Invalid plugin directory query',
          details: parsed.error.flatten(),
        },
      },
      { status: 400, headers },
    );
  }

  try {
    const entries = await loadPluginDirectory();
    const body: PluginDirectoryListResponse = queryPluginDirectory(entries, {
      ...parsed.data,
      status: parsed.data.status as PluginRegistryStatus | undefined,
    });
    return NextResponse.json(body, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        ...headers,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Plugin directory list failed');
    return NextResponse.json(
      { error: { code: 'PLUGIN_REGISTRY_UNAVAILABLE', message: 'Plugin registry unavailable' } },
      { status: 503, headers },
    );
  }
}

export function OPTIONS(request: NextRequest): NextResponse {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withRateLimit } from '@/lib/rate-limit';
import { getCorsHeaders, getSecurityHeaders, handleCorsPreflightRequest } from '@/lib/cors';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  PLUGIN_REGISTRY_DEFAULT_LIMIT,
  PLUGIN_REGISTRY_MAX_LIMIT,
  listPluginRegistryEntries,
} from '@/lib/services/plugin-registry-service';
import { countPluginInstallations } from '@/lib/services/plugin-installation-service';
import { getManagedSkillPluginOwners } from '@/lib/services/skill-catalog-service';
import {
  PLUGIN_REGISTRY_STATUSES,
  PLUGIN_SOURCE_KINDS,
  type PluginRegistryListResponse,
} from '@agiworkforce/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  category: z.string().trim().min(1).max(100).optional(),
  status: z.enum(PLUGIN_REGISTRY_STATUSES as unknown as [string, ...string[]]).optional(),
  source: z.enum(PLUGIN_SOURCE_KINDS as unknown as [string, ...string[]]).optional(),
  limit: z.coerce.number().int().min(1).max(PLUGIN_REGISTRY_MAX_LIMIT).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  const preflight = handleCorsPreflightRequest(request);
  if (preflight) return preflight;

  const rateLimited = await withRateLimit(request, 'model-catalog');
  if (rateLimited) return rateLimited;

  const headers = { ...getCorsHeaders(request), ...getSecurityHeaders() };
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    category: url.searchParams.get('category') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    source: url.searchParams.get('source') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    offset: url.searchParams.get('offset') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_QUERY',
          message: 'Invalid plugin registry query',
          details: parsed.error.flatten(),
        },
      },
      { status: 400, headers },
    );
  }

  try {
    const db = getNeonDb();
    const [{ entries, total }, installCounts, skillOwners] = await Promise.all([
      listPluginRegistryEntries(db, {
        category: parsed.data.category,
        status: parsed.data.status as PluginRegistryListResponse['entries'][number]['status'],
        source: parsed.data.source as PluginRegistryListResponse['entries'][number]['source'],
        limit: parsed.data.limit ?? PLUGIN_REGISTRY_DEFAULT_LIMIT,
        offset: parsed.data.offset ?? 0,
      }),
      countPluginInstallations(db),
      getManagedSkillPluginOwners(),
    ]);

    const body: PluginRegistryListResponse = {
      entries: entries.map((entry) => ({
        ...entry,
        installCount: installCounts.get(entry.id) ?? 0,
        skillsRequireInstall: entry.declaredSkills.some(
          (skill) => skillOwners.get(skill) === entry.id,
        ),
      })),
      total,
    };
    return NextResponse.json(body, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        ...headers,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Plugin registry list failed');
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

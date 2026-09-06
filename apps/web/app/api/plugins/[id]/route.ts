import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withRateLimit } from '@/lib/rate-limit';
import { getCorsHeaders, getSecurityHeaders, handleCorsPreflightRequest } from '@/lib/cors';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { getPluginRegistryEntry } from '@/lib/services/plugin-registry-service';
import { getManagedSkillPluginOwners } from '@/lib/services/skill-catalog-service';
import { findDirectoryEntry } from '@/features/plugins/server/directory/catalog';
import type { PluginRegistryEntryResponse } from '@agiworkforce/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9._-]{0,127}$/),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const preflight = handleCorsPreflightRequest(request);
  if (preflight) return preflight;

  const rateLimited = await withRateLimit(request, 'model-catalog');
  if (rateLimited) return rateLimited;

  const headers = { ...getCorsHeaders(request), ...getSecurityHeaders() };
  const parsed = ParamsSchema.safeParse(await context.params);

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Plugin not found' } },
      { status: 404, headers },
    );
  }

  try {
    const found = await getPluginRegistryEntry(getNeonDb(), parsed.data.id);
    if (!found) {
      const directoryEntry = await findDirectoryEntry(parsed.data.id);
      if (!directoryEntry) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Plugin not found' } },
          { status: 404, headers },
        );
      }
      const directoryBody: PluginRegistryEntryResponse = { entry: directoryEntry, manifest: null };
      return NextResponse.json(directoryBody, {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
          ...headers,
        },
      });
    }

    const skillOwners = await getManagedSkillPluginOwners();
    const body: PluginRegistryEntryResponse = {
      entry: {
        ...found.entry,
        skillsRequireInstall: found.entry.declaredSkills.some(
          (skill) => skillOwners.get(skill) === found.entry.id,
        ),
      },
      manifest: found.manifest,
    };
    return NextResponse.json(body, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        ...headers,
      },
    });
  } catch (error) {
    logger.error({ error, pluginId: parsed.data.id }, 'Plugin registry entry fetch failed');
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

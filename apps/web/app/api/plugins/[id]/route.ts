import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withRateLimit } from '@/lib/rate-limit';
import { getCorsHeaders, getSecurityHeaders, handleCorsPreflightRequest } from '@/lib/cors';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { getPluginRegistryEntry } from '@/lib/services/plugin-registry-service';
import type { PluginRegistryEntryResponse } from '@agiworkforce/types';

/**
 * Hosted plugin registry — one entry (CAP-046 slice 2).
 *
 *   GET /api/plugins/{id} -> { entry, manifest }
 *
 * `manifest` is null for `preview` entries: they have no artifact, and
 * synthesizing one would invent the pack's contents. The CLI resolver treats a
 * null manifest as "not installable", which is exactly true today.
 *
 * Public and unauthenticated for the same reason as the list route.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Same alphabet as the DB CHECK and the CLI's `validate_plugin_name`: the id
 * becomes a URL segment and, on install, a directory name.
 */
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

  // A malformed id and an unknown id are the same 404, so the endpoint cannot
  // be probed for id-shape feedback.
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Plugin not found' } },
      { status: 404, headers },
    );
  }

  try {
    const found = await getPluginRegistryEntry(getNeonDb(), parsed.data.id);
    if (!found) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Plugin not found' } },
        { status: 404, headers },
      );
    }

    const body: PluginRegistryEntryResponse = { entry: found.entry, manifest: found.manifest };
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

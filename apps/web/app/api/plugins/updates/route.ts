import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isPluginSemver } from '@agiworkforce/types';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { recordWorkspaceAuditEvent } from '@/lib/workspace-audit';
import { applyPluginUpdate, listPluginUpdateOffers } from '@/lib/services/plugin-lifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ApplySchema = z
  .object({
    pluginId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/),
    toVersion: z.string().refine(isPluginSemver, 'Invalid semantic version'),
    acknowledgedPermissions: z.array(z.string().min(1).max(200)).max(200).optional(),
  })
  .strict();

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const { db, userId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'model-catalog', `user:${userId}`);
  if (limited) return limited;

  return NextResponse.json(
    { updates: await listPluginUpdateOffers(db, userId) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const { db, userId } = await getUserScopedDb(request);
  const csrf = await requireCsrfToken(request, userId);
  if (csrf) return csrf as NextResponse;
  const limited = await withRateLimit(request, 'plugin-installation-write', `user:${userId}`);
  if (limited) return limited;

  const parsed = ApplySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_PLUGIN_UPDATE',
          message: 'Name the plugin and the version to move it to.',
        },
      },
      { status: 400 },
    );
  }

  const applied = await applyPluginUpdate(db, {
    userId,
    pluginId: parsed.data.pluginId,
    toVersion: parsed.data.toVersion,
    ...(parsed.data.acknowledgedPermissions !== undefined
      ? { acknowledgedPermissions: parsed.data.acknowledgedPermissions }
      : {}),
  });

  await recordWorkspaceAuditEvent(db, request, {
    userId,
    eventType: 'plugin_setting_changed',
    detail: {
      resourceType: 'plugin',
      resourceId: applied.pluginId,
      version: applied.toVersion,
      changedKeys: applied.reEnabled ? ['installedVersion', 'enabled'] : ['installedVersion'],
      source: 'registry',
    },
  });

  return NextResponse.json({ update: applied });
}

export const GET = withCorsRoute(withErrorHandler(handleGet));
export const POST = withCorsRoute(withErrorHandler(handlePost));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

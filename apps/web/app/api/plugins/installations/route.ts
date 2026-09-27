import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { recordWorkspaceAuditEvent } from '@/lib/workspace-audit';
import { refusePluginInstall } from '@/features/plugins/server/directory/install-gate';
import {
  installWebPlugin,
  listPluginInstallations,
} from '@/lib/services/plugin-installation-service';
import type { PluginInstallationsResponse } from '@agiworkforce/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const InstallPluginBodySchema = z.object({
  pluginId: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9._-]{0,127}$/),
});

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const { db, userId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'model-catalog', `user:${userId}`);
  if (limited) return limited;

  const body: PluginInstallationsResponse = {
    installations: await listPluginInstallations(db, userId),
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const scope = await getUserScopedDb(request);
  const { db, userId } = scope;
  const csrf = await requireCsrfToken(request, userId);
  if (csrf) return csrf as NextResponse;
  const limited = await withRateLimit(request, 'plugin-installation-write', `user:${userId}`);
  if (limited) return limited;

  const parsed = InstallPluginBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_PLUGIN', message: 'Choose an available plugin.' } },
      { status: 400 },
    );
  }

  const refused = await refusePluginInstall(request, scope, {
    pluginKeys: [parsed.data.pluginId],
  });
  if (refused) return refused;
  const installation = await installWebPlugin(db, userId, parsed.data.pluginId);
  if (!installation) {
    return NextResponse.json(
      {
        error: {
          code: 'PLUGIN_NOT_INSTALLABLE',
          message: 'This plugin is not available for Managed Cloud installation.',
        },
      },
      { status: 409 },
    );
  }
  await recordWorkspaceAuditEvent(db, request, {
    userId,
    eventType: 'plugin_installed',
    detail: {
      resourceType: 'plugin',
      resourceId: installation.pluginId,
      version: installation.installedVersion,
      source: 'registry',
    },
  });
  return NextResponse.json({ installation }, { status: 201 });
}

export const GET = withCorsRoute(withErrorHandler(handleGet));
export const POST = withCorsRoute(withErrorHandler(handlePost));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

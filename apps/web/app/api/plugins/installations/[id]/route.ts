import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { recordWorkspaceAuditEvent } from '@/lib/workspace-audit';
import {
  setWebPluginEnabled,
  uninstallWebPlugin,
} from '@/lib/services/plugin-installation-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9._-]{0,127}$/),
});
const PatchBodySchema = z.object({ enabled: z.boolean() }).strict();

type RouteContext = { params: Promise<{ id: string }> };

async function authenticateMutation(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request);
  const csrf = await requireCsrfToken(request, userId);
  if (csrf) return { db, userId, response: csrf as NextResponse };
  const limited = await withRateLimit(request, 'plugin-installation-write', `user:${userId}`);
  return { db, userId, response: limited };
}

async function handlePatch(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { db, userId, response } = await authenticateMutation(request);
  if (response) return response;
  const params = ParamsSchema.safeParse(await context.params);
  const body = PatchBodySchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_PLUGIN_UPDATE', message: 'The plugin update is invalid.' } },
      { status: 400 },
    );
  }

  const installation = await setWebPluginEnabled(db, userId, params.data.id, body.data.enabled);
  if (!installation) {
    return NextResponse.json(
      { error: { code: 'PLUGIN_NOT_INSTALLED', message: 'Plugin installation not found.' } },
      { status: 404 },
    );
  }
  await recordWorkspaceAuditEvent(db, request, {
    userId: userId,
    eventType: 'plugin_setting_changed',
    detail: {
      resourceType: 'plugin',
      resourceId: installation.pluginId,
      enabled: installation.enabled,
      changedKeys: ['enabled'],
      source: 'registry',
    },
  });
  return NextResponse.json({ installation });
}

async function handleDelete(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { db, userId, response } = await authenticateMutation(request);
  if (response) return response;
  const params = ParamsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json(
      { error: { code: 'PLUGIN_NOT_FOUND', message: 'Plugin installation not found.' } },
      { status: 404 },
    );
  }

  const removed = await uninstallWebPlugin(db, userId, params.data.id);
  if (!removed) {
    return NextResponse.json(
      { error: { code: 'PLUGIN_NOT_INSTALLED', message: 'Plugin installation not found.' } },
      { status: 404 },
    );
  }
  await recordWorkspaceAuditEvent(db, request, {
    userId: userId,
    eventType: 'plugin_removed',
    detail: { resourceType: 'plugin', resourceId: params.data.id, source: 'registry' },
  });
  return new NextResponse(null, { status: 204 });
}

export const PATCH = withCorsRoute(withErrorHandler(handlePatch));
export const DELETE = withCorsRoute(withErrorHandler(handleDelete));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

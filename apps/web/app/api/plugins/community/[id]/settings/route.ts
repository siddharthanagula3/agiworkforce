import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  PluginInstallationSettingsPatchSchema,
  type CommunityPlugin,
  type PluginInstallationSettings,
} from '@agiworkforce/cloud-contracts';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { recordWorkspaceAuditEvent } from '@/lib/workspace-audit';
import {
  listCommunityPlugins,
  updateCommunityInstall,
} from '@/lib/services/plugin-submission-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ id: z.string().uuid() });

type RouteContext = { params: Promise<{ id: string }> };

function notInstalled(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: 'PLUGIN_NOT_INSTALLED',
        message: 'This community plugin is not installed on your account.',
      },
    },
    { status: 404 },
  );
}

function toSettings(plugin: CommunityPlugin): PluginInstallationSettings {
  return {
    pluginId: plugin.id,
    enabledSkills: plugin.enabledSkills ?? plugin.skills,
    examplePrompts: [],
    connectors: [],
    agents: [],
  };
}

async function handleGet(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { db, userId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'model-catalog', `user:${userId}`);
  if (limited) return limited;
  const params = ParamsSchema.safeParse(await context.params);
  if (!params.success) return notInstalled();

  const plugin = (await listCommunityPlugins(db, userId)).find(
    (candidate) => candidate.id === params.data.id,
  );
  if (!plugin?.installed) return notInstalled();
  return NextResponse.json(
    { settings: toSettings(plugin) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

async function handlePatch(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf as NextResponse;
  const { db, userId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'plugin-installation-write', `user:${userId}`);
  if (limited) return limited;
  const params = ParamsSchema.safeParse(await context.params);
  if (!params.success) return notInstalled();

  const patch = await readValidatedJsonBody(
    request,
    PluginInstallationSettingsPatchSchema,
    'Invalid plugin settings',
  );
  if (patch.customExamplePrompts !== undefined) {
    throw createError
      .validation('A community plugin’s example prompts are set by its publisher.')
      .asUserSafe();
  }
  const plugin = await updateCommunityInstall(
    db,
    userId,
    params.data.id,
    patch.enabledSkills === undefined ? {} : { enabledSkills: patch.enabledSkills },
  );
  if (!plugin?.installed) return notInstalled();

  await recordWorkspaceAuditEvent(db, request, {
    userId,
    eventType: 'plugin_setting_changed',
    detail: {
      resourceType: 'plugin',
      resourceId: plugin.id,
      resourceName: plugin.pluginKey,
      source: 'community',
      count: plugin.enabledSkills?.length ?? plugin.skills.length,
    },
  });
  return NextResponse.json({ settings: toSettings(plugin) });
}

export const GET = withCorsRoute(withErrorHandler(handleGet));
export const PATCH = withCorsRoute(withErrorHandler(handlePatch));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

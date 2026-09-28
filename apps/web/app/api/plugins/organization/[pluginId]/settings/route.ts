import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  PluginInstallationSettingsPatchSchema,
  type MemberOrganizationPlugin,
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
  listMemberOrganizationPlugins,
  updateMemberOrganizationPlugin,
} from '@/lib/services/organization-plugin-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ pluginId: z.string().uuid() });

type RouteContext = { params: Promise<{ pluginId: string }> };

function notFound(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: 'PLUGIN_NOT_INSTALLED',
        message: 'This workspace plugin is not installed on your account.',
      },
    },
    { status: 404 },
  );
}

function toSettings(plugin: MemberOrganizationPlugin): PluginInstallationSettings {
  return {
    pluginId: plugin.id,
    enabledSkills: plugin.enabledSkills ?? plugin.skills,
    examplePrompts: [],
    connectors: [],
    agents: [],
  };
}

async function handleGet(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'model-catalog', `user:${userId}`);
  if (limited) return limited;
  const params = ParamsSchema.safeParse(await context.params);
  if (!params.success || !organizationId) return notFound();

  const plugin = (await listMemberOrganizationPlugins(db, userId, organizationId)).find(
    (candidate) => candidate.id === params.data.pluginId,
  );
  if (!plugin?.installed) return notFound();
  return NextResponse.json(
    { settings: toSettings(plugin) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

async function handlePatch(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf as NextResponse;
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'plugin-installation-write', `user:${userId}`);
  if (limited) return limited;
  const params = ParamsSchema.safeParse(await context.params);
  if (!params.success || !organizationId) return notFound();

  const patch = await readValidatedJsonBody(
    request,
    PluginInstallationSettingsPatchSchema,
    'Invalid plugin settings',
  );
  if (patch.customExamplePrompts !== undefined) {
    throw createError
      .validation('A workspace plugin’s example prompts are set by the workspace.')
      .asUserSafe();
  }
  const plugin = await updateMemberOrganizationPlugin(
    db,
    userId,
    organizationId,
    params.data.pluginId,
    patch.enabledSkills === undefined ? {} : { enabledSkills: patch.enabledSkills },
  );
  if (!plugin?.installed) return notFound();

  await recordWorkspaceAuditEvent(db, request, {
    userId,
    eventType: 'plugin_setting_changed',
    detail: {
      resourceType: 'plugin',
      resourceId: plugin.id,
      resourceName: plugin.pluginKey,
      source: 'workspace',
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

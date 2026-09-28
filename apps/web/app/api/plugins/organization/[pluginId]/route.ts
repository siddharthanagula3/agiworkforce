import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { MemberOrganizationPluginPatchSchema } from '@agiworkforce/cloud-contracts';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { recordWorkspaceAuditEvent } from '@/lib/workspace-audit';
import { updateMemberOrganizationPlugin } from '@/lib/services/organization-plugin-service';
import { refusePluginInstall } from '@/features/plugins/server/directory/install-gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ pluginId: z.string().uuid() });

type RouteContext = { params: Promise<{ pluginId: string }> };

function notFound(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: 'PLUGIN_NOT_FOUND',
        message: 'That plugin is not offered to you by your workspace.',
      },
    },
    { status: 404 },
  );
}

async function handlePatch(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf as NextResponse;
  const scope = await getUserScopedDb(request);
  const { db, userId, organizationId } = scope;
  const limited = await withRateLimit(request, 'plugin-installation-write', `user:${userId}`);
  if (limited) return limited;
  const params = ParamsSchema.safeParse(await context.params);
  if (!params.success || !organizationId) return notFound();

  const patch = await readValidatedJsonBody(
    request,
    MemberOrganizationPluginPatchSchema,
    'Invalid plugin change',
  );
  if (patch.installed === true || patch.enabled === true) {
    const refused = await refusePluginInstall(request, scope, { pluginKeys: [] });
    if (refused) return refused;
  }

  const plugin = await updateMemberOrganizationPlugin(
    db,
    userId,
    organizationId,
    params.data.pluginId,
    patch,
  );
  if (!plugin) return notFound();

  await recordWorkspaceAuditEvent(db, request, {
    userId,
    eventType:
      patch.installed === true
        ? 'plugin_installed'
        : patch.installed === false
          ? 'plugin_removed'
          : 'plugin_setting_changed',
    detail: {
      resourceType: 'plugin',
      resourceId: plugin.id,
      resourceName: plugin.pluginKey,
      version: plugin.version,
      source: 'workspace',
      enabled: plugin.enabled,
    },
  });
  return NextResponse.json({ plugin });
}

export const PATCH = withCorsRoute(withErrorHandler(handlePatch));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

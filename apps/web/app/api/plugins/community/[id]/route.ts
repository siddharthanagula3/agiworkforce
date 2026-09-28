import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { CommunityPluginPatchSchema } from '@agiworkforce/cloud-contracts';

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
import { refusePluginInstall } from '@/features/plugins/server/directory/install-gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ id: z.string().uuid() });

type RouteContext = { params: Promise<{ id: string }> };

function notListed(): Error {
  return createError.notFound('That plugin is not in the community directory.').asUserSafe();
}

async function handlePatch(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf as NextResponse;
  const scope = await getUserScopedDb(request);
  const { db, userId } = scope;
  const limited = await withRateLimit(request, 'plugin-installation-write', `user:${userId}`);
  if (limited) return limited;
  const params = ParamsSchema.safeParse(await context.params);
  if (!params.success) throw notListed();

  const patch = await readValidatedJsonBody(
    request,
    CommunityPluginPatchSchema,
    'Invalid plugin change',
  );
  if (patch.installed === true || patch.enabled === true) {
    const listed = (await listCommunityPlugins(db, userId)).find(
      (plugin) => plugin.id === params.data.id,
    );
    if (!listed) throw notListed();
    const refused = await refusePluginInstall(request, scope, { pluginKeys: [listed.pluginKey] });
    if (refused) return refused;
  }

  const plugin = await updateCommunityInstall(db, userId, params.data.id, patch);
  if (!plugin) throw notListed();

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
      source: 'community',
      enabled: plugin.enabled,
    },
  });
  return NextResponse.json({ plugin });
}

export const PATCH = withCorsRoute(withErrorHandler(handlePatch));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { buildWorkspaceFeatureGateResponse } from '@/lib/managed-compute-gate';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb, type UserScopedDb } from '@/lib/server/rls-db';
import { recordWorkspaceAuditEvent } from '@/lib/workspace-audit';
import {
  installMarketplaceEntry,
  listMarketplaceInstallations,
} from '@/lib/services/plugin-marketplace-installation-service';
import {
  getMarketplaceEntryForUser,
  isMissingPluginMarketplaceSchema,
} from '@/lib/services/plugin-marketplace-service';
import { evaluatePluginPolicyForUser } from '@/lib/services/connector-policy-gate';
import { installDirectoryPlugin } from '@/features/plugins/server/directory/install';
import {
  installsDisabledResponse,
  pluginNotPermittedResponse,
} from '@/features/plugins/server/directory/install-responses';
import type { PluginMarketplaceInstallationsResponse } from '@agiworkforce/cloud-contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;

const InstallBodySchema = z.union([
  z.object({ entryId: z.string().uuid() }).strict(),
  z.object({ pluginId: z.string().trim().regex(PLUGIN_ID_PATTERN) }).strict(),
]);

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const { db, userId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'model-catalog', `user:${userId}`);
  if (limited) return limited;

  let installations;
  try {
    installations = await listMarketplaceInstallations(db, userId);
  } catch (error) {
    if (isMissingPluginMarketplaceSchema(error)) return installsDisabledResponse();
    throw error;
  }
  const body: PluginMarketplaceInstallationsResponse = { installations };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}

async function installFromDirectory(
  request: NextRequest,
  scope: UserScopedDb,
  pluginId: string,
): Promise<NextResponse> {
  const { db, userId, organizationId } = scope;
  const policy = await evaluatePluginPolicyForUser({
    db,
    userId,
    organizationId,
    pluginKey: pluginId,
    request,
  });
  if (!policy.allowed) return pluginNotPermittedResponse(policy.reason);
  const result = await installDirectoryPlugin(db, userId, pluginId);
  switch (result.status) {
    case 'installed':
      await recordWorkspaceAuditEvent(db, request, {
        userId,
        eventType: 'plugin_installed',
        detail: {
          resourceType: 'plugin',
          resourceId: result.installation.id,
          resourceName: result.installation.pluginKey,
          version: result.installation.installedVersion,
          count: result.skills.length,
          source: 'directory',
        },
      });
      return NextResponse.json(
        { installation: result.installation, skills: result.skills },
        { status: 201 },
      );
    case 'missing':
      return NextResponse.json(
        { error: { code: 'PLUGIN_NOT_FOUND', message: result.message } },
        { status: 404 },
      );
    case 'builtin':
      return NextResponse.json(
        { error: { code: 'PLUGIN_IS_BUILTIN', message: result.message } },
        { status: 409 },
      );
    case 'blocked':
      return NextResponse.json(
        {
          error: {
            code: 'PLUGIN_NOT_INSTALLABLE',
            message: result.message,
            installCommand: result.installCommand,
          },
        },
        { status: 409 },
      );
    case 'skills-unavailable':
      return NextResponse.json(
        { error: { code: 'PLUGIN_SOURCE_UNAVAILABLE', message: result.message } },
        { status: 502 },
      );
  }
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const scope = await getUserScopedDb(request);
  const { db, userId, organizationId } = scope;
  const csrf = await requireCsrfToken(request, userId);
  if (csrf) return csrf as NextResponse;
  const limited = await withRateLimit(request, 'plugin-installation-write', `user:${userId}`);
  if (limited) return limited;

  const parsed = InstallBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_PLUGIN', message: 'Choose an available marketplace plugin.' } },
      { status: 400 },
    );
  }

  const featureGate = await buildWorkspaceFeatureGateResponse(
    userId,
    request,
    'plugins',
    resolveCloudChatSurface(request),
  );
  if (featureGate) return featureGate;

  try {
    if ('pluginId' in parsed.data) {
      return await installFromDirectory(request, scope, parsed.data.pluginId);
    }

    const entry = await getMarketplaceEntryForUser(db, userId, parsed.data.entryId);
    if (entry) {
      const policy = await evaluatePluginPolicyForUser({
        db,
        userId,
        organizationId,
        pluginKey: entry.pluginKey,
        request,
      });
      if (!policy.allowed) return pluginNotPermittedResponse(policy.reason);
    }
    const installation = await installMarketplaceEntry(db, userId, parsed.data.entryId);
    if (!installation) {
      return NextResponse.json(
        {
          error: {
            code: 'PLUGIN_NOT_INSTALLABLE',
            message: 'This marketplace plugin is not available for installation.',
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
        resourceId: installation.id,
        resourceName: installation.pluginKey,
        version: installation.installedVersion,
        source: 'marketplace',
      },
    });
    return NextResponse.json({ installation }, { status: 201 });
  } catch (error) {
    if (isMissingPluginMarketplaceSchema(error)) return installsDisabledResponse();
    throw error;
  }
}

export const GET = withCorsRoute(withErrorHandler(handleGet));
export const POST = withCorsRoute(withErrorHandler(handlePost));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

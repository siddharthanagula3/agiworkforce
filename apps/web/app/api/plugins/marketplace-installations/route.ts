import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb, type UserScopedDb } from '@/lib/server/rls-db';
import { recordWorkspaceAuditEvent } from '@/lib/workspace-audit';
import { listMarketplaceInstallations } from '@/lib/services/plugin-marketplace-installation-service';
import {
  getMarketplaceEntryForUser,
  isMissingPluginMarketplaceSchema,
} from '@/lib/services/plugin-marketplace-service';
import {
  installDirectoryPlugin,
  installMarketplaceEntryPlugin,
  type DirectoryInstallDependencies,
  type DirectoryInstallResult,
} from '@/features/plugins/server/directory/install';
import {
  pluginDependencyRefusal,
  refusePluginInstall,
} from '@/features/plugins/server/directory/install-gate';
import {
  installRefusalResponse,
  installsDisabledResponse,
} from '@/features/plugins/server/directory/install-responses';
import type {
  PluginInstalledDependency,
  PluginMarketplaceInstallationsResponse,
} from '@agiworkforce/cloud-contracts';

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

type InstallSource = 'directory' | 'marketplace';

async function respondToInstall(
  request: NextRequest,
  scope: UserScopedDb,
  source: InstallSource,
  result: DirectoryInstallResult,
): Promise<NextResponse> {
  const { db, userId } = scope;
  switch (result.status) {
    case 'installed': {
      for (const dependency of result.dependencies) {
        await recordWorkspaceAuditEvent(db, request, {
          userId,
          eventType: 'plugin_installed',
          detail: {
            resourceType: 'plugin',
            resourceId: dependency.installationId,
            resourceName: dependency.pluginId,
            version: dependency.version,
            source,
            reason: `required by ${dependency.requiredBy}`,
          },
        });
      }
      await recordWorkspaceAuditEvent(db, request, {
        userId,
        eventType: 'plugin_installed',
        detail: {
          resourceType: 'plugin',
          resourceId: result.installation.id,
          resourceName: result.installation.pluginKey,
          version: result.installation.installedVersion,
          count: result.skills.length,
          source,
        },
      });
      const dependencies: PluginInstalledDependency[] = result.dependencies.map(
        ({ pluginId, name, version, requiredBy }) => ({ pluginId, name, version, requiredBy }),
      );
      return NextResponse.json(
        { installation: result.installation, skills: result.skills, dependencies },
        { status: 201 },
      );
    }
    default:
      return installRefusalResponse(result);
  }
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const scope = await getUserScopedDb(request);
  const { db, userId } = scope;
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

  try {
    const pluginKey =
      'pluginId' in parsed.data
        ? parsed.data.pluginId
        : (await getMarketplaceEntryForUser(db, userId, parsed.data.entryId))?.pluginKey;
    const refused = await refusePluginInstall(request, scope, {
      pluginKeys: pluginKey ? [pluginKey] : [],
    });
    if (refused) return refused;

    const deps: DirectoryInstallDependencies = {
      admitDependencies: (dependencies) => pluginDependencyRefusal(request, scope, dependencies),
    };
    if ('pluginId' in parsed.data) {
      const result = await installDirectoryPlugin(db, userId, parsed.data.pluginId, deps);
      return await respondToInstall(request, scope, 'directory', result);
    }
    const result = await installMarketplaceEntryPlugin(db, userId, parsed.data.entryId, deps);
    return await respondToInstall(request, scope, 'marketplace', result);
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

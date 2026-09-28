import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { isMissingPluginMarketplaceSchema } from '@/lib/services/plugin-marketplace-service';
import { storeOwnedPluginSource } from '@/lib/services/plugin-owned-source-service';
import { recordWorkspaceAuditEvent } from '@/lib/workspace-audit';
import { registerPluginConnectors } from '@/lib/connectors/plugin-connectors';
import { readArchiveUpload } from '@/features/plugins/server/directory/archive-upload';
import { installedDependencies } from '@/features/plugins/server/directory/dependencies';
import {
  prepareOwnedPluginDependencies,
  writeDependencyPlan,
} from '@/features/plugins/server/directory/install';
import {
  pluginDependencyRefusal,
  refusePluginInstall,
} from '@/features/plugins/server/directory/install-gate';
import {
  installRefusalResponse,
  installsDisabledResponse,
} from '@/features/plugins/server/directory/install-responses';
import type { PluginSourceInstallResponse } from '@agiworkforce/cloud-contracts';
import { recordAuditEvent } from '@/lib/security-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOURCE_KIND_UPLOAD = 'upload';

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf as NextResponse;

  const scope = await getUserScopedDb(request);
  const { db, userId, organizationId } = scope;
  const limited = await withRateLimit(request, 'plugin-installation-write', `user:${userId}`);
  if (limited) return limited;

  const read = await readArchiveUpload(request);
  if (read instanceof NextResponse) return read;
  const { archive } = read;

  const refused = await refusePluginInstall(request, scope, {
    pluginKeys: archive.plugins.map((plugin) => plugin.key),
    authorsSkills: true,
  });
  if (refused) return refused;

  const sourceName = read.name ?? archive.sourceName;
  try {
    const prepared = await prepareOwnedPluginDependencies(
      db,
      userId,
      { marketplace: sourceName, allowlist: archive.allowlist, plugins: archive.plugins },
      {
        admitDependencies: (dependencies) => pluginDependencyRefusal(request, scope, dependencies),
      },
    );
    if ('refused' in prepared) return installRefusalResponse(prepared.refused);
    let dependencyInstallations = new Map<string, string>();
    const plugins = await storeOwnedPluginSource(db, userId, {
      kind: SOURCE_KIND_UPLOAD,
      sourceName,
      plugins: archive.plugins,
      acknowledgedScans: read.acknowledgedScans,
      allowlist: archive.allowlist,
      installAlongside: async (tx) => {
        dependencyInstallations = await writeDependencyPlan(tx, userId, prepared.plan);
      },
    });
    const dependencies = installedDependencies(prepared.plan, dependencyInstallations);
    for (const dependency of dependencies) {
      await recordWorkspaceAuditEvent(db, request, {
        userId,
        eventType: 'plugin_installed',
        detail: {
          resourceType: 'plugin',
          resourceId: dependency.installationId,
          resourceName: dependency.pluginId,
          version: dependency.version,
          source: SOURCE_KIND_UPLOAD,
          reason: `required by ${dependency.requiredBy}`,
        },
      });
    }
    const connectors = await registerPluginConnectors(
      request,
      archive.plugins.map((plugin) => ({
        pluginKey: plugin.key,
        pluginName: plugin.name,
        servers: plugin.mcpServers,
      })),
    );
    const omittedFiles = archive.plugins.flatMap((plugin) => plugin.omittedFiles);
    const body: PluginSourceInstallResponse = {
      sourceName,
      kind: SOURCE_KIND_UPLOAD,
      plugins,
      ...(omittedFiles.length > 0 ? { omittedFiles } : {}),
      ...(connectors.added.length > 0 || connectors.failed.length > 0 ? { connectors } : {}),
      ...(dependencies.length > 0
        ? {
            dependencies: dependencies.map(({ pluginId, name, version, requiredBy }) => ({
              pluginId,
              name,
              version,
              requiredBy,
            })),
          }
        : {}),
    };
    await recordAuditEvent({
      userId,
      organizationId,
      eventType: 'plugin_marketplace_changed',
      request,
      detail: { resourceName: body.sourceName, status: 'uploaded', count: plugins.length },
    });
    return NextResponse.json(body, { status: 201 });
  } catch (error) {
    if (isMissingPluginMarketplaceSchema(error)) return installsDisabledResponse();
    throw error;
  }
}

export const POST = withCorsRoute(withErrorHandler(handlePost));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

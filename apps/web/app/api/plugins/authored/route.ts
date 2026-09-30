import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { readJsonBody } from '@/lib/read-json-body';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { isMissingPluginMarketplaceSchema } from '@/lib/services/plugin-marketplace-service';
import {
  findOwnedPluginEntryByKey,
  storeOwnedPluginSource,
} from '@/lib/services/plugin-owned-source-service';
import { pluginKeyFrom } from '@/features/plugins/server/directory/archive';
import {
  AUTHORED_PLUGIN_INVALID_CODE,
  AUTHORED_PLUGIN_INVALID_MESSAGE,
  AuthoredPluginBodySchema,
  authoredSkillFiles,
  authoredSkillIssues,
} from '@/features/plugins/server/directory/authored-plugin';
import {
  pluginDependencyRefusal,
  refusePluginInstall,
} from '@/features/plugins/server/directory/install-gate';
import {
  installRefusalResponse,
  installsDisabledResponse,
} from '@/features/plugins/server/directory/install-responses';
import {
  PLUGIN_DIRECTORY_FALLBACK_VERSION,
  uploadUnreadableDependenciesMessage,
  uploadUnusableNameMessage,
} from '@/features/plugins/server/directory/constants';
import {
  PluginMarketplaceManifestPluginSchema,
  type PluginSourceInstallResponse,
} from '@agiworkforce/cloud-contracts';
import { recordAuditEvent } from '@/lib/security-audit';
import { recordWorkspaceAuditEvent } from '@/lib/workspace-audit';
import { parsePluginDependencies } from '@/lib/services/plugin-dependencies';
import { installedDependencies } from '@/features/plugins/server/directory/dependencies';
import {
  prepareOwnedPluginDependencies,
  writeDependencyPlan,
} from '@/features/plugins/server/directory/install';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOURCE_KIND_AUTHORED = 'authored';
const DUPLICATE_PLUGIN_CODE = 'PLUGIN_NAME_TAKEN';

function rejected(message: string, issues?: readonly string[]): NextResponse {
  return NextResponse.json(
    { error: { code: AUTHORED_PLUGIN_INVALID_CODE, message, ...(issues ? { issues } : {}) } },
    { status: 422 },
  );
}

function duplicateName(name: string): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: DUPLICATE_PLUGIN_CODE,
        message: `You already have a plugin named "${name}". Open it to edit it, or choose another name.`,
      },
    },
    { status: 409 },
  );
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf as NextResponse;

  const scope = await getUserScopedDb(request);
  const { db, userId, organizationId } = scope;
  const limited = await withRateLimit(request, 'plugin-installation-write', `user:${userId}`);
  if (limited) return limited;

  const parsed = AuthoredPluginBodySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: AUTHORED_PLUGIN_INVALID_CODE, message: AUTHORED_PLUGIN_INVALID_MESSAGE } },
      { status: 400 },
    );
  }

  const key = pluginKeyFrom(parsed.data.name);
  if (!key) return rejected(uploadUnusableNameMessage(parsed.data.name));

  const refused = await refusePluginInstall(request, scope, {
    pluginKeys: [key],
    authorsSkills: true,
  });
  if (refused) return refused;

  const issues = authoredSkillIssues(parsed.data.skills);
  if (issues.length > 0) return rejected(issues[0] ?? AUTHORED_PLUGIN_INVALID_MESSAGE, issues);
  const files = authoredSkillFiles(parsed.data.skills);

  let declared;
  try {
    declared = PluginMarketplaceManifestPluginSchema.parse({
      id: key,
      name: parsed.data.name,
      description: parsed.data.description,
      version: PLUGIN_DIRECTORY_FALLBACK_VERSION,
      skills: files.map((file) => file.name),
      connectors: [],
      agents: [],
      examplePrompts: [],
      permissions: [],
      dependencies: parsed.data.dependencies ?? [],
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return rejected(
        AUTHORED_PLUGIN_INVALID_MESSAGE,
        error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      );
    }
    throw error;
  }

  const dependencyRefs = parsePluginDependencies(declared.dependencies);
  if (!dependencyRefs) return rejected(uploadUnreadableDependenciesMessage(declared.name));
  const allowlist = [
    ...new Set(
      dependencyRefs.flatMap((reference) =>
        reference.marketplace === null ? [] : [reference.marketplace],
      ),
    ),
  ];

  try {
    if (await findOwnedPluginEntryByKey(db, userId, SOURCE_KIND_AUTHORED, declared.id)) {
      return duplicateName(declared.name);
    }
    const prepared = await prepareOwnedPluginDependencies(
      db,
      userId,
      {
        marketplace: declared.name,
        allowlist,
        plugins: [{ key: declared.id, dependencies: dependencyRefs }],
      },
      {
        admitDependencies: (dependencies) => pluginDependencyRefusal(request, scope, dependencies),
      },
    );
    if ('refused' in prepared) return installRefusalResponse(prepared.refused);
    let dependencyInstallations = new Map<string, string>();
    const plugins = await storeOwnedPluginSource(db, userId, {
      kind: SOURCE_KIND_AUTHORED,
      sourceName: declared.name,
      plugins: [
        {
          key: declared.id,
          name: declared.name,
          description: declared.description,
          version: declared.version,
          skills: files,
          dependencies: dependencyRefs,
        },
      ],
      allowlist,
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
          source: SOURCE_KIND_AUTHORED,
          reason: `required by ${dependency.requiredBy}`,
        },
      });
    }
    const body: PluginSourceInstallResponse = {
      sourceName: declared.name,
      kind: SOURCE_KIND_AUTHORED,
      plugins,
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
      detail: { resourceId: declared.id, status: 'authored', count: plugins.length },
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

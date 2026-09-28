import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { refuseUnsafeUpload } from '@/lib/security/upload-scan';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { isMissingPluginMarketplaceSchema } from '@/lib/services/plugin-marketplace-service';
import { storeOwnedPluginSource } from '@/lib/services/plugin-owned-source-service';
import { recordWorkspaceAuditEvent } from '@/lib/workspace-audit';
import {
  PluginArchiveError,
  readPluginArchive,
  type UploadedPluginArchive,
} from '@/features/plugins/server/directory/archive';
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
import {
  PLUGIN_UPLOAD_FILE_FIELD,
  PLUGIN_UPLOAD_NAME_FIELD,
  UPLOAD_NOT_AN_ARCHIVE_MESSAGE,
} from '@/features/plugins/server/directory/constants';
import { PayloadCeilingExceededError } from '@/lib/payload-ceiling';
import {
  isPluginMarketplaceContentHash,
  PLUGIN_UPLOAD_ACKNOWLEDGED_SCAN_FIELD,
  type PluginSourceInstallResponse,
} from '@agiworkforce/cloud-contracts';
import { recordAuditEvent } from '@/lib/security-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOURCE_KIND_UPLOAD = 'upload';
const ARCHIVE_EXTENSION = /\.zip$/i;
const INVALID_UPLOAD_CODE = 'PLUGIN_UPLOAD_INVALID';
const REJECTED_UPLOAD_CODE = 'PLUGIN_UPLOAD_REJECTED';

function fallbackName(fileName: string | null, provided: string | null): string {
  const chosen = provided?.trim();
  if (chosen && chosen.length > 0) return chosen;
  const base = (fileName ?? '').replace(ARCHIVE_EXTENSION, '').trim();
  return base.length > 0 ? base : SOURCE_KIND_UPLOAD;
}

const PLUGIN_ARCHIVE_MIME = 'application/zip';

function invalidUpload(message: string, issues?: readonly string[]): NextResponse {
  return NextResponse.json(
    { error: { code: INVALID_UPLOAD_CODE, message, ...(issues ? { issues } : {}) } },
    { status: 400 },
  );
}

interface ArchiveUpload {
  bytes: Uint8Array;
  fileName: string | null;
  name: string | null;
  acknowledgedScans: string[];
}

async function readArchiveField(request: NextRequest): Promise<ArchiveUpload | NextResponse> {
  let form: FormData;
  try {
    form = (await request.formData()) as unknown as FormData;
  } catch (error) {
    if (error instanceof PayloadCeilingExceededError) throw error;
    return invalidUpload(UPLOAD_NOT_AN_ARCHIVE_MESSAGE);
  }
  const file = form.get(PLUGIN_UPLOAD_FILE_FIELD);
  if (!file || typeof file === 'string') return invalidUpload(UPLOAD_NOT_AN_ARCHIVE_MESSAGE);
  const buffer = await file.arrayBuffer();
  const fileName = 'name' in file && typeof file.name === 'string' ? file.name : '';
  await refuseUnsafeUpload(new Uint8Array(buffer), PLUGIN_ARCHIVE_MIME, {
    leadsObject: true,
    filename: fileName || undefined,
  });
  const provided = form.get(PLUGIN_UPLOAD_NAME_FIELD);
  return {
    bytes: new Uint8Array(buffer),
    fileName: fileName.length > 0 ? fileName : null,
    name: typeof provided === 'string' ? provided : null,
    acknowledgedScans: form
      .getAll(PLUGIN_UPLOAD_ACKNOWLEDGED_SCAN_FIELD)
      .filter((value): value is string => isPluginMarketplaceContentHash(value)),
  };
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf as NextResponse;

  const scope = await getUserScopedDb(request);
  const { db, userId, organizationId } = scope;
  const limited = await withRateLimit(request, 'plugin-installation-write', `user:${userId}`);
  if (limited) return limited;

  const read = await readArchiveField(request);
  if (read instanceof NextResponse) return read;

  let archive: UploadedPluginArchive;
  try {
    archive = await readPluginArchive(read.bytes, fallbackName(read.fileName, read.name));
  } catch (error) {
    if (error instanceof PluginArchiveError) {
      return NextResponse.json(
        {
          error: { code: REJECTED_UPLOAD_CODE, message: error.message, issues: error.issues },
        },
        { status: 422 },
      );
    }
    throw error;
  }

  const refused = await refusePluginInstall(request, scope, {
    pluginKeys: archive.plugins.map((plugin) => plugin.key),
    authorsSkills: true,
  });
  if (refused) return refused;

  const sourceName = read.name?.trim() || archive.sourceName;
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
    const omittedFiles = archive.plugins.flatMap((plugin) => plugin.omittedFiles);
    const body: PluginSourceInstallResponse = {
      sourceName,
      kind: SOURCE_KIND_UPLOAD,
      plugins,
      ...(omittedFiles.length > 0 ? { omittedFiles } : {}),
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

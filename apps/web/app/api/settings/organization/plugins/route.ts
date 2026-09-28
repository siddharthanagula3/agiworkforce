import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  OrganizationPluginPatchSchema,
  type OrganizationPluginsAdminResponse,
  type OrganizationPluginsPublishResponse,
} from '@agiworkforce/cloud-contracts';

import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  listOrganizationPluginGroups,
  listOrganizationPlugins,
  publishOrganizationPlugins,
  updateOrganizationPlugin,
} from '@/lib/services/organization-plugin-service';
import {
  readArchiveUpload,
  rejectedUploadResponse,
} from '@/features/plugins/server/directory/archive-upload';
import {
  requireWorkspaceConsolePermission,
  resolveWorkspaceConsoleAccess,
} from '../workspace-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MANAGE_PERMISSION = 'policy.manage';
const PLUGIN_RESOURCE_TYPE = 'organization_plugin';
const DEPENDENCIES_REFUSED_MESSAGE =
  'A workspace plugin cannot declare dependencies. Publish the plugins it depends on to the workspace as well, and choose how members get each one.';

async function respondWithPlugins(
  organizationId: string,
  canManage: boolean,
): Promise<NextResponse> {
  const db = getNeonDb();
  const [plugins, groups] = await Promise.all([
    listOrganizationPlugins(db, organizationId),
    listOrganizationPluginGroups(db, organizationId),
  ]);
  const body: OrganizationPluginsAdminResponse = { organizationId, canManage, plugins, groups };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const limited = await withRateLimit(request, 'settings-org');
  if (limited) return limited;

  const { organizationId, access } = await resolveWorkspaceConsoleAccess(request);
  return respondWithPlugins(organizationId, access.permissions.has(MANAGE_PERMISSION));
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf as NextResponse;

  const limited = await withRateLimit(request, 'settings-org-patch');
  if (limited) return limited;

  const { userId, organizationId } = await requireWorkspaceConsolePermission(
    request,
    MANAGE_PERMISSION,
    'Your workspace role does not allow publishing plugins to this workspace.',
  );

  const read = await readArchiveUpload(request, { acceptSingleSkill: true });
  if (read instanceof NextResponse) return read;
  const { archive } = read;
  if (archive.plugins.some((plugin) => plugin.dependencies.length > 0)) {
    return rejectedUploadResponse(DEPENDENCIES_REFUSED_MESSAGE);
  }

  const plugins = await publishOrganizationPlugins(getNeonDb(), {
    organizationId,
    actorUserId: userId,
    plugins: archive.plugins,
    acknowledgedScans: read.acknowledgedScans,
    initialPreference: read.singleSkill ? 'installed_by_default' : 'available',
  });
  for (const plugin of plugins) {
    await recordAuditEvent({
      userId,
      eventType: 'admin_policy_changed',
      organizationId,
      request,
      severity: 'warning',
      detail: {
        resourceType: PLUGIN_RESOURCE_TYPE,
        resourceId: plugin.id,
        resourceName: plugin.pluginKey,
        version: plugin.version,
        status: 'published',
        count: plugin.skills.length,
      },
    });
  }
  const omittedFiles = archive.plugins.flatMap((plugin) => plugin.omittedFiles);
  const body: OrganizationPluginsPublishResponse = {
    plugins,
    ...(omittedFiles.length > 0 ? { omittedFiles } : {}),
  };
  return NextResponse.json(body, { status: 201 });
}

async function handlePatch(request: NextRequest): Promise<NextResponse> {
  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf as NextResponse;

  const limited = await withRateLimit(request, 'settings-org-patch');
  if (limited) return limited;

  const { userId, organizationId, access } = await requireWorkspaceConsolePermission(
    request,
    MANAGE_PERMISSION,
    'Your workspace role does not allow changing this workspace’s plugins.',
  );

  const body = await readValidatedJsonBody(
    request,
    OrganizationPluginPatchSchema,
    'Invalid workspace plugin change',
  );
  const plugin = await updateOrganizationPlugin(getNeonDb(), organizationId, body, userId);
  if (!plugin) throw createError.notFound('That plugin is not published by this workspace.');

  await recordAuditEvent({
    userId,
    eventType: 'admin_policy_changed',
    organizationId,
    request,
    severity: 'warning',
    detail: {
      resourceType: PLUGIN_RESOURCE_TYPE,
      resourceId: plugin.id,
      resourceName: plugin.pluginKey,
      status: plugin.status === 'retired' ? 'retired' : plugin.installPreference,
      ...(body.groupSettings ? { count: body.groupSettings.length } : {}),
    },
  });

  return respondWithPlugins(organizationId, access.permissions.has(MANAGE_PERMISSION));
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);
export const PATCH = withErrorHandler(handlePatch);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

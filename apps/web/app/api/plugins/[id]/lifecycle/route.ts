import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isPluginSemver } from '@agiworkforce/types';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  deprecatePluginVersion,
  listPluginLifecycleEvents,
  listPluginVersions,
  publishPluginVersion,
  rollbackPlugin,
  submitPluginVersionForReview,
  suspendPluginVersion,
} from '@/lib/services/plugin-lifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PluginIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/);
const VersionSchema = z.string().refine(isPluginSemver, 'Invalid semantic version');
const ReasonSchema = z.string().trim().min(1).max(2000);

const ActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('submit'),
    version: VersionSchema,
  }),
  z.object({
    action: z.literal('publish'),
    version: VersionSchema,
    manifestUrl: z.string().url().max(2048).nullable().optional(),
    sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable()
      .optional(),
    declaredSkills: z.array(z.string().min(1).max(200)).max(200).optional(),
    permissions: z.array(z.string().min(1).max(200)).max(200).optional(),
    changelog: z.string().max(8000).optional(),
  }),
  z.object({
    action: z.literal('deprecate'),
    version: VersionSchema,
    reason: ReasonSchema,
  }),
  z.object({
    action: z.literal('suspend'),
    version: VersionSchema,
    reason: ReasonSchema,
  }),
  z.object({ action: z.literal('rollback') }),
]);

// A catalogue action reaches every account that installed the pack, so it lands
// in the platform audit trail as well as the registry's own history.
async function auditLifecycleAction(
  request: NextRequest,
  input: {
    userId: string;
    pluginId: string;
    action: string;
    version: string;
    reason?: string;
    count?: number;
  },
): Promise<void> {
  await recordAuditEvent({
    userId: input.userId,
    eventType: 'admin_policy_changed',
    severity: input.action === 'suspend' ? 'warning' : 'info',
    request,
    detail: {
      resourceType: 'plugin',
      resourceId: input.pluginId,
      version: input.version,
      status: input.action,
      changedKeys: ['status'],
      source: 'registry',
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.count !== undefined ? { count: input.count } : {}),
    },
  });
}

function badRequest(message: string): NextResponse {
  return NextResponse.json(
    { error: { code: 'INVALID_LIFECYCLE_ACTION', message } },
    { status: 400 },
  );
}

async function handleGet(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requirePlatformAdmin(request);
  const limited = await withRateLimit(request, 'model-catalog', `user:${auth.userId}`);
  if (limited) return limited;

  const parsedId = PluginIdSchema.safeParse((await context.params).id);
  if (!parsedId.success) return badRequest('Name an existing plugin.');

  const db = getNeonDb();
  const [versions, events] = await Promise.all([
    listPluginVersions(db, parsedId.data),
    listPluginLifecycleEvents(db, parsedId.data),
  ]);
  return NextResponse.json(
    { pluginId: parsedId.data, versions, events },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

async function handlePost(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requirePlatformAdmin(request);
  const csrf = await requireCsrfToken(request, auth.userId);
  if (csrf) return csrf as NextResponse;
  const limited = await withRateLimit(request, 'plugin-installation-write', `user:${auth.userId}`);
  if (limited) return limited;

  const parsedId = PluginIdSchema.safeParse((await context.params).id);
  if (!parsedId.success) return badRequest('Name an existing plugin.');
  const parsed = ActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return badRequest('Choose publish, submit, deprecate, suspend or rollback.');
  }

  const db = getNeonDb();
  const pluginId = parsedId.data;
  const actorUserId = auth.userId;

  switch (parsed.data.action) {
    case 'submit': {
      const version = await submitPluginVersionForReview(db, {
        pluginId,
        version: parsed.data.version,
        actorUserId,
      });
      await auditLifecycleAction(request, {
        userId: actorUserId,
        pluginId,
        action: 'submit',
        version: version.version,
      });
      return NextResponse.json({ version });
    }
    case 'publish': {
      const version = await publishPluginVersion(db, {
        pluginId,
        version: parsed.data.version,
        actorUserId,
        ...(parsed.data.manifestUrl !== undefined ? { manifestUrl: parsed.data.manifestUrl } : {}),
        ...(parsed.data.sha256 !== undefined ? { sha256: parsed.data.sha256 } : {}),
        ...(parsed.data.declaredSkills !== undefined
          ? { declaredSkills: parsed.data.declaredSkills }
          : {}),
        ...(parsed.data.permissions !== undefined ? { permissions: parsed.data.permissions } : {}),
        ...(parsed.data.changelog !== undefined ? { changelog: parsed.data.changelog } : {}),
      });
      await auditLifecycleAction(request, {
        userId: actorUserId,
        pluginId,
        action: 'publish',
        version: version.version,
      });
      return NextResponse.json({ version });
    }
    case 'deprecate': {
      const version = await deprecatePluginVersion(db, {
        pluginId,
        version: parsed.data.version,
        reason: parsed.data.reason,
        actorUserId,
      });
      await auditLifecycleAction(request, {
        userId: actorUserId,
        pluginId,
        action: 'deprecate',
        version: version.version,
        reason: parsed.data.reason,
      });
      return NextResponse.json({ version });
    }
    case 'suspend': {
      const result = await suspendPluginVersion(db, {
        pluginId,
        version: parsed.data.version,
        reason: parsed.data.reason,
        actorUserId,
      });
      await auditLifecycleAction(request, {
        userId: actorUserId,
        pluginId,
        action: 'suspend',
        version: result.version.version,
        reason: parsed.data.reason,
        count: result.installationsStopped,
      });
      return NextResponse.json(result);
    }
    case 'rollback': {
      const result = await rollbackPlugin(db, { pluginId, actorUserId });
      await auditLifecycleAction(request, {
        userId: actorUserId,
        pluginId,
        action: 'rollback',
        version: result.restored.version,
        reason: `Rolled back from ${result.from ?? 'no pinned version'}.`,
        count: result.installationsMoved,
      });
      return NextResponse.json(result);
    }
  }
}

export const GET = withCorsRoute(withErrorHandler(handleGet));
export const POST = withCorsRoute(withErrorHandler(handlePost));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

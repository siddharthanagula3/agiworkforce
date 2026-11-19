import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  PROJECT_MEMORY_EDIT_MAX_MESSAGE_CHARS,
  ProjectMemoryEditRequestSchema,
  type ProjectMemoryEditHandshake,
  type ProjectMemoryEditResponse,
} from '@agiworkforce/cloud-contracts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { readSurfaceHint } from '@/lib/free-chat-surface-policy';
import { loadManagedMemoryPolicy } from '@/lib/services/managed-memory-context-service';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import {
  buildManagedComputeAccessGateResponse,
  evaluateManagedComputeWorkspaceAccess,
} from '@/lib/services/managed-compute-access';
import { ManagedUsageRequestError } from '@/lib/services/managed-usage-request-service';
import {
  ProjectMemoryEditUnavailableError,
  resolveProjectMemoryEditRoute,
  runProjectMemoryEdit,
} from '@/lib/services/project-memory-edit-service';
import { memoryToolSource } from '@/lib/server/tools/memory-tools';

export const runtime = 'nodejs';
export const maxDuration = 150;

type RouteContext = { params: Promise<{ id: string }> };

const PROJECT_NOT_FOUND = 'Project not found';
const MEMORY_OFF_MESSAGE = 'Memory is turned off in your settings.';
const EDIT_FAILED_MESSAGE = 'AGI could not change memory right now. Nothing was changed.';
const EDIT_UNAVAILABLE_MESSAGE = 'Changing memory by message is not available.';

const ProjectIdSchema = z.string().uuid();

async function requireOwnedProject(
  db: DatabaseAdapter,
  projectId: string,
  userId: string,
  organizationId: string | null,
): Promise<void> {
  if (!ProjectIdSchema.safeParse(projectId).success) throw createError.notFound(PROJECT_NOT_FOUND);
  const [project] = await db.query<{ id: string }>(
    `select id from user_projects
      where id = $1::uuid
        and user_id = $2
        and organization_id is not distinct from $3::uuid
        and deleted_at is null
      limit 1`,
    [projectId, userId, organizationId],
  );
  if (!project) throw createError.notFound(PROJECT_NOT_FOUND);
}

async function handleGetEdit(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation-read');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId: scopedOrganizationId } = await getUserScopedDb(request);
  const organizationId = scopedOrganizationId ?? null;
  const { id } = await context.params;
  await requireOwnedProject(db, id, userId, organizationId);

  const access = await evaluateManagedComputeWorkspaceAccess(db, userId, 'web', {
    organizationId,
  });
  const gateResponse = buildManagedComputeAccessGateResponse(access);
  if (gateResponse) return gateResponse;
  if (!(await resolveProjectMemoryEditRoute(db, userId))) {
    throw createError.notFound(EDIT_UNAVAILABLE_MESSAGE);
  }
  const handshake: ProjectMemoryEditHandshake = {
    maxMessageChars: PROJECT_MEMORY_EDIT_MAX_MESSAGE_CHARS,
  };
  return NextResponse.json(handshake);
}

async function handlePostEdit(request: NextRequest, context: RouteContext) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const { db, userId, organizationId: scopedOrganizationId } = await getUserScopedDb(request);
  const organizationId = scopedOrganizationId ?? null;
  const rateLimitResponse = await withRateLimit(request, 'llm-completion', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const parsed = ProjectMemoryEditRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.validation(
      `Send a message of 1 to ${PROJECT_MEMORY_EDIT_MAX_MESSAGE_CHARS.toLocaleString('en-US')} characters.`,
      { field: 'message' },
    );
  }

  const { id: projectId } = await context.params;
  await requireOwnedProject(db, projectId, userId, organizationId);

  const policy = await loadManagedMemoryPolicy(db, { userId, organizationId });
  if (!policy.enabled) throw createError.conflict(MEMORY_OFF_MESSAGE).asUserSafe();

  const access = await evaluateManagedComputeWorkspaceAccess(db, userId, 'web', {
    organizationId,
  });
  const gateResponse = buildManagedComputeAccessGateResponse(access);
  if (gateResponse) return gateResponse;
  const planTier = await resolveEntitledPlanTier(db, userId, {
    workspaceOrganizationId: organizationId,
  });

  try {
    const result: ProjectMemoryEditResponse = await runProjectMemoryEdit({
      db,
      userId,
      organizationId,
      planTier,
      projectId,
      message: parsed.data.message,
      source: memoryToolSource(readSurfaceHint(request)),
      signal: request.signal,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ManagedUsageRequestError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    if (error instanceof ProjectMemoryEditUnavailableError) {
      throw createError.serviceUnavailable(EDIT_FAILED_MESSAGE).asUserSafe();
    }
    logger.warn({ error, userId }, '[project-memory-edit] edit failed');
    throw createError.serviceUnavailable(EDIT_FAILED_MESSAGE).asUserSafe();
  }
}

export const GET = withCorsRoute(withErrorHandler(handleGetEdit));
export const POST = withCorsRoute(withErrorHandler(handlePostEdit));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

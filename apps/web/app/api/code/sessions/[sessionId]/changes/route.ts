import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { CloudCodeChangesReply, CloudCodeDiscardReply } from '@agiworkforce/cloud-contracts';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { e2bProvisioningReady } from '@/lib/e2b/gate';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  CloudCodeConflictError,
  CloudCodeNotFoundError,
  CloudCodeUnavailableError,
  CloudCodeValidationError,
  discardCloudCodeSessionChanges,
  isCloudCodeSchemaUnavailable,
  readCloudCodeSessionChanges,
} from '@/lib/services/cloud-code-session-service';
import { resolveEntitlementBundle } from '@/lib/services/entitlement-resolution';
import { isManagedComputePrivateBetaEnabled } from '@/lib/managed-compute-gate';
import {
  buildManagedComputeAccessGateResponse,
  evaluateManagedComputeAccess,
} from '@/lib/services/managed-compute-access';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ sessionId: string }> };

function rethrowCloudCodeError(error: unknown): never {
  if (error instanceof CloudCodeValidationError) throw createError.validation(error.message);
  if (error instanceof CloudCodeNotFoundError) throw createError.notFound(error.message);
  if (error instanceof CloudCodeConflictError) throw createError.conflict(error.message);
  if (error instanceof CloudCodeUnavailableError) {
    throw createError.serviceUnavailable(error.message);
  }
  if (isCloudCodeSchemaUnavailable(error)) {
    throw createError.capabilityUnavailable(
      'Managed Code is coming soon. Cloud sessions are not available yet.',
    );
  }
  throw error;
}

async function handleChanges(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;
  if (!e2bProvisioningReady()) {
    throw createError.capabilityUnavailable(
      'Managed Code is not enabled for this deployment, so there are no changes to show.',
    );
  }
  if (!isManagedComputePrivateBetaEnabled()) {
    throw createError.serviceUnavailable(
      'Managed compute is temporarily unavailable. Use Local or BYOK in the meantime, or try again shortly.',
    );
  }

  const { sessionId } = await context.params;
  const entitlement = await resolveEntitlementBundle(db, userId);

  // Reading a session's changes claims the session and provisions the sandbox,
  // so it buys managed compute and answers to the same gate the write paths do.
  const accessGateResponse = buildManagedComputeAccessGateResponse(
    await evaluateManagedComputeAccess(
      db,
      userId,
      entitlement.subscription,
      resolveCloudChatSurface(request),
      {
        request,
      },
    ),
  );
  if (accessGateResponse) return accessGateResponse;

  const planTier = entitlement.plan;
  try {
    const changes: CloudCodeChangesReply = await readCloudCodeSessionChanges(
      db,
      { userId, organizationId },
      sessionId,
      planTier,
    );
    return NextResponse.json(changes);
  } catch (error) {
    rethrowCloudCodeError(error);
  }
}

async function requestObject(request: NextRequest): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw createError.validation('Invalid JSON request body');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw createError.validation('Request body must be an object');
  }
  return value as Record<string, unknown>;
}

async function handleDiscard(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  if (!e2bProvisioningReady()) {
    throw createError.capabilityUnavailable(
      'Managed Code is not enabled for this deployment, so there are no changes to discard.',
    );
  }
  if (!isManagedComputePrivateBetaEnabled()) {
    throw createError.serviceUnavailable(
      'Managed compute is temporarily unavailable. Use Local or BYOK in the meantime, or try again shortly.',
    );
  }

  const body = await requestObject(request);
  const { sessionId } = await context.params;
  const entitlement = await resolveEntitlementBundle(db, userId);
  const accessGateResponse = buildManagedComputeAccessGateResponse(
    await evaluateManagedComputeAccess(
      db,
      userId,
      entitlement.subscription,
      resolveCloudChatSurface(request),
      { request },
    ),
  );
  if (accessGateResponse) return accessGateResponse;

  try {
    const discarded: CloudCodeDiscardReply = await discardCloudCodeSessionChanges(
      db,
      { userId, organizationId },
      sessionId,
      entitlement.plan,
      body['discard'],
    );
    return NextResponse.json(discarded);
  } catch (error) {
    rethrowCloudCodeError(error);
  }
}

export const GET = withErrorHandler(handleChanges);
export const POST = withErrorHandler(handleDiscard);

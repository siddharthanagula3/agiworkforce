import 'server-only';

import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
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
  getCloudCodeSession,
  isCloudCodeSchemaUnavailable,
  runCloudCodeNotebookCell,
} from '@/lib/services/cloud-code-session-service';
import { resolveEntitlementBundle } from '@/lib/services/entitlement-resolution';
import { isManagedComputePrivateBetaEnabled } from '@/lib/managed-compute-gate';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import {
  buildManagedComputeAccessGateResponse,
  evaluateManagedComputeAccess,
} from '@/lib/services/managed-compute-access';
import { recordNotebookRun, requireNotebookNetworkPolicy } from '../lib/notebook-runs';

export const runtime = 'nodejs';
export const maxDuration = 600;

type RouteContext = { params: Promise<{ sessionId: string }> };

function rethrowCloudCodeError(error: unknown): never {
  if (error instanceof CloudCodeValidationError) throw createError.validation(error.message);
  if (error instanceof CloudCodeNotFoundError) throw createError.notFound(error.message);
  if (error instanceof CloudCodeConflictError) throw createError.conflict(error.message);
  if (error instanceof CloudCodeUnavailableError) {
    throw createError.serviceUnavailable(error.message);
  }
  if (isCloudCodeSchemaUnavailable(error)) {
    throw createError.serviceUnavailable(
      'Managed Code is coming soon. Cloud sessions are not available yet.',
    );
  }
  throw error;
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

async function handleExecute(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  if (!e2bProvisioningReady()) {
    throw createError.serviceUnavailable('Managed Code is not enabled for this deployment');
  }
  if (!isManagedComputePrivateBetaEnabled()) {
    throw createError.serviceUnavailable(
      'Managed compute is temporarily unavailable. Use Local or BYOK in the meantime, or try again shortly.',
    );
  }

  const body = await requestObject(request);
  const { sessionId } = await context.params;
  const entitlement = await resolveEntitlementBundle(db, userId);
  const accessDecision = await evaluateManagedComputeAccess(
    db,
    userId,
    entitlement.subscription,
    resolveCloudChatSurface(request),
    { request },
    'code',
  );
  const accessGateResponse = buildManagedComputeAccessGateResponse(accessDecision);
  if (accessGateResponse) return accessGateResponse;
  const planTier = entitlement.plan;
  try {
    const owner = { userId, organizationId };
    const session = await getCloudCodeSession(db, owner, sessionId);
    const networkAccess = requireNotebookNetworkPolicy(
      session.networkAccess,
      body['requireNetworkAccess'],
    );
    const startedAt = new Date().toISOString();
    const outcome = await runCloudCodeNotebookCell(db, owner, sessionId, body, planTier);
    await recordNotebookRun(db, {
      userId,
      organizationId,
      sessionId,
      runId: randomUUID(),
      cellId: typeof body['cellId'] === 'string' && body['cellId'].trim() ? body['cellId'] : 'cell',
      cellIndex: 0,
      language: typeof body['language'] === 'string' ? body['language'] : 'python',
      code: typeof body['code'] === 'string' ? body['code'] : '',
      networkAccess,
      fromTop: false,
      ok: outcome.ok,
      error: outcome.error,
      startedAt,
    });
    return NextResponse.json(outcome);
  } catch (error) {
    rethrowCloudCodeError(error);
  }
}

export const POST = withErrorHandler(handleExecute);

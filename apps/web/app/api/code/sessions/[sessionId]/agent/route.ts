import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { effectivePlanTier } from '@agiworkforce/types';
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
  isCloudCodeSchemaUnavailable,
} from '@/lib/services/cloud-code-session-service';
import { startCloudCodeAgentTurn } from '@/lib/services/cloud-code-agent-service';
import {
  ManagedUsageRequestError,
  parseManagedUsageIdempotencyKey,
} from '@/lib/services/managed-usage-request-service';
import { managedUsageErrorResponse } from '@/lib/services/cloud-code-route-errors';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { isManagedComputePrivateBetaEnabled } from '@/lib/managed-compute-gate';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import {
  buildManagedComputeAccessGateResponse,
  evaluateManagedComputeAccess,
} from '@/lib/services/managed-compute-access';

export const runtime = 'nodejs';

/**
 * Same budget the managed agent stream asks for in
 * app/api/llm/v1/chat/completions/route.ts, the longest this codebase declares.
 *
 * This is the OUTER budget, and the agent loop's own budget now sits under it:
 * cloud-code-agent-service.ts derives CLOUD_CODE_AGENT_TURN_BUDGET_MS from this
 * number minus a teardown reserve, so a long turn ends at the loop's `timeout`
 * stop reason with time left to settle its reservation, write its terminal row
 * and pause its sandbox. It used to be the other way round, the loop asked for
 * 600s under a 300s ceiling, which made its own guard unreachable and left the
 * platform kill, which runs no unwind code at all, as the only thing that ended
 * a long turn. Next.js needs this to be a literal, so the two are kept in step
 * by hand; change one and change the other.
 */
export const maxDuration = 300;

const MAX_GOAL_LENGTH = 8000;

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

async function handleAgentTurn(request: NextRequest, context: RouteContext) {
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

  let idempotencyKey: string;
  try {
    idempotencyKey = parseManagedUsageIdempotencyKey(request.headers.get('idempotency-key'));
  } catch (error) {
    if (error instanceof ManagedUsageRequestError) return managedUsageErrorResponse(error);
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON request body');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw createError.validation('Request body must be an object');
  }
  const record = body as Record<string, unknown>;

  const goal = typeof record['goal'] === 'string' ? record['goal'].trim() : '';
  if (!goal || goal.length > MAX_GOAL_LENGTH || goal.includes('\0')) {
    throw createError.validation(
      `"goal" must be 1-${MAX_GOAL_LENGTH} characters and contain no null bytes`,
    );
  }
  const model = typeof record['model'] === 'string' ? record['model'].trim() : '';
  if (!model) throw createError.validation('"model" is required');

  const { sessionId } = await context.params;
  const subscription = await SubscriptionService.getSubscription(db, userId);
  const accessDecision = await evaluateManagedComputeAccess(
    db,
    userId,
    subscription,
    resolveCloudChatSurface(request),
    { request },
  );
  const accessGateResponse = buildManagedComputeAccessGateResponse(accessDecision);
  if (accessGateResponse) return accessGateResponse;
  const planTier = effectivePlanTier(subscription?.plan_tier, subscription?.status);

  try {
    const result = await startCloudCodeAgentTurn({
      db,
      owner: { userId, organizationId },
      sessionId,
      goal,
      model,
      planTier,
      idempotencyKey,
      signal: request.signal,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ManagedUsageRequestError) return managedUsageErrorResponse(error);
    rethrowCloudCodeError(error);
  }
}

export const POST = withErrorHandler(handleAgentTurn);

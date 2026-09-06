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
import {
  CloudCodeApprovalExpiredError,
  decideCloudCodeAgentApproval,
  listCloudCodeAgentApprovals,
} from '@/lib/services/cloud-code-agent-approval-service';
import { ManagedUsageRequestError } from '@/lib/services/managed-usage-request-service';
import { managedUsageErrorResponse } from '@/lib/services/cloud-code-route-errors';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import {
  buildManagedComputeAccessGateResponse,
  evaluateManagedComputeAccess,
} from '@/lib/services/managed-compute-access';

export const runtime = 'nodejs';

/**
 * POST resumes the same agent loop as ../route.ts, so it needs that route's
 * budget, and, like that route, it is the outer bound that
 * CLOUD_CODE_AGENT_TURN_BUDGET_MS in cloud-code-agent-service.ts is derived
 * from. Keep the two literals equal.
 */
export const maxDuration = 300;

type RouteContext = { params: Promise<{ sessionId: string }> };

function rethrowCloudCodeError(error: unknown): never {
  if (error instanceof CloudCodeValidationError) throw createError.validation(error.message);
  if (error instanceof CloudCodeNotFoundError) throw createError.notFound(error.message);
  if (error instanceof CloudCodeApprovalExpiredError) throw createError.conflict(error.message);
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

async function handleListApprovals(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const { sessionId } = await context.params;
  try {
    const approvals = await listCloudCodeAgentApprovals(db, { userId, organizationId }, sessionId);
    return NextResponse.json({ approvals });
  } catch (error) {
    if (error instanceof ManagedUsageRequestError) return managedUsageErrorResponse(error);
    rethrowCloudCodeError(error);
  }
}

async function handleDecideApproval(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);

  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;

  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  if (!e2bProvisioningReady()) {
    throw createError.serviceUnavailable('Managed Code is not enabled for this deployment');
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

  const turnId = typeof record['turnId'] === 'string' ? record['turnId'] : '';
  if (!turnId) throw createError.validation('"turnId" is required');

  const stepIndex = record['stepIndex'];
  if (typeof stepIndex !== 'number' || !Number.isInteger(stepIndex) || stepIndex < 0) {
    throw createError.validation('"stepIndex" must be a non-negative integer');
  }

  const decision = record['decision'];
  if (decision !== 'approve' && decision !== 'reject') {
    throw createError.validation('"decision" must be "approve" or "reject"');
  }

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
    const result = await decideCloudCodeAgentApproval({
      db,
      owner: { userId, organizationId },
      sessionId,
      turnId,
      stepIndex,
      decision,
      planTier,
      signal: request.signal,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ManagedUsageRequestError) return managedUsageErrorResponse(error);
    rethrowCloudCodeError(error);
  }
}

export const GET = withErrorHandler(handleListApprovals);
export const POST = withErrorHandler(handleDecideApproval);

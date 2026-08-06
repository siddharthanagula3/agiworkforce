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
import { SubscriptionService } from '@/lib/services/subscription-service';

/**
 * POST /api/code/sessions/[sessionId]/agent — run one Cloud Code agent turn.
 *
 * The difference from `../commands` is the whole point of the surface: that
 * route runs a command the USER typed; this one takes a GOAL and lets the model
 * drive the sandbox toward it under the approval boundary.
 *
 * `Idempotency-Key` is REQUIRED, exactly as on the managed chat path. An agent
 * turn makes multiple paid provider calls, so an unkeyed retry would open a
 * second billable turn against the same intent.
 */

export const runtime = 'nodejs';

const MAX_GOAL_LENGTH = 8000;

type RouteContext = { params: Promise<{ sessionId: string }> };

function rethrowCloudCodeError(error: unknown): never {
  if (error instanceof CloudCodeValidationError) throw createError.validation(error.message);
  if (error instanceof CloudCodeNotFoundError) throw createError.notFound(error.message);
  if (error instanceof CloudCodeConflictError) throw createError.conflict(error.message);
  if (error instanceof CloudCodeUnavailableError) {
    throw createError.serviceUnavailable(error.message);
  }
  if (error instanceof ManagedUsageRequestError) {
    throw createError.validation(error.message);
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

  // Required before any provider work, so a retry cannot double-bill.
  let idempotencyKey: string;
  try {
    idempotencyKey = parseManagedUsageIdempotencyKey(request.headers.get('idempotency-key'));
  } catch (error) {
    rethrowCloudCodeError(error);
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
      // Client disconnect cancels the turn; the service settles usage either way.
      signal: request.signal,
    });
    return NextResponse.json(result);
  } catch (error) {
    rethrowCloudCodeError(error);
  }
}

export const POST = withErrorHandler(handleAgentTurn);

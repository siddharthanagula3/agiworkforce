import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { effectivePlanTier } from '@agiworkforce/types';
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
  readCloudCodeSessionChanges,
} from '@/lib/services/cloud-code-session-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { isManagedComputePrivateBetaEnabled } from '@/lib/managed-compute-gate';

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
  const subscription = await SubscriptionService.getSubscription(db, userId);
  const planTier = effectivePlanTier(subscription?.plan_tier, subscription?.status);
  try {
    return NextResponse.json(
      await readCloudCodeSessionChanges(db, { userId, organizationId }, sessionId, planTier),
    );
  } catch (error) {
    rethrowCloudCodeError(error);
  }
}

export const GET = withErrorHandler(handleChanges);

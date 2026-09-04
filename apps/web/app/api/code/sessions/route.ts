import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  CLOUD_CODE_NETWORK_ACCESS,
  effectivePlanTier,
  getPlanMaxSandboxes,
  type CloudCodeNetworkAccess,
  type CloudCodeSession,
  type CreateCloudCodeSessionInput,
} from '@agiworkforce/types';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { e2bProvisioningReady } from '@/lib/e2b/gate';
import {
  NETWORK_ACCESS_REQUIRES_PROXY_CODE,
  fullNetworkNeedsProxy,
} from '@/lib/e2b/network-policy';
import { listCloudCodeRuntimes } from '@/lib/e2b/templates';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  CloudCodeConflictError,
  CloudCodeLimitError,
  CloudCodeNotFoundError,
  CloudCodeUnavailableError,
  CloudCodeValidationError,
  createCloudCodeSession,
  isCloudCodeSchemaUnavailable,
  listCloudCodeSessions,
} from '@/lib/services/cloud-code-session-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { isManagedComputePrivateBetaEnabled } from '@/lib/managed-compute-gate';

export const runtime = 'nodejs';

function rethrowCloudCodeError(error: unknown): never {
  if (error instanceof CloudCodeValidationError) throw createError.validation(error.message);
  if (error instanceof CloudCodeNotFoundError) throw createError.notFound(error.message);
  if (error instanceof CloudCodeConflictError) throw createError.conflict(error.message);
  if (error instanceof CloudCodeLimitError) throw createError.forbidden(error.message);
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

async function resolvePlan(db: DatabaseAdapter, userId: string): Promise<string> {
  const subscription = await SubscriptionService.getSubscription(db, userId);
  return effectivePlanTier(subscription?.plan_tier, subscription?.status);
}

async function handleList(request: NextRequest) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;

  const planTier = await resolvePlan(db, userId);
  const maxSessions = getPlanMaxSandboxes(planTier);
  let storageReady = true;
  let sessions: CloudCodeSession[];
  try {
    sessions = await listCloudCodeSessions(db, { userId, organizationId });
  } catch (error) {
    if (!isCloudCodeSchemaUnavailable(error)) throw error;
    storageReady = false;
    sessions = [];
  }
  // Offered only to an entitled account: the catalogue is a read against the
  // team's E2B org, not public information, and an unentitled caller cannot
  // create a session with any of it.
  const runtimes = maxSessions > 0 ? await listCloudCodeRuntimes() : [];
  return NextResponse.json({
    availability: {
      deploymentEnabled: e2bProvisioningReady(),
      storageReady,
      planEntitled: maxSessions > 0,
      planTier,
      maxSessions,
    },
    sessions,
    runtimes,
  });
}

async function handleCreate(request: NextRequest) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  if (!e2bProvisioningReady()) {
    throw createError.capabilityUnavailable(
      'Managed Code is not enabled for this deployment. Use the desktop app for local code.',
    );
  }
  if (!isManagedComputePrivateBetaEnabled()) {
    throw createError.capabilityUnavailable(
      'Managed compute is temporarily unavailable. Use Local or BYOK in the meantime, or try again shortly.',
    );
  }

  const body = await requestObject(request);
  const requestedNetworkAccess = (CLOUD_CODE_NETWORK_ACCESS as readonly unknown[]).includes(
    body['networkAccess'],
  )
    ? (body['networkAccess'] as CloudCodeNetworkAccess)
    : null;
  const requestedRuntimeId =
    typeof body['runtimeId'] === 'string' ? body['runtimeId'].trim() || null : null;
  if (requestedNetworkAccess && fullNetworkNeedsProxy(requestedNetworkAccess, requestedRuntimeId)) {
    return NextResponse.json(
      {
        error: {
          message:
            'Full network access is not available yet for this coding agent: its provider credentials would enter the sandbox directly. Choose Trusted hosts or No network, or pick an environment with no coding agent, until the credential proxy covers it.',
          type: 'invalid_request_error',
          code: NETWORK_ACCESS_REQUIRES_PROXY_CODE,
        },
      },
      { status: 422 },
    );
  }
  const planTier = await resolvePlan(db, userId);
  try {
    const session = await createCloudCodeSession(
      db,
      { userId, organizationId },
      body as unknown as CreateCloudCodeSessionInput,
      planTier,
    );
    return NextResponse.json({ session, terminalEntries: [] }, { status: 201 });
  } catch (error) {
    rethrowCloudCodeError(error);
  }
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handleCreate);

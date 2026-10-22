import 'server-only';

import type { NextRequest, NextResponse } from 'next/server';
import { requireCsrfToken } from '@/lib/csrf';
import { e2bProvisioningReady } from '@/lib/e2b/gate';
import { createError } from '@/lib/errors';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import { isManagedComputePrivateBetaEnabled } from '@/lib/managed-compute-gate';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { validateCloudCodeSessionId } from '@/lib/services/cloud-code-session-service';
import { resolveEntitlementBundle } from '@/lib/services/entitlement-resolution';
import {
  buildManagedComputeAccessGateResponse,
  evaluateManagedComputeAccess,
} from '@/lib/services/managed-compute-access';

import type { SecurityScanServiceContext } from './service';

export async function securityScanRouteContext(
  request: NextRequest,
  sessionId: string,
  options: { mutation: boolean },
): Promise<SecurityScanServiceContext | NextResponse> {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(
    request,
    options.mutation ? 'chat-conversation' : 'chat-conversation-read',
    `user:${userId}`,
  );
  if (limited) return limited;
  if (options.mutation) {
    const csrfError = await requireCsrfToken(request, userId);
    if (csrfError) return csrfError as NextResponse;
  }
  if (!e2bProvisioningReady()) {
    throw createError.capabilityUnavailable('Managed Code is not enabled for this deployment');
  }
  if (!isManagedComputePrivateBetaEnabled()) {
    throw createError.capabilityUnavailable(
      'Managed compute is temporarily unavailable. Use Local or BYOK in the meantime, or try again shortly.',
    );
  }
  const entitlement = await resolveEntitlementBundle(db, userId);
  const decision = await evaluateManagedComputeAccess(
    db,
    userId,
    entitlement.subscription,
    resolveCloudChatSurface(request),
    { request },
    'code',
  );
  const gate = buildManagedComputeAccessGateResponse(decision);
  if (gate) return gate;
  return {
    db,
    owner: { userId, organizationId },
    sessionId: validateCloudCodeSessionId(sessionId),
    planTier: entitlement.plan,
    signal: request.signal,
  };
}

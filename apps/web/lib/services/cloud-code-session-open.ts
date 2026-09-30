import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  CLOUD_CODE_NETWORK_ACCESS,
  type CloudCodeNetworkAccess,
  type CreateCloudCodeSessionInput,
} from '@agiworkforce/types';
import { createError } from '@/lib/errors';
import { e2bProvisioningReady } from '@/lib/e2b/gate';
import {
  HARNESS_CREDENTIAL_UNAVAILABLE_CODE,
  NETWORK_ACCESS_REQUIRES_PROXY_CODE,
  egressNeedsProxy,
  harnessCredentialIsAvailable,
} from '@/lib/e2b/network-policy';
import { harnessTemplates } from '@/lib/e2b/templates';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  CloudCodeConflictError,
  CloudCodeLimitError,
  CloudCodeNotFoundError,
  CloudCodeUnavailableError,
  CloudCodeValidationError,
  createCloudCodeSession,
  isCloudCodeSchemaUnavailable,
  type CloudCodeOwner,
  type OpenedCloudCodeSession,
} from '@/lib/services/cloud-code-session-service';
import { resolveEntitlementBundle } from '@/lib/services/entitlement-resolution';
import {
  buildWorkspaceFeatureGateResponse,
  isManagedComputePrivateBetaEnabled,
} from '@/lib/managed-compute-gate';
import { buildWorkspaceCodeGateResponse } from '@/lib/services/organization-policy-code-gate';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import {
  buildManagedComputeAccessGateResponse,
  evaluateManagedComputeAccess,
} from '@/lib/services/managed-compute-access';

export function rethrowCloudCodeError(error: unknown): never {
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

export async function openCloudCodeSession(
  request: NextRequest,
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  body: Record<string, unknown>,
): Promise<Response | OpenedCloudCodeSession> {
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

  const requestedNetworkAccess = (CLOUD_CODE_NETWORK_ACCESS as readonly unknown[]).includes(
    body['networkAccess'],
  )
    ? (body['networkAccess'] as CloudCodeNetworkAccess)
    : null;
  const requestedRuntimeId =
    typeof body['runtimeId'] === 'string' ? body['runtimeId'].trim() || null : null;
  const requestedExtraHostCount = Array.isArray(body['extraHosts']) ? body['extraHosts'].length : 0;
  const hasExplicitHarnessCredential =
    typeof body['harnessCredential'] === 'string' && body['harnessCredential'].trim().length > 0;
  if (
    requestedNetworkAccess &&
    egressNeedsProxy(
      requestedNetworkAccess,
      requestedRuntimeId,
      hasExplicitHarnessCredential,
      requestedExtraHostCount,
    )
  ) {
    return NextResponse.json(
      {
        error: {
          message:
            'Full internet access and extra egress hosts are not available yet for this coding agent: its provider credentials would enter the sandbox directly. Choose Trusted hosts or Isolated without extra hosts, or pick an environment with no coding agent, until the credential proxy covers it.',
          type: 'invalid_request_error',
          code: NETWORK_ACCESS_REQUIRES_PROXY_CODE,
        },
      },
      { status: 422 },
    );
  }
  if (
    requestedRuntimeId &&
    !harnessCredentialIsAvailable(requestedRuntimeId, hasExplicitHarnessCredential)
  ) {
    const harnessName =
      harnessTemplates().find((harness) => harness.id === requestedRuntimeId)?.name ??
      requestedRuntimeId;
    return NextResponse.json(
      {
        error: {
          message: `${harnessName} has no managed provider credential available for a sandbox. Bring your own key for ${harnessName}, or choose a coding agent whose provider is proxied.`,
          type: 'invalid_request_error',
          code: HARNESS_CREDENTIAL_UNAVAILABLE_CODE,
        },
      },
      { status: 422 },
    );
  }
  const featureGate = await buildWorkspaceFeatureGateResponse(
    owner.userId,
    request,
    'code',
    resolveCloudChatSurface(request),
  );
  if (featureGate) return featureGate;

  const codeGate = await buildWorkspaceCodeGateResponse(
    db,
    owner.userId,
    { act: 'open_cloud_session', surface: resolveCloudChatSurface(request) },
    request,
  );
  if (codeGate) return codeGate;

  for (const host of Array.isArray(body['extraHosts']) ? body['extraHosts'] : []) {
    const hostGate = await buildWorkspaceCodeGateResponse(
      db,
      owner.userId,
      { act: 'reach_host', host: typeof host === 'string' ? host : null },
      request,
    );
    if (hostGate) return hostGate;
  }

  const entitlement = await resolveEntitlementBundle(db, owner.userId);
  const accessDecision = await evaluateManagedComputeAccess(
    db,
    owner.userId,
    entitlement.subscription,
    resolveCloudChatSurface(request),
    { request },
    'code',
  );
  const accessGateResponse = buildManagedComputeAccessGateResponse(accessDecision);
  if (accessGateResponse) return accessGateResponse;
  const planTier = entitlement.plan;
  try {
    return await createCloudCodeSession(
      db,
      owner,
      body as unknown as CreateCloudCodeSessionInput,
      planTier,
    );
  } catch (error) {
    rethrowCloudCodeError(error);
  }
}

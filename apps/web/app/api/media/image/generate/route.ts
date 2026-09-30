import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { MEDIA_DIAGNOSTIC_HEADER, withMediaJobSpan } from '@/lib/observability/media-telemetry';
import { getClerkAuthUser } from '@/lib/api-auth';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import {
  buildManagedComputeGateResponse,
  buildOrganizationPolicyGateResponse,
  buildSpendLimitGateResponse,
  buildModelPolicyGateResponse,
} from '@/lib/managed-compute-gate';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import { assertCapabilityAvailable } from '@/lib/feature-flags/capability-gate';
import { buildFlagSubject } from '@/lib/feature-flags/flag-evaluation-service';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { generateManagedImage } from '../lib/managed-image-generation';

export const maxDuration = 60;
export const runtime = 'nodejs';

async function handleImageGeneration(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) {
    return preflightResponse;
  }

  const csrfError = await requireCsrfToken(request);
  if (csrfError) {
    return csrfError as NextResponse;
  }

  const rateLimitResponse = await withRateLimit(request, 'image-generation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);

  // Resolved exactly once: the workspace admitted at the start of the turn is
  // the workspace the row is written to, so a switch mid-request cannot move it.
  let scopedDbPromise: ReturnType<typeof getUserScopedDb> | undefined;
  const callerScope = () => (scopedDbPromise ??= getUserScopedDb(request));

  const managedGateResponse = buildManagedComputeGateResponse(
    request,
    {
      provider: 'managed-media',
      model: 'image-generation',
      feature: 'media_image_generation',
    },
    {
      ...getCorsHeaders(request),
      ...getSecurityHeaders(),
    },
  );
  if (managedGateResponse) return managedGateResponse;

  const policyGateResponse = await buildOrganizationPolicyGateResponse(
    userId,
    request,
    {
      provider: 'managed-media',
      model: 'image-generation',
      feature: 'media_image_generation',
      surface: resolveCloudChatSurface(request),
    },
    {
      ...getCorsHeaders(request),
      ...getSecurityHeaders(),
    },
  );
  if (policyGateResponse) return policyGateResponse;

  // The workspace budget, checked before any credit is reserved so a turn
  // that a spend cap will refuse never spends anything first.
  const spendGateResponse = await buildSpendLimitGateResponse(userId);
  if (spendGateResponse) return spendGateResponse;

  const headers = { ...getCorsHeaders(request), ...getSecurityHeaders() };
  return generateManagedImage({
    userId,
    startTime,
    headers,
    scope: callerScope,
    readBody: () => request.json(),
    idempotencyKey: request.headers.get('Idempotency-Key'),
    modelPolicyRefusal: (model) => buildModelPolicyGateResponse(userId, request, model, headers),
    assertCapabilityOpen: async (plan) =>
      assertCapabilityAvailable(
        buildFlagSubject(request, {
          userId,
          workspaceId: (await callerScope()).organizationId ?? null,
          role: null,
          plan,
          surface: resolveCloudChatSurface(request),
        }),
        'canUseImages',
        'Image generation',
      ),
  });
}

export const POST = withErrorHandler((request: NextRequest) =>
  withMediaJobSpan({ media: 'image' }, async (span) => {
    const response = await handleImageGeneration(request);
    response.headers.set(MEDIA_DIAGNOSTIC_HEADER, span.traceId);
    return response;
  }),
);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}

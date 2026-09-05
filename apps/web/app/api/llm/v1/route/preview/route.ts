import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  modelRegistry,
  INTRINSIC_CAPABILITY_NAMES,
  type IntrinsicCapabilityName,
} from '@agiworkforce/model-registry';
import {
  previewAutoRoute,
  type AutoRoutePreview,
  type AutoRoutingRequest,
  type ObservedRouteHealth,
  type RoutingTaskType,
} from '@agiworkforce/routing';
import {
  handleCorsPreflightRequest,
  getSecurityHeaders,
  getCorsHeaders,
  withCorsRoute,
} from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { readModelPolicy } from '@/lib/services/model-policy-service';
import { resolveZeroDataRetentionPolicy } from '@/lib/services/organization-policy-gate';
import { resolveZeroDataRetentionProviderOverrides } from '@/lib/services/zero-data-retention-provider-overrides';
import { listAvailableManagedProviderIds } from '@/lib/services/provider-adapter-service';
import { getServedRouteAffinity } from '@/lib/services/free-lane/runtime-state-service';
import { getUnhonouredCapabilities } from '@/lib/services/free-lane/capability-health-service';
import { runAuthGate } from '../../chat/completions/lib/auth-gate';
import { buildWebCloudAutoRoutingRequest } from '../../chat/completions/lib/request-processor';

const DEFAULT_SELECTION = modelRegistry.policies.auto.defaultAlias;

const INTRINSIC_CAPABILITY_VALUES = INTRINSIC_CAPABILITY_NAMES as readonly [
  IntrinsicCapabilityName,
  ...IntrinsicCapabilityName[],
];

const RoutePreviewRequestSchema = z.object({
  selection: z.string().trim().min(1).max(200).optional(),
  taskType: z.string().trim().min(1).max(64),
  conversationId: z.string().trim().min(1).max(200).optional(),
  capabilitiesInUse: z.array(z.enum(INTRINSIC_CAPABILITY_VALUES)).max(16).optional(),
});

function isKnownTaskType(value: string): value is RoutingTaskType {
  return value in modelRegistry.policies.auto.tasks;
}

function jsonError(message: string, status: number, code: string): NextResponse {
  return NextResponse.json(
    { error: { message, type: 'invalid_request_error', code } },
    { status, headers: { ...getSecurityHeaders() } },
  );
}

async function readWorkspacePolicyForPreview(
  db: Parameters<typeof readModelPolicy>[0],
  organizationId: string | null,
  userId: string,
): Promise<Awaited<ReturnType<typeof readModelPolicy>>> {
  if (!organizationId) return null;
  try {
    return await readModelPolicy(db, organizationId);
  } catch (error) {
    logger.error(
      { error, userId, organizationId },
      '[route-preview] workspace policy read failed; previewing ungoverned',
    );
    return null;
  }
}

/**
 * The first pass names the candidate routes; the capability store is then read
 * for exactly those, and only a route with observed loss makes a second pass
 * worth running. A store that cannot answer leaves the preview exactly as the
 * declared catalog computed it.
 */
async function previewWithObservedCapabilities(
  routingRequest: AutoRoutingRequest,
  capabilitiesInUse: readonly IntrinsicCapabilityName[],
  userId: string,
): Promise<AutoRoutePreview> {
  const preview = previewAutoRoute(routingRequest);
  if (capabilitiesInUse.length === 0) return preview;

  const routeIds = preview.candidates.map((candidate) => candidate.routeId).filter(Boolean);
  if (routeIds.length === 0) return preview;

  let unhonoured: Readonly<Record<string, readonly IntrinsicCapabilityName[]>> = {};
  try {
    unhonoured = await getUnhonouredCapabilities(routeIds, capabilitiesInUse);
  } catch (error) {
    logger.error(
      { error, userId },
      '[route-preview] capability health read failed; previewing on declared capabilities only',
    );
    return preview;
  }
  if (Object.keys(unhonoured).length === 0) return preview;

  const observedRouteHealth: Record<string, ObservedRouteHealth> = {
    ...routingRequest.observedRouteHealth,
  };
  for (const [routeId, capabilities] of Object.entries(unhonoured)) {
    observedRouteHealth[routeId] = {
      ...observedRouteHealth[routeId],
      unhonouredCapabilities: capabilities,
    };
  }
  return previewAutoRoute({ ...routingRequest, observedRouteHealth, capabilitiesInUse });
}

async function handleRoutePreview(request: NextRequest): Promise<Response> {
  const authResult = await runAuthGate(request);
  if (!authResult.ok) return authResult.response;
  const { userId, subscription } = authResult;

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return jsonError('Invalid JSON in route preview request.', 400, 'invalid_request_body');
  }
  const parsed = RoutePreviewRequestSchema.safeParse(parsedBody);
  if (!parsed.success) {
    return jsonError('Invalid route preview request.', 400, 'invalid_request_body');
  }
  const { selection, taskType, conversationId, capabilitiesInUse } = parsed.data;
  if (!isKnownTaskType(taskType)) {
    return jsonError(`Unknown routing task type: ${taskType}`, 400, 'unknown_task_type');
  }

  const { db, organizationId } = await getUserScopedDb(request, { apiKeyScope: 'inference:write' });

  const [workspacePolicy, zeroDataRetentionPolicy, routeAffinity] = await Promise.all([
    readWorkspacePolicyForPreview(db, organizationId, userId),
    resolveZeroDataRetentionPolicy(db, userId, request),
    conversationId ? getServedRouteAffinity(conversationId) : Promise.resolve(null),
  ]);

  const routingRequest = buildWebCloudAutoRoutingRequest(
    selection ?? DEFAULT_SELECTION,
    subscription.plan_tier,
    taskType,
    undefined,
    undefined,
    {
      ...(routeAffinity?.modelKey ? { currentModelKey: routeAffinity.modelKey } : {}),
      ...(routeAffinity?.taskType ? { previousTaskType: routeAffinity.taskType } : {}),
    },
    listAvailableManagedProviderIds(),
    zeroDataRetentionPolicy.required,
    resolveZeroDataRetentionProviderOverrides(),
    workspacePolicy,
  );

  const preview = await previewWithObservedCapabilities(
    routingRequest,
    capabilitiesInUse ?? [],
    userId,
  );

  return NextResponse.json(
    {
      selected: preview.selected,
      candidates: preview.candidates,
      excluded: preview.excluded,
      liveRequestExecuted: false,
    },
    { headers: { ...getCorsHeaders(request), ...getSecurityHeaders() } },
  );
}

export const POST = withCorsRoute(withErrorHandler(handleRoutePreview));

export function OPTIONS(request: NextRequest): Response {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { modelRegistry } from '@agiworkforce/model-registry';
import { previewAutoRoute, type RoutingTaskType } from '@agiworkforce/routing';
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
import { runAuthGate } from '../../chat/completions/lib/auth-gate';
import { buildWebCloudAutoRoutingRequest } from '../../chat/completions/lib/request-processor';

const DEFAULT_SELECTION = modelRegistry.policies.auto.defaultAlias;

const RoutePreviewRequestSchema = z.object({
  selection: z.string().trim().min(1).max(200).optional(),
  taskType: z.string().trim().min(1).max(64),
  conversationId: z.string().trim().min(1).max(200).optional(),
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

/**
 * Fails OPEN, the same posture `readWorkspaceModelPolicy` takes in the
 * completions path: a policy read failure previews the request as ungoverned
 * rather than turning a database fault into a preview the caller cannot get.
 */
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
 * A pure, explainable dry run of the Managed Web Cloud auto-routing decision.
 *
 * Builds the exact `AutoRoutingRequest` the completions path would dispatch
 * with for this selection, task type, plan tier, workspace policy and
 * conversation continuity state, then hands it to `previewAutoRoute`, which
 * never performs I/O and never contacts a provider. `liveRequestExecuted` is
 * always `false`.
 */
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
  const { selection, taskType, conversationId } = parsed.data;
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

  const preview = previewAutoRoute(routingRequest);

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

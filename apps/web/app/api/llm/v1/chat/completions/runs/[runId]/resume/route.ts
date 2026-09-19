import 'server-only';

import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PausedRunResumeRequestSchema } from '@agiworkforce/cloud-contracts';
import { isFreeBillingPlanTier } from '@agiworkforce/types';
import { withErrorHandler } from '@/lib/error-handler';
import {
  handleCorsPreflightRequest,
  getSecurityHeaders,
  getCorsHeaders,
  withCorsRoute,
} from '@/lib/cors';
import {
  buildManagedComputeGateResponse,
  buildOrganizationPolicyGateResponse,
  buildSpendLimitGateResponse,
} from '@/lib/managed-compute-gate';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { runAuthGate, type AuthGateSuccess } from '../../../lib/auth-gate';
import { withManagedTurnSlot } from '../../../lib/turn-slot';
import { processRequest } from '../../../lib/request-processor';
import { loadMcpToolDefs } from '../../../lib/tool-loop';
import { loadUserConnectorToolDefs } from '@/lib/user-connector-tools';
import {
  ManagedUsageRequestError,
  finalizeManagedUsageRequest,
  markManagedUsageProviderStarted,
  type ManagedUsageRequestReservation,
} from '@/lib/services/managed-usage-request-service';
import { getCustomRemoteMcpLimit } from '@/lib/services/free-plan-entitlements';
import {
  CloudAgentApprovalCheckpointConflictError,
  CloudAgentApprovalCheckpointNotFoundError,
  claimCloudAgentPauseCheckpoint,
  releaseCloudAgentPauseCheckpoint,
  withdrawCloudAgentRunPauseRequest,
  type ClaimedCloudAgentPauseCheckpoint,
} from '@/lib/services/cloud-agent-run-service';
import { runCloudAgentTurn } from '@/lib/workflows/start-cloud-agent-workflow';
import { boundDurableTurnStream } from '@/lib/workflows/durable-stream-bounds';
import { withSseHeartbeat } from '../../../lib/sse-heartbeat';
import { withStreamEnvelope } from '../../../lib/stream-envelope';
import { addProjectSourcesHeader } from '@/lib/chat-project-sources';
import { loadConnectorToolPermissions } from '../../../lib/connector-tool-permissions';
import { loadToolApprovalPolicy, policyAutoApprovesTool } from '../../../lib/tool-approval-policy';
import { applySecretHandlingToTexts } from '../../../lib/secret-handling-gate';
import { substituteGatedWebSearchTool } from '@/lib/web-search/required-search';
import { WEB_SEARCH_TOOL, webSearchBackendConfigured } from '@/lib/web-search/web-search-tool';

// Same tool loop as the completions route, same limit; a literal because Next reads it statically.
export const maxDuration = 300;

type RouteContext = { params: Promise<{ runId: string }> };
const RunIdSchema = z.string().uuid();

const SECRET_IN_GUIDANCE_MESSAGE =
  'This guidance was blocked because it appears to contain a secret, such as an API key or access token. Remove it and try again.';

function jsonError(message: string, status: number, code = 'paused_run_resume_invalid') {
  return NextResponse.json(
    { error: { message, type: 'invalid_request_error', code } },
    { status, headers: getSecurityHeaders() },
  );
}

function buildSyntheticRequest(
  request: NextRequest,
  claim: ClaimedCloudAgentPauseCheckpoint,
): NextRequest {
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  if (!headers.has('idempotency-key')) headers.set('idempotency-key', randomUUID());
  return new NextRequest(request.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...claim.checkpoint.request,
      messages: claim.checkpoint.messages.map(
        ({ __canonicalThinking: _private, ...message }) => message,
      ),
      stream: true,
    }),
  });
}

async function releaseClaim(
  db: Awaited<ReturnType<typeof getUserScopedDb>>['db'],
  userId: string,
  claim: ClaimedCloudAgentPauseCheckpoint,
): Promise<void> {
  await releaseCloudAgentPauseCheckpoint(db, {
    userId,
    runId: claim.checkpoint.runId,
    checkpointId: claim.checkpoint.id,
    leaseToken: claim.leaseToken,
  }).catch((error) => {
    logger.error(
      { error, userId, runId: claim.checkpoint.runId },
      'Paused cloud agent run lease could not be released',
    );
  });
}

async function releaseReservation(
  managedUsage: ManagedUsageRequestReservation | undefined,
  reason: string,
): Promise<void> {
  if (!managedUsage) return;
  await finalizeManagedUsageRequest({
    ...managedUsage,
    outcome: 'failed',
    actualCostCents: 0,
    usage: { reason },
  }).catch(() => undefined);
}

async function handlePausedRunResume(
  request: NextRequest,
  authResult: AuthGateSuccess,
  runId: string,
) {
  const { userId, subscription } = authResult;
  const { db } = await getUserScopedDb(request);

  let fields;
  try {
    const parsed = PausedRunResumeRequestSchema.safeParse(await request.json());
    if (!parsed.success) return jsonError('Invalid resume request.', 400);
    fields = parsed.data;
  } catch {
    return jsonError('Invalid JSON in resume request.', 400);
  }

  const withdrawn = await withdrawCloudAgentRunPauseRequest(db, { userId, runId });
  if (withdrawn) {
    return NextResponse.json(
      { run: withdrawn },
      { headers: { ...getCorsHeaders(request), ...getSecurityHeaders() } },
    );
  }

  const isFreeTierRequest =
    !subscription ||
    !subscription.plan_tier ||
    isFreeBillingPlanTier(subscription.plan_tier.toLowerCase());
  const gateContext = {
    provider: 'managed',
    model: 'chat-completions',
    feature: 'llm_v1_chat_completions',
    isFreeTrial: isFreeTierRequest,
  };
  const managedGateResponse = buildManagedComputeGateResponse(
    request,
    gateContext,
    getSecurityHeaders(),
  );
  if (managedGateResponse) return managedGateResponse;
  const policyGateResponse = await buildOrganizationPolicyGateResponse(
    userId,
    request,
    { ...gateContext, surface: resolveCloudChatSurface(request) },
    getSecurityHeaders(),
  );
  if (policyGateResponse) return policyGateResponse;
  const spendGateResponse = await buildSpendLimitGateResponse(userId);
  if (spendGateResponse) return spendGateResponse;

  const guidanceGate = await applySecretHandlingToTexts(userId, [fields.guidance ?? '']);
  if (guidanceGate.action === 'blocked') return jsonError(SECRET_IN_GUIDANCE_MESSAGE, 400);
  const guidance =
    guidanceGate.action === 'redacted' ? guidanceGate.texts[0] || undefined : fields.guidance;

  let claim: ClaimedCloudAgentPauseCheckpoint;
  try {
    claim = await claimCloudAgentPauseCheckpoint(db, { userId, runId, leaseSeconds: 86_400 });
  } catch (error) {
    if (error instanceof CloudAgentApprovalCheckpointNotFoundError) {
      return jsonError('This task is not paused.', 409, 'run_not_paused');
    }
    if (error instanceof CloudAgentApprovalCheckpointConflictError) {
      return jsonError('This task is already resuming.', 409, 'run_already_resuming');
    }
    throw error;
  }

  const processResult = await processRequest(buildSyntheticRequest(request, claim), authResult);
  if (!processResult.ok) {
    await releaseClaim(db, userId, claim);
    return processResult.response;
  }
  const processed = processResult;
  processed.llmRequest.messages = claim.checkpoint.messages;

  let discovery;
  try {
    const permissions = await loadConnectorToolPermissions(db, userId);
    const [operatorTools, connectorTools] = await Promise.all([
      loadMcpToolDefs(),
      loadUserConnectorToolDefs(userId, {
        customConnectorLimit: getCustomRemoteMcpLimit(processed.subscriptionTier) ?? undefined,
        planTier: processed.subscriptionTier,
        isToolDenied: permissions.isConnectorToolDenied,
      }),
    ]);
    discovery = { mcpTools: [...operatorTools, ...connectorTools], permissions };
  } catch (error) {
    await releaseReservation(processed.managedUsage, 'tool_discovery_failed');
    await releaseClaim(db, userId, claim);
    throw error;
  }

  if (processed.managedUsage) {
    try {
      await markManagedUsageProviderStarted(processed.managedUsage);
    } catch (error) {
      await releaseReservation(processed.managedUsage, 'provider_start_failed');
      await releaseClaim(db, userId, claim);
      const managedError =
        error instanceof ManagedUsageRequestError
          ? error
          : new ManagedUsageRequestError(
              'Managed usage billing is temporarily unavailable.',
              503,
              'billing_unavailable',
            );
      return NextResponse.json(
        {
          error: {
            message: managedError.message,
            type: 'invalid_request_error',
            code: managedError.code,
            contract_version: managedError.contractVersion,
          },
        },
        { status: managedError.status, headers: getSecurityHeaders() },
      );
    }
  }

  const toolApprovalPolicy = await loadToolApprovalPolicy(db, userId);

  // The checkpoint froze the client's pre-substitution tool list, so a native
  // search the first leg withdrew returns unless it is withdrawn again here.
  processed.llmRequest.tools = substituteGatedWebSearchTool(processed.llmRequest.tools, {
    approvalRequired: !policyAutoApprovesTool(toolApprovalPolicy, WEB_SEARCH_TOOL),
    genericBackendConfigured: webSearchBackendConfigured(),
  });

  let turn;
  try {
    turn = await runCloudAgentTurn({
      db,
      runId,
      userId,
      processed,
      mcpTools: discovery.mcpTools,
      approvalMode: 'manual',
      toolApprovalPolicy,
      connectorPermissions: discovery.permissions,
      onDurableUnavailable: 'inline',
      signal: request.signal,
      completionReason: 'tool_loop_pause_resume_completed',
      cancellationReason: 'client_cancelled_tool_loop_pause_resume',
      hasConnectorTools: discovery.mcpTools.some((tool) => tool.origin === 'connector'),
      continuation: {
        eventSessionId: claim.checkpoint.sessionId,
        eventTurnId: claim.checkpoint.turnId,
        initialEventSequence: claim.checkpoint.nextEventSequence,
        initialCompletedSteps: claim.checkpoint.completedSteps,
        invocationContinuation: true,
        resumedFromPause: guidance ? { guidance } : {},
      },
      predecessorApproval: {
        checkpointId: claim.checkpoint.id,
        leaseToken: claim.leaseToken,
      },
    });
  } catch (error) {
    await releaseReservation(processed.managedUsage, 'workflow_start_failed');
    await releaseClaim(db, userId, claim);
    logger.error(
      { error, userId, requestId: processed.requestId, runId },
      'Paused run continuation could not be started on either transport',
    );
    return NextResponse.json(
      {
        error: {
          message: 'Agent continuation is temporarily unavailable.',
          type: 'server_error',
          code: 'agent_workflow_unavailable',
        },
      },
      { status: 503, headers: getSecurityHeaders() },
    );
  }

  const streamHeaders: Record<string, string> = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-AGI-Tool-Loop': 'resume-paused',
    'X-AGI-Agent-Run-Id': runId,
    'X-AGI-Agent-Run-URL': `/api/llm/v1/chat/completions/runs/${encodeURIComponent(runId)}`,
    'X-AGI-Agent-Transport': turn.transport,
    ...getCorsHeaders(request),
    ...getSecurityHeaders(),
  };
  if (turn.workflowRunId) streamHeaders['X-AGI-Workflow-Run-Id'] = turn.workflowRunId;
  if (processed.quotaWarningHeader) streamHeaders['X-Quota-Warning'] = processed.quotaWarningHeader;
  addProjectSourcesHeader(streamHeaders, processed);

  const body =
    turn.transport === 'durable' && turn.workflowRunId
      ? boundDurableTurnStream({
          readable: turn.readable,
          db,
          userId,
          runId,
          workflowRunId: turn.workflowRunId,
          requestId: processed.requestId,
        })
      : turn.readable;

  const enveloped = withStreamEnvelope(body, {
    conversationId: processed.conversationId ?? undefined,
    turnId: processed.assistantMessageId ?? undefined,
    startSequence: claim.checkpoint.nextEventSequence,
  });

  return new NextResponse(withSseHeartbeat(enveloped), { headers: streamHeaders });
}

async function admitAndDispatchResume(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse | Response> {
  const parsedRunId = RunIdSchema.safeParse((await context.params).runId);
  if (!parsedRunId.success) return jsonError('Cloud agent run not found', 404, 'not_found');
  const authResult = await runAuthGate(request);
  if (!authResult.ok) return authResult.response;

  return withManagedTurnSlot(
    { userId: authResult.userId, planTier: authResult.subscription.plan_tier },
    () => handlePausedRunResume(request, authResult, parsedRunId.data),
  );
}

export const POST = withCorsRoute(withErrorHandler(admitAndDispatchResume));

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}

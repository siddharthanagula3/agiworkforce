import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { ToolApprovalResumeRequestSchema } from '@agiworkforce/cloud-contracts';
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
import { runAuthGate } from '../lib/auth-gate';
import { processRequest, type ProcessedRequest } from '../lib/request-processor';
import { loadMcpToolDefs } from '../lib/tool-loop';
import { loadUserConnectorToolDefs } from '@/lib/user-connector-tools';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import {
  ManagedUsageRequestError,
  finalizeManagedUsageRequest,
  markManagedUsageProviderStarted,
} from '@/lib/services/managed-usage-request-service';
import { getCustomRemoteMcpLimit } from '@/lib/services/free-plan-entitlements';
import {
  claimCloudAgentApprovalCheckpoint,
  releaseCloudAgentApprovalCheckpoint,
  CloudAgentApprovalCheckpointConflictError,
  CloudAgentApprovalCheckpointExpiredError,
  CloudAgentApprovalCheckpointNotFoundError,
  CloudAgentApprovalDecisionError,
  type ClaimedCloudAgentApprovalCheckpoint,
} from '@/lib/services/cloud-agent-run-service';
import { runCloudAgentTurn } from '@/lib/workflows/start-cloud-agent-workflow';
import {
  loadConnectorToolPermissions,
  type ConnectorToolPermissions,
} from '../lib/connector-tool-permissions';
import { loadToolApprovalPolicy } from '../lib/tool-approval-policy';

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json(
    { error: { message, type: 'invalid_request_error', code: 'tool_approval_invalid' } },
    { status, headers: getSecurityHeaders() },
  );
}

function publicCheckpointMessages(
  messages: ClaimedCloudAgentApprovalCheckpoint['checkpoint']['messages'],
): Array<Record<string, unknown>> {
  return messages.map(({ __canonicalThinking: _private, ...message }) => message);
}

function buildSyntheticRequest(
  request: NextRequest,
  claim: ClaimedCloudAgentApprovalCheckpoint,
): NextRequest {
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  return new NextRequest(request.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...claim.checkpoint.request,
      messages: publicCheckpointMessages(claim.checkpoint.messages),
      stream: true,
    }),
  });
}

async function releaseClaim(
  db: Awaited<ReturnType<typeof getUserScopedDb>>['db'],
  userId: string,
  claim: ClaimedCloudAgentApprovalCheckpoint,
): Promise<void> {
  await releaseCloudAgentApprovalCheckpoint(db, {
    userId,
    runId: claim.checkpoint.runId,
    checkpointId: claim.checkpoint.id,
    leaseToken: claim.leaseToken,
  }).catch((error) => {
    logger.error(
      { error, userId, runId: claim.checkpoint.runId },
      'Cloud agent approval lease could not be released',
    );
  });
}

function checkpointError(error: unknown): NextResponse | null {
  if (error instanceof CloudAgentApprovalDecisionError) {
    return jsonError('Approval decisions do not match the pending tool calls.', 400);
  }
  if (error instanceof CloudAgentApprovalCheckpointExpiredError) {
    return jsonError('This approval request expired and can no longer be resumed.', 410);
  }
  if (error instanceof CloudAgentApprovalCheckpointNotFoundError) {
    return jsonError('Pending approval not found.', 404);
  }
  if (error instanceof CloudAgentApprovalCheckpointConflictError) {
    return jsonError('This approval is already being resumed.', 409);
  }
  return null;
}

async function handleToolApproval(request: NextRequest) {
  const authResult = await runAuthGate(request);
  if (!authResult.ok) return authResult.response;
  const { userId, subscription } = authResult;

  const isFreeTierRequest =
    !subscription ||
    !subscription.plan_tier ||
    isFreeBillingPlanTier(subscription.plan_tier.toLowerCase());
  const managedGateResponse = buildManagedComputeGateResponse(
    request,
    {
      provider: 'managed',
      model: 'chat-completions',
      feature: 'llm_v1_chat_completions',
      isFreeTrial: isFreeTierRequest,
    },
    getSecurityHeaders(),
  );
  if (managedGateResponse) return managedGateResponse;

  const policyGateResponse = await buildOrganizationPolicyGateResponse(
    userId,
    request,
    {
      provider: 'managed',
      model: 'chat-completions',
      feature: 'llm_v1_chat_completions',
      isFreeTrial: isFreeTierRequest,
      surface: resolveCloudChatSurface(request),
    },
    getSecurityHeaders(),
  );
  if (policyGateResponse) return policyGateResponse;

  // The workspace budget, checked before any credit is reserved so a turn
  // that a spend cap will refuse never spends anything first.
  const spendGateResponse = await buildSpendLimitGateResponse(userId, request);
  if (spendGateResponse) return spendGateResponse;

  let resumeFields;
  try {
    const parsed = ToolApprovalResumeRequestSchema.safeParse(await request.json());
    if (!parsed.success) return jsonError('Invalid approval resume request.', 400);
    resumeFields = parsed.data;
  } catch {
    return jsonError('Invalid JSON in approval resume request.', 400);
  }

  const { db } = await getUserScopedDb(request);
  let claim: ClaimedCloudAgentApprovalCheckpoint;
  try {
    claim = await claimCloudAgentApprovalCheckpoint(db, {
      userId,
      runId: resumeFields.run_id,
      approvals: resumeFields.tool_approvals.map((approval) => ({
        toolCallId: approval.tool_call_id,
        decision: approval.decision,
      })),
      leaseSeconds: 86_400,
    });
  } catch (error) {
    const response = checkpointError(error);
    if (response) return response;
    throw error;
  }

  const processResult = await processRequest(buildSyntheticRequest(request, claim), authResult);
  if (!processResult.ok) {
    await releaseClaim(db, userId, claim);
    return processResult.response;
  }
  const processed: ProcessedRequest = processResult;

  processed.llmRequest.messages = claim.checkpoint.messages;

  const discovery: { mcpTools: WebMcpToolDef[]; permissions: ConnectorToolPermissions } =
    await (async () => {
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
        return { mcpTools: [...operatorTools, ...connectorTools], permissions };
      } catch (error) {
        if (processed.managedUsage) {
          await finalizeManagedUsageRequest({
            ...processed.managedUsage,
            outcome: 'failed',
            actualCostCents: 0,
            usage: { reason: 'tool_discovery_failed' },
          }).catch((settlementError) => {
            logger.error(
              {
                event: 'tool_resume_discovery_release_unrecorded',
                error: settlementError,
                userId,
                requestId: processed.requestId,
                runId: claim.checkpoint.runId,
              },
              'Managed tool-resume reservation release could not be persisted',
            );
          });
        }
        await releaseClaim(db, userId, claim);
        throw error;
      }
    })();

  if (processed.managedUsage) {
    try {
      await markManagedUsageProviderStarted(processed.managedUsage);
    } catch (error) {
      await finalizeManagedUsageRequest({
        ...processed.managedUsage,
        outcome: 'failed',
        actualCostCents: 0,
        usage: { reason: 'provider_start_failed' },
      }).catch(() => undefined);
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

  const { mcpTools, permissions: connectorPermissions } = discovery;

  const blockedToolCallIds = new Set(
    claim.checkpoint.pendingToolCalls
      .filter((call) => connectorPermissions.isDenied(call.qualifiedName))
      .map((call) => call.id),
  );
  const enforcedApprovals = claim.approvals.map((approval) =>
    approval.decision === 'approved' && blockedToolCallIds.has(approval.toolCallId)
      ? { ...approval, decision: 'rejected' as const }
      : approval,
  );
  if (blockedToolCallIds.size > 0) {
    logger.warn(
      {
        userId,
        runId: claim.checkpoint.runId,
        blockedToolCalls: blockedToolCallIds.size,
      },
      'Tool approval overridden: the resumed tool is blocked by the user permission store',
    );
  }

  const toolApprovalPolicy = await loadToolApprovalPolicy(db, userId);

  // Transport, not authorization. Every gate above still stands, auth, managed
  // compute, organization policy, spend limit, the tenant-scoped checkpoint
  // claim, and the connector-permission override applied to `enforcedApprovals`
  //, and none of them are reachable from here. What changed (AGI-39) is that a
  // Workflow-platform outage, or an engaged AGI_DURABLE_INITIAL_TURNS
  // kill-switch, no longer turns an authorized approval into a 503: the same
  // resume runs request-scoped instead, and only detachability is lost.
  let turn;
  try {
    turn = await runCloudAgentTurn({
      db,
      runId: claim.checkpoint.runId,
      userId,
      processed,
      mcpTools,
      approvalMode: 'manual',
      toolApprovalPolicy,
      connectorPermissions,
      onDurableUnavailable: 'inline',
      signal: request.signal,
      completionReason: 'tool_loop_resume_completed',
      cancellationReason: 'client_cancelled_tool_loop_resume',
      hasConnectorTools: mcpTools.some((tool) => tool.origin === 'connector'),
      continuation: {
        eventSessionId: claim.checkpoint.sessionId,
        eventTurnId: claim.checkpoint.turnId,
        initialEventSequence: claim.checkpoint.nextEventSequence,
        initialCompletedSteps: claim.checkpoint.completedSteps,
        invocationContinuation: false,
        resume: {
          approvals: enforcedApprovals,
          ...(resumeFields.guidance ? { guidance: resumeFields.guidance } : {}),
        },
      },
      predecessorApproval: {
        checkpointId: claim.checkpoint.id,
        leaseToken: claim.leaseToken,
      },
    });
  } catch (error) {
    if (processed.managedUsage) {
      await finalizeManagedUsageRequest({
        ...processed.managedUsage,
        outcome: 'failed',
        actualCostCents: 0,
        usage: { reason: 'workflow_start_failed' },
      }).catch(() => undefined);
    }
    await releaseClaim(db, userId, claim);
    // Reaching here now means BOTH transports refused, not merely the durable
    // one -- `onDurableUnavailable: 'inline'` already absorbed a Workflow-platform
    // failure. The lease is released so the approval stays claimable and the user
    // can retry rather than being stranded.
    logger.error(
      { error, userId, requestId: processed.requestId, runId: claim.checkpoint.runId },
      'Approval continuation could not be started on either transport',
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
    'X-AGI-Tool-Loop': 'resume',
    'X-AGI-Agent-Run-Id': claim.checkpoint.runId,
    'X-AGI-Agent-Run-URL': `/api/llm/v1/chat/completions/runs/${encodeURIComponent(
      claim.checkpoint.runId,
    )}`,
    ...getCorsHeaders(request),
    ...getSecurityHeaders(),
  };
  // Only a durable turn has a workflow run to reattach to. Advertising one for a
  // degraded turn would send the client chasing a run that does not exist.
  if (turn.workflowRunId) {
    streamHeaders['X-AGI-Workflow-Run-Id'] = turn.workflowRunId;
  }
  streamHeaders['X-AGI-Agent-Transport'] = turn.transport;
  if (processed.chatRequest.model) {
    streamHeaders['X-AGI-Resolved-Model'] = processed.chatRequest.model;
  }
  if (processed.quotaWarningHeader) {
    streamHeaders['X-Quota-Warning'] = processed.quotaWarningHeader;
  }

  return new NextResponse(turn.readable, { headers: streamHeaders });
}

export const POST = withCorsRoute(withErrorHandler(handleToolApproval));

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}

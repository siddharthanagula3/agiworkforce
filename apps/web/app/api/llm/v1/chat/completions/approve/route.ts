import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { ToolApprovalResumeRequestSchema } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import {
  handleCorsPreflightRequest,
  getSecurityHeaders,
  getCorsHeaders,
  withCorsRoute,
} from '@/lib/cors';
import { buildManagedComputeGateResponse } from '@/lib/managed-compute-gate';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { runAuthGate } from '../lib/auth-gate';
import { processRequest, type ProcessedRequest } from '../lib/request-processor';
import { loadMcpToolDefs } from '../lib/tool-loop';
import { loadUserConnectorToolDefs } from '@/lib/user-connector-tools';
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
import { startCloudAgentWorkflowExecution } from '@/lib/workflows/start-cloud-agent-workflow';

/**
 * Resume a suspended managed agent from tenant-owned server state.
 *
 * The client sends only a run id and explicit decisions. Model selection,
 * transcript, signed thinking continuity, tool names/arguments, and the event
 * cursor are loaded from the durable checkpoint and revalidated under the
 * caller's current subscription before any tool side effect occurs.
 */

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
    // AUDIT-FIX AGT-3: an aged-out approval is gone for a reason the user can
    // act on, so say so instead of reporting it as never having existed.
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
    !subscription || !subscription.plan_tier || subscription.plan_tier.toLowerCase() === 'free';
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

  // Re-run current auth, model, tier, quota, and billing policy against a
  // server-built request. Stale entitlements fail without consuming the lease.
  const processResult = await processRequest(buildSyntheticRequest(request, claim), authResult);
  if (!processResult.ok) {
    await releaseClaim(db, userId, claim);
    return processResult.response;
  }
  const processed: ProcessedRequest = processResult;

  // Restore internal-only signed thinking blocks after public request parsing.
  processed.llmRequest.messages = claim.checkpoint.messages;

  const mcpTools = await (async () => {
    try {
      const [operatorTools, connectorTools] = await Promise.all([
        loadMcpToolDefs(),
        loadUserConnectorToolDefs(userId, {
          customConnectorLimit: getCustomRemoteMcpLimit(processed.subscriptionTier) ?? undefined,
        }),
      ]);
      return [...operatorTools, ...connectorTools];
    } catch (error) {
      // No provider or tool side effect has started yet, so this exact lease
      // is safe to return to pending. Without the release, a transient MCP or
      // connector-discovery outage permanently strands the approval card.
      // The admission pass may already have reserved paid usage, so release
      // that reservation explicitly instead of waiting for reconciliation.
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

  let workflow;
  try {
    workflow = await startCloudAgentWorkflowExecution({
      db,
      runId: claim.checkpoint.runId,
      userId,
      processed,
      mcpTools,
      approvalMode: 'manual',
      continuation: {
        eventSessionId: claim.checkpoint.sessionId,
        eventTurnId: claim.checkpoint.turnId,
        initialEventSequence: claim.checkpoint.nextEventSequence,
        initialCompletedSteps: claim.checkpoint.completedSteps,
        invocationContinuation: false,
        resume: { approvals: claim.approvals },
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
    logger.error(
      { error, userId, requestId: processed.requestId, runId: claim.checkpoint.runId },
      'Durable approval continuation could not be started',
    );
    return NextResponse.json(
      {
        error: {
          message: 'Durable agent continuation is temporarily unavailable.',
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
    'X-AGI-Workflow-Run-Id': workflow.workflowRunId,
    'X-AGI-Agent-Run-Id': claim.checkpoint.runId,
    'X-AGI-Agent-Run-URL': `/api/llm/v1/chat/completions/runs/${encodeURIComponent(
      claim.checkpoint.runId,
    )}`,
    ...getCorsHeaders(request),
    ...getSecurityHeaders(),
  };
  if (processed.quotaWarningHeader) {
    streamHeaders['X-Quota-Warning'] = processed.quotaWarningHeader;
  }

  return new NextResponse(workflow.readable, { headers: streamHeaders });
}

export const POST = withCorsRoute(withErrorHandler(handleToolApproval));

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}

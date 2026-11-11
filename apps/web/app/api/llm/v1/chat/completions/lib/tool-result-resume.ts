import 'server-only';
import {
  CONTEXT_POLICY_SNAPSHOT_KEY,
  CONTEXT_POLICY_RESTART_CODE,
  CONTEXT_POLICY_RESTART_MESSAGE,
  ContextPolicySnapshotSchema,
  contextPolicySnapshotIsCurrent,
} from '@/lib/services/context-policy-snapshot';

import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';
import { isFreeBillingPlanTier } from '@agiworkforce/types';
import { handleCorsPreflightRequest, getSecurityHeaders, getCorsHeaders } from '@/lib/cors';
import {
  buildManagedComputeGateResponse,
  buildOrganizationPolicyGateResponse,
  buildSpendLimitGateResponse,
  resolveWorkspaceControlsForRequest,
} from '@/lib/managed-compute-gate';
import { resolveAuthenticatedSurface } from './request-surface';
import { logger } from '@/lib/logger';
import type { getUserScopedDb } from '@/lib/server/rls-db';
import type { AuthGateSuccess } from './auth-gate';
import { withManagedTurnSlot } from './turn-slot';
import { processRequest, type ProcessedRequest } from './request-processor';
import { loadMcpToolDefs, type ResumeApproval } from './tool-loop';
import { loadUserConnectorToolDefs } from '@/lib/user-connector-tools';
import { connectorsAllowedForTurn } from '@/lib/connectors/connector-capability';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import {
  ManagedUsageRequestError,
  finalizeManagedUsageRequest,
  markManagedUsageProviderStarted,
} from '@/lib/services/managed-usage-request-service';
import { getCustomRemoteMcpLimit } from '@/lib/services/free-plan-entitlements';
import type { CloudAgentApprovalCheckpoint } from '@/lib/services/cloud-agent-run-service';
import { runCloudAgentTurn } from '@/lib/workflows/start-cloud-agent-workflow';
import { boundDurableTurnStream } from '@/lib/workflows/durable-stream-bounds';
import { SSE_RESPONSE_HEADERS, withSseHeartbeat } from './sse-heartbeat';
import { addProjectSourcesHeader } from '@/lib/chat-project-sources';
import {
  loadConnectorToolPermissions,
  type ConnectorToolPermissions,
  scopeConnectorPermissionsToTurn,
} from './connector-tool-permissions';
import { managedConversationGrantScope } from './connector-tool-session-grants';
import { hostedToolRunsUnasked, loadToolApprovalPolicy } from './tool-approval-policy';
import { substituteGatedWebSearchTool } from '@/lib/web-search/required-search';
import { WEB_SEARCH_TOOL, webSearchBackendConfigured } from '@/lib/web-search/web-search-tool';
import {
  checkpointRequestForResume,
  checkpointTurnToolProhibition,
  restoreCheckpointedTurn,
} from './approval-checkpoint-request';

export interface ToolResultResumeClaim {
  checkpoint: CloudAgentApprovalCheckpoint;
  leaseToken: string;
}

export function toolResultResumeError(
  message: string,
  status: number,
  code = 'tool_result_invalid',
): NextResponse {
  return NextResponse.json(
    { error: { message, type: 'invalid_request_error', code } },
    { status, headers: getSecurityHeaders() },
  );
}

function publicCheckpointMessages(
  messages: ToolResultResumeClaim['checkpoint']['messages'],
): Array<Record<string, unknown>> {
  return messages.map(({ __canonicalThinking: _private, ...message }) => message);
}

function buildSyntheticRequest(
  request: NextRequest,
  claim: ToolResultResumeClaim,
  isFreeTierRequest: boolean,
): NextRequest {
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  if (!headers.has('idempotency-key')) headers.set('idempotency-key', randomUUID());
  return new NextRequest(request.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...checkpointRequestForResume(claim.checkpoint.request, isFreeTierRequest),
      messages: publicCheckpointMessages(claim.checkpoint.messages),
      stream: true,
    }),
  });
}

export async function admitToolResultResume(
  request: NextRequest,
  authResult: AuthGateSuccess,
  action: () => Promise<NextResponse | Response>,
): Promise<NextResponse | Response> {
  return withManagedTurnSlot(
    { userId: authResult.userId, planTier: authResult.subscription.plan_tier },
    async () => {
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
          surface: resolveAuthenticatedSurface(request, authResult),
        },
        getSecurityHeaders(),
      );
      if (policyGateResponse) return policyGateResponse;

      // The workspace budget, checked before any credit is reserved so a turn a
      // spend cap will refuse never spends anything first.
      const spendGateResponse = await buildSpendLimitGateResponse(userId);
      if (spendGateResponse) return spendGateResponse;

      return action();
    },
  );
}

export async function continueToolResultResume(input: {
  request: NextRequest;
  authResult: AuthGateSuccess;
  db: Awaited<ReturnType<typeof getUserScopedDb>>['db'];
  organizationId: string | null;
  claim: ToolResultResumeClaim;
  resume: ResumeApproval;
  kind: 'device' | 'caller';
  release: () => Promise<void>;
}): Promise<NextResponse> {
  const { request, authResult, db, organizationId, claim, resume, kind } = input;
  const { userId, subscription } = authResult;
  const isFreeTierRequest =
    !subscription ||
    !subscription.plan_tier ||
    isFreeBillingPlanTier(subscription.plan_tier.toLowerCase());
  let started = false;
  try {
    // The resumed step runs under the same workspace controls as the turn it
    // continues, so a feature the administrator switched off stays off on resume.
    const workspaceControls = await resolveWorkspaceControlsForRequest(
      userId,
      request,
      getSecurityHeaders(),
    );
    if (!workspaceControls.ok) {
      return workspaceControls.response;
    }
    const savedContextPolicy = ContextPolicySnapshotSchema.safeParse(
      claim.checkpoint.request[CONTEXT_POLICY_SNAPSHOT_KEY],
    );
    if (
      !savedContextPolicy.success ||
      !(await contextPolicySnapshotIsCurrent(db, userId, organizationId, savedContextPolicy.data))
    ) {
      return toolResultResumeError(
        CONTEXT_POLICY_RESTART_MESSAGE,
        409,
        CONTEXT_POLICY_RESTART_CODE,
      );
    }
    const processResult = await processRequest(
      buildSyntheticRequest(request, claim, isFreeTierRequest),
      authResult,
      {
        workspaceControls: workspaceControls.controls,
        turnToolProhibition: checkpointTurnToolProhibition(claim.checkpoint.request),
        contextPolicySnapshot: savedContextPolicy.data,
      },
    );
    if (!processResult.ok) {
      return processResult.response;
    }
    const processed: ProcessedRequest = processResult;

    restoreCheckpointedTurn(processed, claim.checkpoint);

    const discovery: { mcpTools: WebMcpToolDef[]; permissions: ConnectorToolPermissions } =
      await (async () => {
        try {
          const permissions = scopeConnectorPermissionsToTurn(
            await loadConnectorToolPermissions(
              db,
              userId,
              processed.organizationId ?? null,
              managedConversationGrantScope(
                processed.conversationId,
                processed.conversationIsTemporary === true,
              ),
            ),
            {
              temporary: processed.conversationIsTemporary === true,
              disabledConnectorIds: processed.chatRequest.disabled_connector_ids,
            },
          );
          const connectorsAllowed =
            processed.chatRequest.connector_tools_enabled !== false &&
            (await connectorsAllowedForTurn(request, userId, {
              ...processed,
              allowSelective: !processed.agentTurn,
            }));
          const [operatorTools, connectorTools] = await Promise.all([
            loadMcpToolDefs(),
            connectorsAllowed
              ? loadUserConnectorToolDefs(userId, {
                  customConnectorLimit:
                    getCustomRemoteMcpLimit(processed.subscriptionTier) ?? undefined,
                  planTier: processed.subscriptionTier,
                  organizationId: processed.organizationId,
                  allowSelective: !processed.agentTurn,
                  isToolDenied: permissions.isConnectorToolDenied,
                  isConnectorDenied: permissions.isConnectorDenied,
                  googleUserDataRouted: processed.googleUserData === true,
                })
              : Promise.resolve([]),
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
                  event: `${kind}_resume_discovery_release_unrecorded`,
                  error: settlementError,
                  userId,
                  requestId: processed.requestId,
                  runId: claim.checkpoint.runId,
                },
                'Managed tool-result reservation release could not be persisted',
              );
            });
          }

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
    const toolApprovalPolicy =
      processed.toolApprovalPolicy ?? (await loadToolApprovalPolicy(db, userId));
    processed.llmRequest.tools = substituteGatedWebSearchTool(processed.llmRequest.tools, {
      approvalRequired: !hostedToolRunsUnasked(
        toolApprovalPolicy,
        WEB_SEARCH_TOOL,
        processed.toolLockdown === true,
      ),
      genericBackendConfigured: webSearchBackendConfigured(),
    });

    // Transport, not authorization. Every gate above still stands, auth, managed
    // compute, organization policy, spend limit, and the tenant-scoped checkpoint
    // claim that proves this user owns the paused run and that this device is the
    // one it was issued to. A Workflow-platform outage degrades the resume to a
    // request-scoped turn rather than stranding a step the device already ran.
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
        completionReason: `tool_loop_${kind}_resume_completed`,
        cancellationReason: `client_cancelled_tool_loop_${kind}_resume`,
        hasConnectorTools: mcpTools.some((tool) => tool.origin === 'connector'),
        continuation: {
          eventSessionId: claim.checkpoint.sessionId,
          eventTurnId: claim.checkpoint.turnId,
          initialEventSequence: claim.checkpoint.nextEventSequence,
          initialCompletedSteps: claim.checkpoint.completedSteps,
          invocationContinuation: false,
          resume,
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

      logger.error(
        { error, userId, requestId: processed.requestId, runId: claim.checkpoint.runId },
        'Tool-result continuation could not be started on either transport',
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

    started = true;

    const streamHeaders: Record<string, string> = {
      ...SSE_RESPONSE_HEADERS,
      'X-AGI-Tool-Loop': `resume-${kind}`,
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
    addProjectSourcesHeader(streamHeaders, processed);

    const body =
      turn.transport === 'durable' && turn.workflowRunId
        ? boundDurableTurnStream({
            readable: turn.readable,
            db,
            userId,
            runId: claim.checkpoint.runId,
            workflowRunId: turn.workflowRunId,
            requestId: processed.requestId,
          })
        : turn.readable;

    return new NextResponse(withSseHeartbeat(body), { headers: streamHeaders });
  } finally {
    if (!started) await input.release();
  }
}

export function toolResultResumeOptions(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}

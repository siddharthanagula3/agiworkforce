import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { DeviceStepResumeRequestSchema } from '@agiworkforce/cloud-contracts';
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
import { runAuthGate, type AuthGateSuccess } from '../lib/auth-gate';
import { withManagedTurnSlot } from '../lib/turn-slot';
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
  claimCloudAgentDeviceCheckpoint,
  releaseCloudAgentDeviceCheckpoint,
  CloudAgentApprovalCheckpointConflictError,
  CloudAgentApprovalCheckpointExpiredError,
  CloudAgentApprovalCheckpointNotFoundError,
  CloudAgentDeviceMismatchError,
  CloudAgentDeviceStepResultError,
  type ClaimedCloudAgentDeviceCheckpoint,
} from '@/lib/services/cloud-agent-run-service';
import { runCloudAgentTurn } from '@/lib/workflows/start-cloud-agent-workflow';
import { boundDurableTurnStream } from '@/lib/workflows/durable-stream-bounds';
import { withSseHeartbeat } from '../lib/sse-heartbeat';
import { addProjectSourcesHeader } from '@/lib/chat-project-sources';
import {
  loadConnectorToolPermissions,
  type ConnectorToolPermissions,
} from '../lib/connector-tool-permissions';
import { loadToolApprovalPolicy } from '../lib/tool-approval-policy';
import { applySecretHandlingToTexts } from '../lib/secret-handling-gate';

const SECRET_IN_RESULT_MESSAGE =
  'This device result was blocked because it appears to contain a secret, such as an API key or access token.';

// Same tool loop as route.ts, same limit; a literal because Next reads it statically.
export const maxDuration = 300;

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json(
    { error: { message, type: 'invalid_request_error', code: 'device_step_invalid' } },
    { status, headers: getSecurityHeaders() },
  );
}

function publicCheckpointMessages(
  messages: ClaimedCloudAgentDeviceCheckpoint['checkpoint']['messages'],
): Array<Record<string, unknown>> {
  return messages.map(({ __canonicalThinking: _private, ...message }) => message);
}

function buildSyntheticRequest(
  request: NextRequest,
  claim: ClaimedCloudAgentDeviceCheckpoint,
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
  claim: ClaimedCloudAgentDeviceCheckpoint,
): Promise<void> {
  await releaseCloudAgentDeviceCheckpoint(db, {
    userId,
    runId: claim.checkpoint.runId,
    checkpointId: claim.checkpoint.id,
    leaseToken: claim.leaseToken,
  }).catch((error) => {
    logger.error(
      { error, userId, runId: claim.checkpoint.runId },
      'Cloud agent device lease could not be released',
    );
  });
}

function checkpointError(error: unknown): NextResponse | null {
  if (error instanceof CloudAgentDeviceStepResultError) {
    return jsonError('Device results do not match the paused device step.', 400);
  }
  if (error instanceof CloudAgentDeviceMismatchError) {
    return jsonError('This step is waiting on a different device.', 409);
  }
  if (error instanceof CloudAgentApprovalCheckpointExpiredError) {
    return jsonError('This device step expired. Ask again on that device.', 410);
  }
  if (error instanceof CloudAgentApprovalCheckpointNotFoundError) {
    return jsonError('Pending device step not found.', 404);
  }
  if (error instanceof CloudAgentApprovalCheckpointConflictError) {
    return jsonError('This device step is already being resumed.', 409);
  }
  return null;
}

async function handleDeviceStepResume(request: NextRequest, authResult: AuthGateSuccess) {
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

  // The workspace budget, checked before any credit is reserved so a turn a
  // spend cap will refuse never spends anything first.
  const spendGateResponse = await buildSpendLimitGateResponse(userId);
  if (spendGateResponse) return spendGateResponse;

  let resumeFields;
  try {
    const parsed = DeviceStepResumeRequestSchema.safeParse(await request.json());
    if (!parsed.success) return jsonError('Invalid device step resume request.', 400);
    resumeFields = parsed.data;
  } catch {
    return jsonError('Invalid JSON in device step resume request.', 400);
  }

  // What the device read becomes the model's next tool result, so it goes
  // through the same secret gate the message array does rather than around it.
  const resultGate = await applySecretHandlingToTexts(
    userId,
    resumeFields.device_results.map((entry) => entry.content),
  );
  if (resultGate.action === 'blocked') {
    return jsonError(SECRET_IN_RESULT_MESSAGE, 400);
  }
  const gatedResults = resumeFields.device_results.map((entry, index) => ({
    toolCallId: entry.tool_call_id,
    content: resultGate.texts[index] ?? entry.content,
    isError: entry.is_error,
    ...(entry.image
      ? { image: { base64: entry.image.base64, mimeType: entry.image.mime_type } }
      : {}),
  }));

  const { db } = await getUserScopedDb(request);
  let claim: ClaimedCloudAgentDeviceCheckpoint;
  try {
    claim = await claimCloudAgentDeviceCheckpoint(db, {
      userId,
      runId: resumeFields.run_id,
      deviceId: resumeFields.device_id,
      results: gatedResults,
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
                event: 'device_resume_discovery_release_unrecorded',
                error: settlementError,
                userId,
                requestId: processed.requestId,
                runId: claim.checkpoint.runId,
              },
              'Managed device-resume reservation release could not be persisted',
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
  const toolApprovalPolicy = await loadToolApprovalPolicy(db, userId);

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
      completionReason: 'tool_loop_device_resume_completed',
      cancellationReason: 'client_cancelled_tool_loop_device_resume',
      hasConnectorTools: mcpTools.some((tool) => tool.origin === 'connector'),
      continuation: {
        eventSessionId: claim.checkpoint.sessionId,
        eventTurnId: claim.checkpoint.turnId,
        initialEventSequence: claim.checkpoint.nextEventSequence,
        initialCompletedSteps: claim.checkpoint.completedSteps,
        invocationContinuation: false,
        resume: { deviceResults: claim.results },
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
      'Device continuation could not be started on either transport',
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
    'X-AGI-Tool-Loop': 'resume-device',
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
}

async function admitAndDispatchDeviceResume(
  request: NextRequest,
): Promise<NextResponse | Response> {
  const authResult = await runAuthGate(request);
  if (!authResult.ok) return authResult.response;

  return withManagedTurnSlot(
    { userId: authResult.userId, planTier: authResult.subscription.plan_tier },
    () => handleDeviceStepResume(request, authResult),
  );
}

export const POST = withCorsRoute(withErrorHandler(admitAndDispatchDeviceResume));

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}

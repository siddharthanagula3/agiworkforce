import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import {
  handleCorsPreflightRequest,
  getSecurityHeaders,
  getCorsHeaders,
  withCorsRoute,
} from '@/lib/cors';
import { addFallbackReasonHeader } from '@/lib/chat-fallback-reason';
import { addSecretRedactionNoticeHeader } from '@/lib/chat-secret-redaction-notice';
import { addRouteLaneHeader } from '@/lib/services/free-lane/plan';
import { observeFreeLaneAttemptFailure } from '@/lib/services/free-lane/runtime-state-service';
import {
  buildManagedComputeGateResponse,
  buildOrganizationPolicyGateResponse,
  buildSpendLimitGateResponse,
} from '@/lib/managed-compute-gate';
import { resolveAuthenticatedSurface } from './lib/request-surface';
import { runAuthGate, type AuthGateSuccess } from './lib/auth-gate';
// GOV-3: per-plan concurrent-turn admission (see handleChatCompletions).
import { acquireManagedTurnSlot, type ManagedTurnSlotResult } from '@/lib/rate-limit';
import { processRequest, type ProcessedRequest } from './lib/request-processor';
import { applySecretHandlingToRequest } from './lib/secret-handling-gate';
import { buildAdapterStreamResponse } from './lib/stream-transform';
import { buildNonStreamResponse, buildUpstreamErrorResponse } from './lib/response-builder';
import { runToolLoop, loadMcpToolDefs } from './lib/tool-loop';
// GOV-7: the catalog form reports which connectors the per-plan ceiling
// truncated, so the client can say so instead of the tools just vanishing.
import {
  loadUserConnectorToolCatalog,
  makeUserConnectorExecutor,
} from '@/lib/user-connector-tools';
import { runResearchLoop } from './lib/research-loop';
import { saveResearchReport } from '@/lib/services/research-report-service';
import { buildManagedAgentStream } from './lib/managed-agent-stream';
import { buildApprovalCheckpointRequest } from './lib/approval-checkpoint-request';
import { classifyToolLoopInputs } from './lib/tool-loop-routing';
import { createObservedProviderUsage } from '@/lib/services/managed-usage-accounting-service';
import { startProviderStream } from './lib/adapter-factory';
import { ADAPTER_PROVIDERS } from './lib/adapter-providers';
import { drainToLlmResponse } from './lib/adapter-response';
import { createFailoverPlan } from './lib/managed-failover';
import { buildCpstUsageFields } from '@/lib/cpst-telemetry';
import { withSseHeartbeat } from './lib/sse-heartbeat';
import { startCloudAgentWorkflowExecution } from '@/lib/workflows/start-cloud-agent-workflow';
import {
  claimLiveDurableStream,
  isDurableTransportCoolingDown,
} from '@/lib/workflows/durable-stream-liveness';

class DurableStreamStalledError extends Error {
  constructor() {
    super('Durable workflow stream produced no first event before the liveness timeout');
    this.name = 'DurableStreamStalledError';
  }
}
import { CloudAgentWorkflowBillingUnavailableError } from '@/lib/workflows/cloud-agent-workflow-input';
import { areDurableInitialTurnsEnabled } from '@/lib/workflows/durable-initial-turns';
import {
  loadConnectorToolPermissions,
  withDisabledConnectorIds,
  EMPTY_CONNECTOR_TOOL_PERMISSIONS,
} from './lib/connector-tool-permissions';
import { loadToolApprovalPolicy } from './lib/tool-approval-policy';
import { DEFAULT_TOOL_APPROVAL_POLICY } from '@shared/types/toolApprovalPolicy';
import type { StreamChunk } from '@agiworkforce/types';
import { getModelMetadataById } from '@agiworkforce/types';
import {
  ManagedUsageRequestError,
  finalizeManagedUsageRequest,
  markManagedUsageProviderStarted,
} from '@/lib/services/managed-usage-request-service';
import { getCustomRemoteMcpLimit } from '@/lib/services/free-plan-entitlements';
import {
  createCloudAgentRun,
  findActiveCloudAgentRunForConversation,
  isCloudAgentRunCancellationRequested,
  saveCloudAgentApprovalCheckpoint,
  saveCloudAgentInputCheckpoint,
} from '@/lib/services/cloud-agent-run-service';
import type {
  CloudAgentOriginSurface,
  CloudAgentRun,
  CloudAgentWorkMode,
} from '@agiworkforce/cloud-contracts';
import { getUserScopedDb } from '@/lib/server/rls-db';
import type { CloudChatSurface } from '@/lib/free-chat-surface-policy';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { recordManagedAutoMemoryTurn } from '@/lib/services/managed-auto-memory-service';
import { settleFreeTrialRequest } from '@/lib/services/free-trial-service';

/** Current Vercel Hobby maximum for the request-scoped managed agent stream. */
export const maxDuration = 300;

async function refundFailedReservation(
  userId: string,
  processed: ProcessedRequest,
  reason: 'streaming_failure' | 'request_failure',
): Promise<void> {
  if (processed.freeTrial) {
    await settleFreeTrialRequest({
      reservation: processed.freeTrial,
      outcome: 'failed',
    });
    return;
  }

  if (processed.managedUsage) {
    try {
      await finalizeManagedUsageRequest({
        ...processed.managedUsage,
        outcome: 'failed',
        actualCostCents: 0,
        // CPST Stage-0 telemetry, MANAGED CLOUD ONLY
        // (docs/architecture/execution-plan-contract.md §4.3).
        // This is the one unambiguous terminal failure signal on the web path:
        // the attempt died and its reservation is being released, so the task
        // did not succeed. Additive keys only; the release contract itself is
        // untouched.
        usage: { reason, ...buildCpstUsageFields(processed, { billingOutcome: 'failed' }) },
      });
    } catch (settlementError) {
      logger.error(
        {
          event: 'managed_chat_release_unrecorded',
          error: settlementError,
          userId,
          requestId: processed.requestId,
        },
        'Managed chat reservation release could not be persisted',
      );
    }
    return;
  }

  throw new ManagedUsageRequestError(
    'Managed usage reservation is missing.',
    503,
    'billing_protocol_error',
  );
}

function resolveAgentOriginSurface(surface: CloudChatSurface): CloudAgentOriginSurface {
  return surface === 'unknown' ? 'api' : surface;
}

async function beginCloudAgentRun(
  request: NextRequest,
  userId: string,
  processed: ProcessedRequest,
  workMode: CloudAgentWorkMode,
): Promise<{ run: CloudAgentRun; db: DatabaseAdapter } | NextResponse> {
  try {
    const db = processed.managedUsage?.db ?? (await getUserScopedDb(request)).db;

    // Concurrency guard: a conversation may have only one active (billable) run
    // at a time. A new turn arriving while a prior run is still running/queued
    // (and not already cancelling) would otherwise silently spawn a second
    // parallel paid run. Reject with 409 so the client stops the prior turn
    // first. Same-request retries and cooperatively-cancelling runs are excluded
    // by the service query, so an idempotent replay or a stop-then-send
    // follow-up is never blocked.
    if (processed.conversationId) {
      const activeRun = await findActiveCloudAgentRunForConversation(db, {
        userId,
        conversationId: processed.conversationId,
        excludeRequestId: processed.requestId,
      });
      if (activeRun) {
        await refundFailedReservation(userId, processed, 'request_failure');
        const conflictHeaders: Record<string, string> = { ...getSecurityHeaders() };
        addAgentRunHeaders(conflictHeaders, activeRun);
        return NextResponse.json(
          {
            error: {
              message:
                'This conversation already has a response in progress. Stop it before sending a new message.',
              type: 'invalid_request_error',
              code: 'conversation_run_in_progress',
              run_id: activeRun.id,
            },
          },
          { status: 409, headers: conflictHeaders },
        );
      }
    }

    const run = await createCloudAgentRun(db, {
      userId,
      requestId: processed.requestId,
      ...(processed.conversationId ? { conversationId: processed.conversationId } : {}),
      originSurface: resolveAgentOriginSurface(processed.chatSurface),
      workMode,
      provider: processed.provider,
      model: processed.chatRequest.model,
    });
    return { run, db };
  } catch (error) {
    logger.error(
      { error, userId, requestId: processed.requestId },
      'Cloud agent run could not be durably created',
    );
    await refundFailedReservation(userId, processed, 'request_failure');
    return NextResponse.json(
      {
        error: {
          message: 'Managed agent execution is temporarily unavailable.',
          type: 'server_error',
          code: 'agent_run_unavailable',
        },
      },
      { status: 503, headers: getSecurityHeaders() },
    );
  }
}

function addAgentRunHeaders(headers: Record<string, string>, run: CloudAgentRun): void {
  headers['X-AGI-Agent-Run-Id'] = run.id;
  headers['X-AGI-Agent-Run-URL'] =
    `/api/llm/v1/chat/completions/runs/${encodeURIComponent(run.id)}`;
}

async function dispatchChatCompletions(
  request: NextRequest,
  authResult: AuthGateSuccess,
): Promise<NextResponse | Response> {
  const { userId, token, subscription } = authResult;

  // Free-tier (no subscription or plan_tier === 'free') users are on the economy
  // free-trial path. Allow them through the managed-compute gate regardless of the
  // private-beta flag so brand-new users can always chat.
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

  // The workspace administrator's decision, evaluated before `processRequest`
  // so a denied turn never reserves credits it will not spend.
  const policyGateResponse = await buildOrganizationPolicyGateResponse(
    userId,
    request,
    {
      provider: 'managed',
      model: 'chat-completions',
      feature: 'llm_v1_chat_completions',
      surface: resolveAuthenticatedSurface(request, authResult),
    },
    getSecurityHeaders(),
  );
  if (policyGateResponse) return policyGateResponse;

  // The workspace budget, checked before any credit is reserved so a turn
  // that a spend cap will refuse never spends anything first.
  const spendGateResponse = await buildSpendLimitGateResponse(userId, request);
  if (spendGateResponse) return spendGateResponse;

  // 2. Parse body, validate, run classifier, resolve model, quota gate, reserve credits
  const processResult = await processRequest(request, authResult);
  if (!processResult.ok) return processResult.response;

  const processed = processResult;

  const secretHandling = await applySecretHandlingToRequest(userId, request, processed);
  if (secretHandling.action === 'blocked') {
    await refundFailedReservation(userId, processed, 'request_failure');
    return NextResponse.json(
      {
        error: {
          message:
            'This message was blocked because it appears to contain a secret, such as an API key or access token. Remove it and send the message again.',
          type: 'invalid_request_error',
          code: 'secret_detected',
        },
      },
      { status: 400, headers: getSecurityHeaders() },
    );
  }
  if (secretHandling.action === 'redacted') {
    processed.secretRedactionCount = secretHandling.matchCount;
  }

  // Persist the external-side-effect boundary before any provider/tool loop
  // starts. A crash after this point is recovered customer-favorably by 0056;
  // a concurrent retry cannot acquire a second lease.
  if (processed.managedUsage) {
    try {
      await markManagedUsageProviderStarted(processed.managedUsage);
    } catch (error) {
      await refundFailedReservation(userId, processed, 'request_failure');
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

  // 3. Dispatch to provider
  if (processed.chatRequest.stream) {
    // Deep Research path: bounded multi-turn research loop (plan -> search
    // rounds -> cited synthesis). Free requests are rejected in processRequest;
    // this defense-in-depth gate keeps the paid-only contract explicit.
    //
    // EVERY adapter-backed provider takes this path, Anthropic included. The
    // old `provider !== 'anthropic'` exclusion here was written when the loop
    // was believed to consume raw provider SSE ("only normalized by
    // buildStreamResponse"); that stopped being true when `buildToolLoopStream`
    // was generalized off its Anthropic-only origin (restructure Wave 2, task
    // #34). `runResearchLoop` dispatches solely through `buildToolLoopStream`,
    // which reshapes every provider's canonical `StreamChunk`s onto
    // OpenAI-compatible bytes via `OpenAIWireAssembler` using that provider's
    // own `wireMode` -- Anthropic's `legacy-web` mode maps `server-tool-result`
    // (`web_search_tool_result`) to `x_search_results`, `tool-use-*` to
    // `tool_calls`, and `stop_reason: tool_use` to `finish_reason:
    // 'tool_calls'`, which is exactly the shape `collectTurn` consumes.
    // Keeping the exclusion meant Anthropic -- the DEFAULT provider -- lit the
    // same Deep Research badge but silently ran the single-turn fallback: real
    // citations, but no plan card, no process narration, and no persisted
    // report. One badge, two behaviours. Verified end-to-end against the real
    // Anthropic translation pipeline in research-loop.anthropic-wire.test.ts.
    if (processed.researchMode && !processed.freeTrial) {
      const startedRun = await beginCloudAgentRun(request, userId, processed, 'research');
      if (startedRun instanceof NextResponse) return startedRun;
      const { run, db: runDb } = startedRun;
      const researchUsage = createObservedProviderUsage();
      // The research loop can rotate to a managed-failover candidate. Track the
      // view that is actually serving so settlement and attribution price by it,
      // not by the primary that failed.
      let researchServing: ProcessedRequest = processed;
      const researchFailover = createFailoverPlan(processed, {
        signal: request.signal,
        isProviderDispatchable: (candidate) => Boolean(ADAPTER_PROVIDERS[candidate]),
        modelPolicy: processed.modelPolicy ?? null,
        ...(processed.freeLane ? { onAttemptFailure: observeFreeLaneAttemptFailure } : {}),
      });
      const researchGen = runResearchLoop(
        processed,
        { userId, token },
        {
          usage: researchUsage,
          // CAP-045 slice 1: durable report persistence. `runDb` is the same
          // RLS-scoped adapter the run journal uses, so the row is tenant-
          // isolated in the database. Persistence failures are swallowed by the
          // loop (logged, never fatal) -- a storage outage must not destroy a
          // report the user is already reading.
          persistReport: (report) =>
            saveResearchReport(runDb, {
              userId,
              requestId: processed.requestId,
              conversationId: processed.conversationId ?? null,
              model: processed.chatRequest.model,
              provider: processed.provider,
              ...report,
            }),
          // CAP-045 slice 4: retry carries the previous attempt's material.
          // It arrives on the NORMAL request path, so this run reserved and
          // metered exactly like a first attempt -- there is no bypass here.
          ...(processed.researchResume
            ? {
                priorSources: processed.researchResume.sources.map((source) => ({
                  url: source.url,
                  title: source.title ?? source.url,
                  ...(source.snippet ? { snippet: source.snippet } : {}),
                })),
                priorSteps: processed.researchResume.steps,
                approvedPlan: processed.researchResume.approvedSteps,
              }
            : {}),
          // A first attempt shows its plan and waits for Start; the approved
          // plan the client sends back IS that decision, so it searches at once.
          requirePlanApproval: (processed.researchResume?.approvedSteps.length ?? 0) === 0,
          isCancellationRequested: () =>
            isCloudAgentRunCancellationRequested(runDb, { userId, runId: run.id }),
          // AUDIT-FIX BUG-1: a client cancel now aborts the in-flight upstream
          // request instead of billing a full research run nobody sees.
          signal: request.signal,
          failover: {
            next: (error) => {
              const attempt = researchFailover.next(error);
              if (attempt) researchServing = attempt.processed;
              return attempt;
            },
          },
        },
      );
      const researchStream = buildManagedAgentStream({
        generator: researchGen,
        processed,
        usage: researchUsage,
        userId,
        getServingRequest: () => researchServing,
        completionReason: 'research_loop_completed',
        cancellationReason: 'client_cancelled_research_loop',
        runJournal: {
          db: runDb,
          userId,
          runId: run.id,
        },
        onTerminal: (outcome) =>
          recordManagedAutoMemoryTurn({
            db: runDb,
            userId,
            processed,
            outcome,
          }),
      });

      const researchHeaders: Record<string, string> = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-AGI-Research-Loop': 'active',
        ...getCorsHeaders(request),
        ...getSecurityHeaders(),
      };
      addAgentRunHeaders(researchHeaders, run);
      if (processed.chatRequest.model) {
        researchHeaders['X-AGI-Resolved-Model'] = processed.chatRequest.model;
      }
      if (processed.quotaWarningHeader) {
        researchHeaders['X-Quota-Warning'] = processed.quotaWarningHeader;
      }
      addFallbackReasonHeader(researchHeaders, processed);
      addSecretRedactionNoticeHeader(researchHeaders, processed);
      addRouteLaneHeader(researchHeaders, processed);

      // AUDIT-FIX BUG-8: the idle heartbeat was applied inside
      // stream-transform.ts but NOT here -- the research loop goes silent for
      // whole search rounds, so it is the stream that most needs a keepalive
      // and was the one without it. Intermediaries and clients idle-timed out
      // mid-run.
      return new NextResponse(withSseHeartbeat(researchStream), { headers: researchHeaders });
    }

    const modelSupportsTools =
      getModelMetadataById(processed.chatRequest.model)?.capabilities?.tools ?? true;
    // AUDIT-FIX CON-1/CON-2: load the user's saved allow/ask/deny verdicts BEFORE
    // the catalog is built. `deny` tools are dropped from the catalog entirely
    // (so a Blocked tool is never advertised to the model and stops re-surfacing
    // an approval card every turn), and the full verdict map is handed to the
    // tool loop, which enforces it before any execution.
    const toolPolicyDb = modelSupportsTools
      ? (processed.managedUsage?.db ?? (await getUserScopedDb(request)).db)
      : null;
    const connectorPermissions = toolPolicyDb
      ? await loadConnectorToolPermissions(toolPolicyDb, userId)
      : EMPTY_CONNECTOR_TOOL_PERMISSIONS;
    const toolApprovalPolicy = toolPolicyDb
      ? await loadToolApprovalPolicy(toolPolicyDb, userId)
      : DEFAULT_TOOL_APPROVAL_POLICY;
    // Per-conversation connector opt-out: connectors the client switched off
    // for THIS turn only, layered on top of the user's standing allow/ask/deny
    // verdicts. Neither replaces the other -- a connector can be off for one
    // chat while its saved permission stays Allow everywhere else.
    const turnConnectorPermissions = withDisabledConnectorIds(
      connectorPermissions,
      new Set(processed.chatRequest.disabled_connector_ids),
    );
    const [operatorTools, connectorCatalog] = modelSupportsTools
      ? await Promise.all([
          loadMcpToolDefs(),
          loadUserConnectorToolCatalog(userId, {
            customConnectorLimit: getCustomRemoteMcpLimit(processed.subscriptionTier) ?? undefined,
            planTier: processed.subscriptionTier,
            organizationId: processed.organizationId,
            isToolDenied: turnConnectorPermissions.isConnectorToolDenied,
          }),
        ])
      : [[], { tools: [], dropped: [], limit: null }];
    const connectorTools = connectorCatalog.tools;
    const mcpTools = [...operatorTools, ...connectorTools];
    const loopInputs = classifyToolLoopInputs(mcpTools, processed.llmRequest.tools);

    if (loopInputs.shouldRun || processed.chatRequest.work_mode === 'agiwork') {
      const startedRun = await beginCloudAgentRun(
        request,
        userId,
        processed,
        processed.chatRequest.work_mode === 'agiwork' ? 'agiwork' : 'chat',
      );
      if (startedRun instanceof NextResponse) return startedRun;
      const { run, db: runDb } = startedRun;

      const baseAgentHeaders = (): Record<string, string> => {
        const headers: Record<string, string> = {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        };
        addAgentRunHeaders(headers, run);
        if (processed.chatRequest.model) {
          headers['X-AGI-Resolved-Model'] = processed.chatRequest.model;
        }
        if (processed.quotaWarningHeader) {
          headers['X-Quota-Warning'] = processed.quotaWarningHeader;
        }
        addFallbackReasonHeader(headers, processed);
        addSecretRedactionNoticeHeader(headers, processed);
        addRouteLaneHeader(headers, processed);
        // GOV-7: name the connectors whose tools did not fit under this plan's
        // ceiling so the client can surface it. Header-encoded because this is
        // decided before the first SSE frame and applies to the whole turn.
        if (connectorCatalog.dropped.length > 0) {
          headers['X-AGI-Connector-Tools-Dropped'] = JSON.stringify({
            limit: connectorCatalog.limit,
            connectors: connectorCatalog.dropped,
          });
        }
        return headers;
      };

      if (areDurableInitialTurnsEnabled() && !isDurableTransportCoolingDown()) {
        try {
          const workflow = await startCloudAgentWorkflowExecution({
            db: runDb,
            runId: run.id,
            userId,
            processed,
            mcpTools,
            approvalMode: loopInputs.approvalMode,
            toolApprovalPolicy,
            connectorPermissions: turnConnectorPermissions,
          });
          const live = await claimLiveDurableStream(workflow.readable);
          if (!live) {
            await workflow.cancel().catch(() => undefined);
            throw new DurableStreamStalledError();
          }
          const durableHeaders = baseAgentHeaders();
          durableHeaders['X-AGI-Tool-Loop'] = 'durable';
          durableHeaders['X-AGI-Workflow-Run-Id'] = workflow.workflowRunId;
          return new NextResponse(withSseHeartbeat(live), {
            headers: durableHeaders,
          });
        } catch (error) {
          // Degrade, do not fail: the inline path below produces the same SSE
          // wire and the same journal. The turn is merely no longer detachable.
          // A turn with no reservation at all is an ordinary, expected miss, not
          // an incident, so it is not logged at error.
          const unreserved = error instanceof CloudAgentWorkflowBillingUnavailableError;
          const details = { error, userId, requestId: processed.requestId, runId: run.id };
          if (unreserved) {
            logger.debug(details, 'Agent turn carries no reservation; running request-scoped');
          } else {
            logger.error(
              details,
              'Durable initial agent turn could not start; falling back to the request-scoped stream',
            );
          }
        }
      }

      const connectorExecutor =
        connectorTools.length > 0
          ? makeUserConnectorExecutor(userId, processed.organizationId)
          : undefined;
      const toolLoopUsage = createObservedProviderUsage();
      let approvalCheckpointSaved = false;
      // The tool loop can rotate to a managed-failover candidate mid-run; keep
      // the serving view for settlement/attribution.
      let toolLoopServing: ProcessedRequest = processed;
      const toolLoopFailover = createFailoverPlan(processed, {
        signal: request.signal,
        isProviderDispatchable: (candidate) => Boolean(ADAPTER_PROVIDERS[candidate]),
        modelPolicy: processed.modelPolicy ?? null,
        ...(processed.freeLane ? { onAttemptFailure: observeFreeLaneAttemptFailure } : {}),
      });
      const toolLoopGen = runToolLoop(processed, {
        mcpTools,
        approvalMode: loopInputs.approvalMode,
        userId,
        connectorExecutor,
        usage: toolLoopUsage,
        // AUDIT-FIX CON-1: server-side enforcement of the user's saved verdicts,
        // layered with this turn's per-conversation connector opt-out.
        connectorPermissions: turnConnectorPermissions,
        toolApprovalPolicy,
        // AUDIT-FIX BUG-1: a client cancel aborts the in-flight provider call
        // instead of billing a full agentic turn nobody sees.
        signal: request.signal,
        failover: {
          next: (error, context) => {
            const attempt = toolLoopFailover.next(error, context);
            if (attempt) toolLoopServing = attempt.processed;
            return attempt;
          },
        },
        isCancellationRequested: () =>
          isCloudAgentRunCancellationRequested(runDb, { userId, runId: run.id }),
        onApprovalCheckpoint: async (checkpoint) => {
          await saveCloudAgentApprovalCheckpoint(runDb, {
            userId,
            runId: run.id,
            sessionId: checkpoint.sessionId,
            turnId: checkpoint.turnId,
            nextEventSequence: checkpoint.nextEventSequence,
            completedSteps: checkpoint.completedSteps,
            request: buildApprovalCheckpointRequest(processed.chatRequest),
            messages: checkpoint.messages,
            pendingToolCalls: checkpoint.pendingToolCalls,
            events: checkpoint.events,
          });
          approvalCheckpointSaved = true;
        },
        onInputCheckpoint: async (checkpoint) => {
          await saveCloudAgentInputCheckpoint(runDb, {
            userId,
            runId: run.id,
            sessionId: checkpoint.sessionId,
            turnId: checkpoint.turnId,
            nextEventSequence: checkpoint.nextEventSequence,
            completedSteps: checkpoint.completedSteps,
            request: buildApprovalCheckpointRequest(processed.chatRequest),
            messages: checkpoint.messages,
            pendingToolCalls: checkpoint.pendingToolCalls,
            inputRequests: checkpoint.inputRequests,
            requestState: checkpoint.requestState,
            events: checkpoint.events,
          });
          approvalCheckpointSaved = true;
        },
      });

      const agentStream = buildManagedAgentStream({
        generator: toolLoopGen,
        processed,
        usage: toolLoopUsage,
        userId,
        getServingRequest: () => toolLoopServing,
        completionReason: 'tool_loop_completed',
        cancellationReason: 'client_cancelled_tool_loop',
        runJournal: { db: runDb, userId, runId: run.id },
        onTerminal: (outcome) =>
          recordManagedAutoMemoryTurn({
            db: runDb,
            userId,
            processed,
            outcome,
          }),
        preserveAwaitingInputOnCancel: () => approvalCheckpointSaved,
      });

      const streamHeaders = baseAgentHeaders();
      streamHeaders['X-AGI-Tool-Loop'] = 'active';

      // AUDIT-FIX BUG-8: same gap as the research branch -- the agentic stream
      // can sit silent through a 120 s tool call with no keepalive at all.
      return new NextResponse(withSseHeartbeat(agentStream), { headers: streamHeaders });
    }

    // Standard single-turn streaming path (no MCP tools configured).
    const adapterProvider = ADAPTER_PROVIDERS[processed.provider];
    if (adapterProvider) {
      // Captured BEFORE startProviderStream's error-detection peek, which
      // awaits the first StreamChunk -- taking this timestamp any later
      // would measure the peek's own wait, not the real time-to-first-token.
      // See buildAdapterStreamResponse's docstring.
      const streamStartedAt = Date.now();

      const failover = createFailoverPlan(processed, {
        signal: request.signal,
        isProviderDispatchable: (candidate) => Boolean(ADAPTER_PROVIDERS[candidate]),
        modelPolicy: processed.modelPolicy ?? null,
        ...(processed.freeLane ? { onAttemptFailure: observeFreeLaneAttemptFailure } : {}),
      });
      let attemptProcessed: ProcessedRequest = processed;
      let attemptAdapterProvider = adapterProvider;
      for (;;) {
        let chunks: AsyncIterable<StreamChunk>;
        try {
          const adapter = attemptAdapterProvider.buildAdapter(attemptProcessed);
          const chatRequest = attemptAdapterProvider.buildChatRequest(attemptProcessed);
          chunks = await startProviderStream(
            adapter,
            chatRequest,
            request.signal,
            attemptAdapterProvider.mapError,
          );
        } catch (error) {
          const nextAttempt = failover.next(error);
          const nextAdapterProvider = nextAttempt ? ADAPTER_PROVIDERS[nextAttempt.provider] : null;
          if (nextAttempt && nextAdapterProvider) {
            attemptProcessed = nextAttempt.processed;
            attemptAdapterProvider = nextAdapterProvider;
            continue;
          }
          await refundFailedReservation(userId, attemptProcessed, 'streaming_failure');
          return buildUpstreamErrorResponse(
            error,
            attemptProcessed.provider,
            attemptProcessed.chatRequest.model,
            attemptProcessed.requestedModel,
            userId,
            attemptProcessed.requestId,
            'streaming',
          );
        }

        return buildAdapterStreamResponse(
          request,
          chunks,
          attemptProcessed,
          userId,
          token,
          streamStartedAt,
          attemptAdapterProvider.wireMode,
          () =>
            recordManagedAutoMemoryTurn({
              request,
              userId,
              processed: attemptProcessed,
              outcome: 'completed',
            }),
        );
      }
    }

    // `processed.provider` is resolved via `getProviderFromModel`'s catalog
    // lookup + heuristic fallback chain (request-processor.ts), which never
    // produces anything outside the 12 providers in `ADAPTER_PROVIDERS`
    // above -- so this is unreachable in practice, not a live dispatch path.
    // Kept as an explicit, typed failure (refund + normal error response)
    // rather than silently falling through to a removed module, so a future
    // catalog change that somehow produces an unlisted provider id fails
    // loud instead of throwing an unhandled "not a function" at runtime.
    await refundFailedReservation(userId, processed, 'streaming_failure');
    return buildUpstreamErrorResponse(
      new Error(`Provider "${processed.provider}" is not supported.`),
      processed.provider,
      processed.chatRequest.model,
      processed.requestedModel,
      userId,
      processed.requestId,
      'streaming',
    );
  }

  // Non-streaming path
  const nonStreamAdapterProvider = ADAPTER_PROVIDERS[processed.provider];
  if (nonStreamAdapterProvider) {
    // Same managed-failover semantics as the streaming path. Non-streaming
    // drains the ENTIRE provider response before anything reaches the
    // client, so every failure here is pre-first-byte by construction and a
    // failed attempt's partial content is discarded with its drain.
    const failover = createFailoverPlan(processed, {
      signal: request.signal,
      isProviderDispatchable: (candidate) => Boolean(ADAPTER_PROVIDERS[candidate]),
      modelPolicy: processed.modelPolicy ?? null,
      ...(processed.freeLane ? { onAttemptFailure: observeFreeLaneAttemptFailure } : {}),
    });
    let attemptProcessed: ProcessedRequest = processed;
    let attemptAdapterProvider = nonStreamAdapterProvider;
    for (;;) {
      let llmResponse;
      try {
        const adapter = attemptAdapterProvider.buildAdapter(attemptProcessed);
        const chatRequest = attemptAdapterProvider.buildChatRequest(attemptProcessed);
        const chunks = adapter.stream(chatRequest, request.signal);
        llmResponse = await drainToLlmResponse(
          chunks,
          attemptProcessed.llmRequest.model,
          attemptAdapterProvider.mapError,
          attemptAdapterProvider.wireMode,
        );
      } catch (error) {
        const nextAttempt = failover.next(error);
        const nextAdapterProvider = nextAttempt ? ADAPTER_PROVIDERS[nextAttempt.provider] : null;
        if (nextAttempt && nextAdapterProvider) {
          attemptProcessed = nextAttempt.processed;
          attemptAdapterProvider = nextAdapterProvider;
          continue;
        }
        await refundFailedReservation(userId, attemptProcessed, 'request_failure');
        return buildUpstreamErrorResponse(
          error,
          attemptProcessed.provider,
          attemptProcessed.chatRequest.model,
          attemptProcessed.requestedModel,
          userId,
          attemptProcessed.requestId,
          'non-streaming',
        );
      }

      return buildNonStreamResponse(request, llmResponse, attemptProcessed, userId, token, () =>
        recordManagedAutoMemoryTurn({
          request,
          userId,
          processed: attemptProcessed,
          outcome: 'completed',
        }),
      );
    }
  }

  // See the streaming branch's identical comment above: `processed.provider`
  // can never fall outside `ADAPTER_PROVIDERS`, so this is an explicit,
  // typed failure guard, not a live dispatch path.
  await refundFailedReservation(userId, processed, 'request_failure');
  return buildUpstreamErrorResponse(
    new Error(`Provider "${processed.provider}" is not supported.`),
    processed.provider,
    processed.chatRequest.model,
    processed.requestedModel,
    userId,
    processed.requestId,
    'non-streaming',
  );
}

function managedTurnSlotExhaustedResponse(slot: ManagedTurnSlotResult): NextResponse {
  const limit = slot.limit ?? 0;
  const headers: Record<string, string> = { ...getSecurityHeaders() };
  if (slot.limit !== null) headers['X-AGI-Concurrent-Turn-Limit'] = String(slot.limit);
  headers['X-AGI-Concurrent-Turns-Active'] = String(slot.active);

  if (slot.denial === 'limiter-unavailable') {
    return NextResponse.json(
      {
        error: {
          message:
            'We cannot verify your concurrent-response limit right now. Please retry in a moment.',
          type: 'server_error',
          code: 'concurrency_limiter_unavailable',
        },
      },
      { status: 503, headers: { ...headers, 'Retry-After': '30' } },
    );
  }

  return NextResponse.json(
    {
      error: {
        message:
          limit > 0
            ? `Your plan allows ${limit} response${limit === 1 ? '' : 's'} at a time and ${limit === 1 ? 'one is' : 'all of them are'} already running. Stop a running response or wait for it to finish, then send this message again. Upgrading raises this limit.`
            : 'Your plan does not include concurrent managed responses. Upgrade to send this message.',
        type: 'rate_limit_error',
        code: 'concurrent_turn_limit_reached',
        concurrent_turn_limit: slot.limit,
        active_turns: slot.active,
      },
    },
    { status: 429, headers },
  );
}

function attachTurnSlotToStream(
  response: NextResponse | Response,
  release: () => Promise<void>,
): Response {
  const body = response.body;
  if (!body) {
    void release();
    return response;
  }
  const passthrough = new TransformStream<Uint8Array, Uint8Array>();
  void body
    .pipeTo(passthrough.writable)
    .catch(() => {
      // Client aborts and upstream failures are already reported by the
      // stream's own settlement hooks; this pipe only owns the slot.
    })
    .finally(() => {
      void release();
    });
  return new Response(passthrough.readable, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function isEventStreamResponse(response: NextResponse | Response): boolean {
  return (response.headers.get('content-type') ?? '').includes('text/event-stream');
}

async function handleChatCompletions(request: NextRequest): Promise<NextResponse | Response> {
  // 1. Auth + rate-limit + CSRF + subscription gate
  const authResult = await runAuthGate(request);
  if (!authResult.ok) return authResult.response;

  const turnSlot = await acquireManagedTurnSlot({
    userId: authResult.userId,
    planTier: authResult.subscription.plan_tier,
    turnId: crypto.randomUUID(),
  });
  if (!turnSlot.admitted) {
    logger.info(
      {
        userId: authResult.userId,
        planTier: authResult.subscription.plan_tier,
        limit: turnSlot.limit,
        active: turnSlot.active,
      },
      'GOV-3: concurrent-turn ceiling reached; rejecting turn',
    );
    return managedTurnSlotExhaustedResponse(turnSlot);
  }

  const slot = turnSlot.slot;
  const releaseTurnSlot = async (): Promise<void> => {
    await slot?.release();
  };

  let streamOwnsSlot = false;
  try {
    const response = await dispatchChatCompletions(request, authResult);
    if (isEventStreamResponse(response)) {
      // Flag set only AFTER the pipe is installed, so a throw while wrapping
      // still falls through to the `finally` release below.
      const owned = attachTurnSlotToStream(response, releaseTurnSlot);
      streamOwnsSlot = true;
      return owned;
    }
    return response;
  } finally {
    if (!streamOwnsSlot) await releaseTurnSlot();
  }
}

export const POST = withCorsRoute(withErrorHandler(handleChatCompletions));

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}

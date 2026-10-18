import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withAdmittedRateLimitHeaders } from '@/lib/rate-limit-headers';
import { logger } from '@/lib/logger';
import { classifyError } from '@agiworkforce/provider-runtime';
import {
  handleCorsPreflightRequest,
  getSecurityHeaders,
  getCorsHeaders,
  withCorsRoute,
} from '@/lib/cors';
import { addFallbackReasonHeader, addModelEscalationHeaders } from '@/lib/chat-fallback-reason';
import { addSecretRedactionNoticeHeader } from '@/lib/chat-secret-redaction-notice';
import { addAttachmentTruncationHeader } from '@agiworkforce/cloud-contracts';
import { addProjectSourcesHeader } from '@/lib/chat-project-sources';
import { addRouteLaneHeader } from '@/lib/services/free-lane/plan';
import {
  freeQuotaFallbackReplay,
  serveFreeQuotaFallback,
  serveFreeQuotaFirst,
} from '@/lib/services/free-lane/free-quota-fallback';
import {
  observeFreeLaneAttemptFailure,
  recordCredentialCooldownOutcome,
  recordCredentialOutcome,
  recordRouteOutcome,
} from '@/lib/services/free-lane/runtime-state-service';
import { resolveFailoverBreakerView } from './lib/route-breaker';
import { buildServingRouteId } from './lib/tool-loop-anthropic';
import { routeOutcomeClassForCategory, type ResilienceScope } from '@agiworkforce/routing';
import {
  buildManagedComputeGateResponse,
  buildOrganizationPolicyGateResponse,
  resolveWorkspaceControlsForRequest,
  buildSpendLimitGateResponse,
} from '@/lib/managed-compute-gate';
import { resolveAuthenticatedSurface } from './lib/request-surface';
import { runAuthGate, type AuthGateSuccess } from './lib/auth-gate';
import { withManagedTurnSlot } from './lib/turn-slot';
import { processRequest, type ProcessedRequest } from './lib/request-processor';
import {
  applySecretHandlingToRequest,
  applySecretHandlingToTexts,
} from './lib/secret-handling-gate';
import { buildAdapterStreamResponse } from './lib/stream-transform';
import { buildNonStreamResponse, buildUpstreamErrorResponse } from './lib/response-builder';
import { runToolLoop, loadMcpToolDefs } from './lib/tool-loop';
import {
  loadUserConnectorToolCatalog,
  makeUserConnectorExecutor,
} from '@/lib/user-connector-tools';
import { extractUserQuery, runResearchLoop } from './lib/research-loop';
import { searchResearchFileSources } from '@/lib/services/research-file-source-service';
import { buildResearchRunOptions, scopeResearchConnectors } from './lib/research-run-options';
import type { PersistedResearchReport } from '@/lib/services/research-report-service';
import { buildManagedAgentStream } from './lib/managed-agent-stream';
import { buildApprovalCheckpointRequest } from './lib/approval-checkpoint-request';
import { classifyToolLoopInputs } from './lib/tool-loop-routing';
import { createObservedProviderUsage } from '@/lib/services/managed-usage-accounting-service';
import {
  firstTokenDeadlineMs,
  hasFirstTokenBudgetLeft,
  markFirstProviderChunk,
  startProviderStreamWithinTurnDeadlines,
  withProviderDeadlines,
} from './lib/provider-deadlines';
import { recordFailedTurn } from './lib/failed-turn-record';
import { ADAPTER_PROVIDERS } from './lib/adapter-providers';
import { drainToLlmResponse } from './lib/adapter-response';
import { createFailoverPlan, FIRST_PROVIDER_STEP } from './lib/managed-failover';
import { buildCpstUsageFields } from '@/lib/cpst-telemetry';
import { SSE_RESPONSE_HEADERS, withSseHeartbeat } from './lib/sse-heartbeat';
import {
  CHAT_TOOL_LOOP_BUDGET_MS,
  PROVIDER_STREAM_DEADLINE_MS,
  nestedDeadlineMs,
} from '@/lib/deadline-policy';
import { startCloudAgentWorkflowExecution } from '@/lib/workflows/start-cloud-agent-workflow';
import { boundDurableTurnStream } from '@/lib/workflows/durable-stream-bounds';
import {
  claimDurableStreamWithinBudget,
  claimLiveDurableStream,
  isDurableFirstEventBudgetCoolingDown,
  isDurableTransportCoolingDown,
  resolveDurableFirstEventBudgetMs,
  DURABLE_FIRST_EVENT_BUDGET_EVENT,
} from '@/lib/workflows/durable-stream-liveness';

class DurableStreamStalledError extends Error {
  readonly budgetExceeded: boolean;

  constructor(budgetExceeded: boolean) {
    super(
      budgetExceeded
        ? 'Durable workflow stream produced no first event within the chat first-byte budget'
        : 'Durable workflow stream produced no first event before the liveness timeout',
    );
    this.name = 'DurableStreamStalledError';
    this.budgetExceeded = budgetExceeded;
  }
}
import { CloudAgentWorkflowBillingUnavailableError } from '@/lib/workflows/cloud-agent-workflow-input';
import { areDurableInitialTurnsEnabled } from '@/lib/workflows/durable-initial-turns';
import {
  connectorToolNames,
  createCloudAgentToolPermissionGate,
} from '@/lib/workflows/cloud-agent-tool-permission-gate';
import {
  EMPTY_CONNECTOR_TOOL_PERMISSIONS,
  loadConnectorToolPermissions,
  scopeConnectorPermissionsToTurn,
} from './lib/connector-tool-permissions';
import { managedConversationGrantScope } from './lib/connector-tool-session-grants';
import { admitConversationTurn } from './lib/conversation-turn-admission';
import { hostedToolRunsUnasked, loadTurnToolPermissions } from './lib/tool-approval-policy';
import { DEFAULT_TOOL_APPROVAL_POLICY } from '@shared/types/toolApprovalPolicy';
import { substituteGatedWebSearchTool } from '@/lib/web-search/required-search';
import { WEB_SEARCH_TOOL, webSearchBackendConfigured } from '@/lib/web-search/web-search-tool';
import type { StreamChunk } from '@agiworkforce/types';
import { getModelMetadataById, isFreeBillingPlanTier } from '@agiworkforce/types';
import { connectorsAllowedForTurn } from '@/lib/connectors/connector-capability';
import {
  ManagedUsageRequestError,
  finalizeManagedUsageRequest,
  markManagedUsageProviderStarted,
} from '@/lib/services/managed-usage-request-service';
import { getCustomRemoteMcpLimit } from '@/lib/services/free-plan-entitlements';
import {
  findActiveCloudAgentRunForConversation,
  isCloudAgentRunCancellationRequested,
  saveCloudAgentApprovalCheckpoint,
  saveCloudAgentDeviceCheckpoint,
  saveCloudAgentInputCheckpoint,
  takeCloudAgentRunSteers,
} from '@/lib/services/cloud-agent-run-service';
import type {
  CloudAgentOriginSurface,
  CloudAgentRun,
  CloudAgentWorkMode,
} from '@agiworkforce/cloud-contracts';
import { getVerifiedBearerUserScopedDb, type UserScopedDb } from '@/lib/server/rls-db';
import { runWithPhaseTimer, timePhase } from '@/lib/observability/phase-timer';
import { annotateActiveSpan, withSpan } from '@/lib/observability/span';
import { OBSERVABILITY_ATTRIBUTE } from '@/lib/observability/attributes';
import { CHAT_TURN_PHASE, CHAT_TURN_SPAN } from './lib/turn-phases';
import type { CloudChatSurface } from '@/lib/free-chat-surface-policy';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { recordManagedAutoMemoryTurn } from '@/lib/services/managed-auto-memory-service';
import { scheduleToolShortlistShadow } from '@/lib/services/semantic-decisions/consumers/tool-shortlist';
import { lastUserTurnText } from './lib/tool-loop';
import { toolShortlistShadowInput } from './lib/tool-shortlist-shadow';
import { settleFreeTrialRequest } from '@/lib/services/free-trial-service';
import { servedOnIsolatedPromotionCredential } from '@/lib/server/free-model-promotion';

/** Current Vercel Hobby maximum for the request-scoped managed agent stream. */
export const maxDuration = 300;

/**
 * OpenAI-compatible Chat Completions API
 * Endpoint: POST /v1/chat/completions (via api.agiworkforce.com)
 *
 * Routes to 10+ LLM providers based on model. Auth: Clerk JWT. Billing: cloud credits.
 * Service modules: auth-gate | request-processor | stream-transform | response-builder
 *
 * Agentic extension: every AGI Work stream enters the managed tool-loop driver,
 * including turns that begin without an explicit tool. Normal chat enters that
 * loop only when MCP/platform tools are present. Run state and canonical events
 * are journaled durably either way.
 *
 * Transport: a turn that holds a free-tier or managed reservation starts on the Vercel
 * Workflow transport unless the `AGI_DURABLE_INITIAL_TURNS` kill-switch is
 * engaged, so the run outlives the request that started it, the client can
 * disconnect and later reattach through the run journal, and its approvals stay
 * claimable from any surface. An engaged kill-switch, a turn with no reservation and a
 * workflow that fails to start use the request-scoped inline stream, which
 * emits the identical SSE wire.
 * The approval_mode query parameter controls gating: ?approval_mode=auto skips
 * the per-tool prompt; the default 'manual' persists a signed checkpoint before
 * emitting x_tool_approval_request events.
 *
 * Provider dispatch, for the standard (non-agentic) paths below: every provider
 * `processed.provider` can resolve to goes through a `packages/ai/providers/*`
 * adapter listed in `ADAPTER_PROVIDERS` (./lib/adapter-providers.ts); an
 * unlisted provider id is an explicit unsupported-provider failure.
 * The agentic tool-loop path (MCP/E2B, `runToolLoop`) shares the SAME
 * `ADAPTER_PROVIDERS` table via its own table-driven per-step dispatch, see
 * tool-loop-anthropic.ts.
 */

async function refundFailedReservation(
  userId: string,
  processed: ProcessedRequest,
  reason: 'streaming_failure' | 'request_failure',
  errorClass?: string,
): Promise<void> {
  if (processed.freeTrial) {
    await settleFreeTrialRequest({
      reservation: processed.freeTrial,
      outcome: 'failed',
      attempt: { outcome: 'failed', errorClass },
    });
    return;
  }

  if (processed.managedUsage) {
    try {
      await finalizeManagedUsageRequest({
        ...processed.managedUsage,
        outcome: 'failed',
        attempt: { outcome: 'failed', errorClass },
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

const CONVERSATION_RUN_CONFLICT_STATUS = 409;

async function conversationRunConflictResponse(
  userId: string,
  processed: ProcessedRequest,
  activeRun: CloudAgentRun,
): Promise<NextResponse> {
  await refundFailedReservation(
    userId,
    processed,
    'request_failure',
    'conversation_run_in_progress',
  );
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
    { status: CONVERSATION_RUN_CONFLICT_STATUS, headers: conflictHeaders },
  );
}

async function beginCloudAgentRun(
  userId: string,
  processed: ProcessedRequest,
  workMode: CloudAgentWorkMode,
  db: DatabaseAdapter,
): Promise<{ run: CloudAgentRun; db: DatabaseAdapter } | NextResponse> {
  try {
    // Concurrency guard: a conversation may have only one active (billable) run
    // at a time. A new turn arriving while a prior run is still running/queued
    // (and not already cancelling) would otherwise silently spawn a second
    // parallel paid run. Reject with 409 so the client stops the prior turn
    // first. Same-request retries and cooperatively-cancelling runs are excluded
    // by the service query, so an idempotent replay or a stop-then-send
    // follow-up is never blocked. This lookup is the lock-free fast rejection;
    // `admitConversationTurn` re-reads it under a per-conversation advisory lock
    // so two turns that both pass here still produce one run and one 409.
    if (processed.conversationId) {
      const activeRun = await findActiveCloudAgentRunForConversation(db, {
        userId,
        conversationId: processed.conversationId,
        excludeRequestId: processed.requestId,
      });
      if (activeRun) {
        return await conversationRunConflictResponse(userId, processed, activeRun);
      }
    }

    const admission = await admitConversationTurn(db, {
      userId,
      requestId: processed.requestId,
      ...(processed.conversationId ? { conversationId: processed.conversationId } : {}),
      originSurface: resolveAgentOriginSurface(processed.chatSurface),
      workMode,
      provider: processed.provider,
      model: processed.chatRequest.model,
    });
    if (!admission.admitted) {
      return await conversationRunConflictResponse(userId, processed, admission.activeRun);
    }
    return { run: admission.run, db };
  } catch (error) {
    logger.error(
      { error, userId, requestId: processed.requestId },
      'Cloud agent run could not be durably created',
    );
    await refundFailedReservation(userId, processed, 'request_failure', 'agent_run_unavailable');
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

function recordResilienceObservation(observation: {
  scope: ResilienceScope;
  provider: string;
  model: string;
  routeId: string | null;
  category: string;
}): void {
  const outcomeClass = routeOutcomeClassForCategory(observation.category);
  if (!outcomeClass) return;
  const outcome = { class: outcomeClass };
  const persist =
    observation.scope === 'provider'
      ? recordCredentialOutcome(observation.provider, outcome)
      : observation.scope === 'credential'
        ? recordCredentialCooldownOutcome(observation.provider, outcome)
        : recordRouteOutcome(
            observation.routeId ?? buildServingRouteId(observation.provider, observation.model),
            outcome,
          );
  void persist.catch((error: unknown) => {
    logger.warn(
      { error, observation },
      'Managed failover: resilience observation was not recorded',
    );
  });
}

/**
 * The request-scoped turn body, entered only once a concurrency slot
 * has been admitted by `handleChatCompletions` below. Split out so the slot's
 * acquire/release can wrap EVERY exit (return, throw, client abort) in one
 * place instead of being repeated at each of this function's ~10 returns.
 */
async function dispatchChatCompletions(
  request: NextRequest,
  authResult: AuthGateSuccess,
  freeQuotaFirst?: (scopedDb: Promise<UserScopedDb>) => Promise<Response | null>,
): Promise<NextResponse | Response> {
  const { userId, token, subscription } = authResult;

  // Free-tier (no subscription or plan_tier === 'free') users are on the economy
  // free-trial path. Allow them through the managed-compute gate regardless of the
  // private-beta flag so brand-new users can always chat.
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

  const scopedDbPromise = getVerifiedBearerUserScopedDb(request, { userId, token });
  scopedDbPromise.catch(() => {});

  // The workspace administrator's decision, evaluated before `processRequest`
  // so a denied turn never reserves credits it will not spend.
  // Runs with the spend gate, which reads a different row and consults nothing
  // this one decides. The policy verdict is still reported first, so a
  // workspace that blocks a model says so even when the budget is also spent.
  const [policyGateResponse, spendGateResponse, workspaceControls] = await Promise.all([
    timePhase(CHAT_TURN_PHASE.policyGate, () =>
      buildOrganizationPolicyGateResponse(
        userId,
        request,
        {
          provider: 'managed',
          model: 'chat-completions',
          feature: 'llm_v1_chat_completions',
          surface: resolveAuthenticatedSurface(request, authResult),
        },
        getSecurityHeaders(),
      ),
    ),
    // The workspace budget, checked before any credit is reserved so a turn
    // that a spend cap will refuse never spends anything first.
    timePhase(CHAT_TURN_PHASE.spendGate, () => buildSpendLimitGateResponse(userId)),
    timePhase(CHAT_TURN_PHASE.policyGate, () =>
      resolveWorkspaceControlsForRequest(userId, request, getSecurityHeaders()),
    ),
  ]);
  if (policyGateResponse) return policyGateResponse;
  if (spendGateResponse) return spendGateResponse;
  if (!workspaceControls.ok) return workspaceControls.response;

  if (freeQuotaFirst) {
    const answered = await freeQuotaFirst(scopedDbPromise);
    if (answered) return answered;
  }

  // 2. Parse body, validate, run classifier, resolve model, quota gate, reserve credits
  const processResult = await timePhase(CHAT_TURN_PHASE.processRequest, () =>
    processRequest(request, authResult, {
      workspaceControls: workspaceControls.controls,
      scopedDbPromise,
    }),
  );
  if (!processResult.ok) return processResult.response;

  const processed = processResult;
  const requestDb = (await scopedDbPromise).db;
  annotateActiveSpan({
    [OBSERVABILITY_ATTRIBUTE.sessionId]: processed.conversationId,
    [OBSERVABILITY_ATTRIBUTE.turnId]: processed.requestId,
    [OBSERVABILITY_ATTRIBUTE.surface]: processed.chatSurface,
    [OBSERVABILITY_ATTRIBUTE.providerName]: processed.provider,
    [OBSERVABILITY_ATTRIBUTE.requestModel]: processed.chatRequest.model,
  });

  // Read once, before any attempt: the rotation path consults it synchronously.
  const breakers = await resolveFailoverBreakerView(processed);

  const secretHandling = await timePhase(CHAT_TURN_PHASE.secretGate, () =>
    applySecretHandlingToRequest(userId, request, processed),
  );
  if (secretHandling.action === 'blocked') {
    await refundFailedReservation(userId, processed, 'request_failure', 'secret_detected');
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
  if (processed.researchResume?.guidance) {
    const guidanceGate = await applySecretHandlingToTexts(userId, [
      processed.researchResume.guidance,
    ]);
    if (guidanceGate.action === 'blocked') {
      await refundFailedReservation(userId, processed, 'request_failure', 'secret_detected');
      return NextResponse.json(
        {
          error: {
            message:
              'This guidance was blocked because it appears to contain a secret, such as an API key or access token. Remove it and try again.',
            type: 'invalid_request_error',
            code: 'secret_detected',
          },
        },
        { status: 400, headers: getSecurityHeaders() },
      );
    }
    if (guidanceGate.action === 'redacted') {
      processed.researchResume.guidance = guidanceGate.texts[0];
    }
  }

  // Persist the external-side-effect boundary before any provider/tool loop
  // starts. A crash after this point is recovered customer-favorably by 0056;
  // a concurrent retry cannot acquire a second lease.
  const managedUsageToMark = processed.managedUsage;
  if (managedUsageToMark) {
    try {
      await timePhase(CHAT_TURN_PHASE.providerStartMark, () =>
        markManagedUsageProviderStarted(managedUsageToMark),
      );
    } catch (error) {
      const managedError =
        error instanceof ManagedUsageRequestError
          ? error
          : new ManagedUsageRequestError(
              'Managed usage billing is temporarily unavailable.',
              503,
              'billing_unavailable',
            );
      await refundFailedReservation(userId, processed, 'request_failure', managedError.code);
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
    // this defense-in-depth gate keeps the paid-only contract explicit. Every
    // adapter-backed provider takes this path, Anthropic included:
    // `buildToolLoopStream` normalizes each provider's chunks onto the
    // OpenAI-compatible shape `collectTurn` reads.
    if (processed.researchMode && !processed.freeTrial) {
      const startedRun = await beginCloudAgentRun(userId, processed, 'research', requestDb);
      if (startedRun instanceof NextResponse) return startedRun;
      const { run, db: runDb } = startedRun;
      const researchToolApprovalPolicy =
        processed.toolApprovalPolicy ?? DEFAULT_TOOL_APPROVAL_POLICY;
      const researchConnectors = scopeResearchConnectors(
        processed,
        await timePhase(CHAT_TURN_PHASE.toolPermissions, () =>
          loadConnectorToolPermissions(
            requestDb,
            userId,
            processed.organizationId ?? null,
            managedConversationGrantScope(
              processed.conversationId,
              processed.conversationIsTemporary === true,
            ),
          ),
        ),
      );
      const researchConnectorPermissions = researchConnectors.permissions;
      processed.llmRequest.tools = substituteGatedWebSearchTool(processed.llmRequest.tools, {
        approvalRequired: !hostedToolRunsUnasked(
          researchToolApprovalPolicy,
          WEB_SEARCH_TOOL,
          processed.toolLockdown === true,
        ),
        genericBackendConfigured: webSearchBackendConfigured(),
      });
      const researchUsage = createObservedProviderUsage();
      // The research loop can rotate to a managed-failover candidate. Track the
      // view that is actually serving so settlement and attribution price by it,
      // not by the primary that failed.
      let researchServing: ProcessedRequest = processed;
      const researchFailover = createFailoverPlan(processed, {
        signal: request.signal,
        isProviderDispatchable: (candidate) => Boolean(ADAPTER_PROVIDERS[candidate]),
        modelPolicy: processed.modelPolicy ?? null,
        ...breakers,
        onResilienceObservation: recordResilienceObservation,
        ...(processed.freeLane ? { onAttemptFailure: observeFreeLaneAttemptFailure } : {}),
      });
      // §24 sources. The domain policy is what the user chose on the plan card
      // within the workspace's site rules; the loop applies it at ingestion. The
      // file search runs before the loop so a failing index degrades to a
      // web-only run rather than failing the turn.
      const requestedResearchConnectorIds = researchConnectors.connectorIds;
      const researchConnectorIds =
        requestedResearchConnectorIds.length > 0 &&
        (await connectorsAllowedForTurn(request, userId, processed))
          ? requestedResearchConnectorIds
          : [];
      const researchFileSources = processed.researchSources?.files
        ? await searchResearchFileSources(runDb, {
            userId,
            organizationId: processed.organizationId ?? null,
            query: extractUserQuery(processed.llmRequest.messages),
            conversationId: processed.conversationId ?? null,
            googleUserDataRouted: processed.googleUserData === true,
          })
        : [];

      const approvedResearchRun = (processed.researchResume?.approvedSteps.length ?? 0) > 0;
      if (
        approvedResearchRun &&
        areDurableInitialTurnsEnabled() &&
        !(await isDurableTransportCoolingDown())
      ) {
        try {
          const workflow = await timePhase(CHAT_TURN_PHASE.durableStart, () =>
            startCloudAgentWorkflowExecution({
              db: runDb,
              runId: run.id,
              userId,
              processed,
              mcpTools: [],
              approvalMode: 'auto',
              toolApprovalPolicy: researchToolApprovalPolicy,
              connectorPermissions: researchConnectorPermissions,
              research: {
                connectorIds: researchConnectorIds,
                fileSources: researchFileSources,
              },
            }),
          );
          const live = await timePhase(CHAT_TURN_PHASE.durableFirstEvent, () =>
            claimLiveDurableStream(workflow.readable),
          );
          if (!live) {
            await workflow.cancel().catch(() => undefined);
            throw new DurableStreamStalledError(false);
          }
          const durableResearchHeaders: Record<string, string> = {
            ...SSE_RESPONSE_HEADERS,
            'X-AGI-Research-Loop': 'active',
            'X-AGI-Tool-Loop': 'durable',
            'X-AGI-Workflow-Run-Id': workflow.workflowRunId,
            ...getCorsHeaders(request),
            ...getSecurityHeaders(),
          };
          addAgentRunHeaders(durableResearchHeaders, run);
          if (processed.chatRequest.model) {
            durableResearchHeaders['X-AGI-Resolved-Model'] = processed.chatRequest.model;
          }
          if (processed.quotaWarningHeader) {
            durableResearchHeaders['X-Quota-Warning'] = processed.quotaWarningHeader;
          }
          const bounded = boundDurableTurnStream({
            readable: live,
            db: runDb,
            userId,
            runId: run.id,
            workflowRunId: workflow.workflowRunId,
            requestId: processed.requestId,
          });
          return new NextResponse(withSseHeartbeat(bounded), { headers: durableResearchHeaders });
        } catch (error) {
          const unreserved = error instanceof CloudAgentWorkflowBillingUnavailableError;
          const details = { error, userId, requestId: processed.requestId, runId: run.id };
          if (unreserved) {
            logger.debug(details, 'Research run carries no reservation; running request-scoped');
          } else {
            logger.error(
              details,
              'Durable research run could not start; falling back to the request-scoped stream',
            );
          }
        }
      }

      // The report is the turn's durable half; holding the row the loop just
      // stored lets the assistant message carry the same activity rather than
      // depending on a client save that a research turn's metadata can fail.
      let storedResearchReport: PersistedResearchReport | null = null;
      const researchGen = runResearchLoop(
        processed,
        { userId, token },
        {
          usage: researchUsage,
          ...buildResearchRunOptions({
            processed,
            userId,
            runId: run.id,
            db: runDb,
            connectorIds: researchConnectorIds,
            fileSources: researchFileSources,
            connectorPermissions: researchConnectorPermissions,
            toolApprovalPolicy: researchToolApprovalPolicy,
            // A client cancel aborts the in-flight upstream request instead of
            // billing a full research run nobody sees.
            signal: request.signal,
            failover: {
              next: (error) => {
                const attempt = researchFailover.next(error);
                if (attempt) researchServing = attempt.processed;
                return attempt;
              },
            },
            onReportStored: (report) => {
              storedResearchReport = report;
            },
          }),
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
        getResearchReport: () => storedResearchReport,
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
        ...SSE_RESPONSE_HEADERS,
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
      addModelEscalationHeaders(researchHeaders, processed);
      addSecretRedactionNoticeHeader(researchHeaders, processed);
      addAttachmentTruncationHeader(researchHeaders, processed);
      addProjectSourcesHeader(researchHeaders, processed);
      addRouteLaneHeader(researchHeaders, processed);

      // The loop is silent for whole search rounds; without the heartbeat
      // intermediaries idle-time out mid-run.
      return new NextResponse(withSseHeartbeat(researchStream), { headers: researchHeaders });
    }

    // A model whose registry capability `tools` is false cannot take function
    // definitions: the provider rejects the whole request. Such a model gets no
    // MCP or connector tools and takes the single-turn path.
    const modelSupportsTools =
      getModelMetadataById(processed.chatRequest.model)?.capabilities?.tools ?? true;
    const userConnectorToolsEnabled =
      processed.chatRequest.connector_tools_enabled !== false &&
      (processed.connectorsAllowed ?? (await connectorsAllowedForTurn(request, userId, processed)));
    const operatorTools = modelSupportsTools
      ? await timePhase(CHAT_TURN_PHASE.toolCatalog, () => loadMcpToolDefs())
      : [];
    const isAgiWorkTurn = processed.chatRequest.work_mode === 'agiwork';
    const requestOffersTools = (processed.llmRequest.tools?.length ?? 0) > 0;
    const connectorPermissionsRequired =
      modelSupportsTools && (userConnectorToolsEnabled || operatorTools.length > 0);
    const toolApprovalPolicyRequired =
      processed.toolApprovalPolicy === undefined &&
      (connectorPermissionsRequired || requestOffersTools || isAgiWorkTurn);
    // The saved allow/ask/deny verdicts are loaded before the catalog is built:
    // a denied tool is never advertised, and the tool loop enforces the rest.
    // tools:false models read the policy too, because it decides whether the
    // provider-native search below is withdrawn.
    const turnToolPermissions =
      connectorPermissionsRequired || toolApprovalPolicyRequired
        ? await timePhase(CHAT_TURN_PHASE.toolPermissions, async () => {
            return loadTurnToolPermissions(requestDb, userId, {
              conversationId: processed.conversationId,
              temporary: processed.conversationIsTemporary === true,
              organizationId: processed.organizationId ?? null,
              modelSupportsTools,
              connectorPermissionsRequired,
              toolApprovalPolicyRequired,
            });
          })
        : {
            connectorPermissions: EMPTY_CONNECTOR_TOOL_PERMISSIONS,
            toolApprovalPolicy: DEFAULT_TOOL_APPROVAL_POLICY,
          };
    const { connectorPermissions } = turnToolPermissions;
    const toolApprovalPolicy =
      processed.toolApprovalPolicy ?? turnToolPermissions.toolApprovalPolicy;
    // Per-conversation connector opt-out: connectors the client switched off
    // for THIS turn only, layered on top of the user's standing allow/ask/deny
    // verdicts. Neither replaces the other -- a connector can be off for one
    // chat while its saved permission stays Allow everywhere else.
    const turnConnectorPermissions = scopeConnectorPermissionsToTurn(connectorPermissions, {
      temporary: processed.conversationIsTemporary === true,
      disabledConnectorIds: processed.chatRequest.disabled_connector_ids,
    });
    // The connector-tool ceiling is the caller's plan ceiling, and what it drops
    // is reported to the client so a truncated connector does not look broken.
    const connectorCatalog =
      modelSupportsTools && userConnectorToolsEnabled
        ? await timePhase(CHAT_TURN_PHASE.toolCatalog, () =>
            loadUserConnectorToolCatalog(userId, {
              customConnectorLimit:
                getCustomRemoteMcpLimit(processed.subscriptionTier) ?? undefined,
              planTier: processed.subscriptionTier,
              organizationId: processed.organizationId,
              isToolDenied: turnConnectorPermissions.isConnectorToolDenied,
              isConnectorDenied: turnConnectorPermissions.isConnectorDenied,
              ...(processed.healthSpaceProjectId ? { healthSpace: true } : {}),
              googleUserDataRouted: processed.googleUserData === true,
            }),
          )
        : { tools: [], dropped: [], limit: null };
    const connectorTools = connectorCatalog.tools;
    const mcpTools = [...operatorTools, ...connectorTools];

    // Shadow only: the lexical shortlist below still builds the turn, and a
    // tool it defers stays one load_connector_tools call away either way.
    if (processed.decisionScope && mcpTools.length > 0) {
      scheduleToolShortlistShadow(
        toolShortlistShadowInput({
          scope: processed.decisionScope,
          tools: mcpTools,
          turnText: () => lastUserTurnText(processed.chatRequest?.messages),
        }),
      );
    }

    // A provider-native search runs inside the provider's own turn, so it never
    // reaches the tool loop as a call and cannot be gated there. When the
    // account's policy will not auto-approve a search, swap it for our own
    // function tool, which does round-trip and is gated like any other. This
    // has to happen here rather than in `processRequest`: the policy is only
    // known after the read above, and the request was built before it.
    processed.llmRequest.tools = substituteGatedWebSearchTool(processed.llmRequest.tools, {
      approvalRequired: !hostedToolRunsUnasked(
        toolApprovalPolicy,
        WEB_SEARCH_TOOL,
        processed.toolLockdown === true,
      ),
      genericBackendConfigured: webSearchBackendConfigured(),
    });

    const loopInputs = classifyToolLoopInputs(
      mcpTools,
      processed.llmRequest.tools,
      toolApprovalPolicy,
      { requiredNativeSearch: processed.searchEnforcement?.mode === 'nudge' },
    );

    if (loopInputs.shouldRun || isAgiWorkTurn) {
      const startedRun = await timePhase(CHAT_TURN_PHASE.agentRunStart, () =>
        beginCloudAgentRun(userId, processed, isAgiWorkTurn ? 'agiwork' : 'chat', requestDb),
      );
      if (startedRun instanceof NextResponse) return startedRun;
      const { run, db: runDb } = startedRun;

      const baseAgentHeaders = (): Record<string, string> => {
        const headers: Record<string, string> = {
          ...SSE_RESPONSE_HEADERS,
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        };
        addAgentRunHeaders(headers, run);
        // `chatRequest.model` is the model that answered, after routing and
        // fallback; `requestedModel` keeps the caller's pre-routing string.
        if (processed.chatRequest.model) {
          headers['X-AGI-Resolved-Model'] = processed.chatRequest.model;
        }
        if (processed.quotaWarningHeader) {
          headers['X-Quota-Warning'] = processed.quotaWarningHeader;
        }
        addFallbackReasonHeader(headers, processed);
        addModelEscalationHeaders(headers, processed);
        addSecretRedactionNoticeHeader(headers, processed);
        addAttachmentTruncationHeader(headers, processed);
        addProjectSourcesHeader(headers, processed);
        addRouteLaneHeader(headers, processed);
        // Name the connectors whose tools did not fit under this plan's
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

      // A managed turn runs on the Workflow transport so it outlives the
      // request, whatever the tier: the workflow carries the turn's free-tier or
      // managed reservation. Nothing has been generated or streamed yet, so a
      // `start()` that throws falls through to the inline path below without
      // running the turn twice (`startCloudAgentWorkflowExecution` cancels the
      // run it started if the durable attach fails).
      const durableBudgetApplies = !isAgiWorkTurn;
      const durableFirstEventBudgetMs = resolveDurableFirstEventBudgetMs();
      const durableTurnsEnabled = areDurableInitialTurnsEnabled();
      const durableBreakerOpen =
        durableTurnsEnabled &&
        ((await isDurableTransportCoolingDown()) ||
          (durableBudgetApplies && (await isDurableFirstEventBudgetCoolingDown())));
      if (durableTurnsEnabled && !durableBreakerOpen) {
        try {
          const workflow = await timePhase(CHAT_TURN_PHASE.durableStart, () =>
            startCloudAgentWorkflowExecution({
              db: runDb,
              runId: run.id,
              userId,
              processed,
              mcpTools,
              approvalMode: loopInputs.approvalMode,
              toolApprovalPolicy,
              connectorPermissions: turnConnectorPermissions,
            }),
          );
          const live = await timePhase(CHAT_TURN_PHASE.durableFirstEvent, () =>
            durableBudgetApplies
              ? claimDurableStreamWithinBudget(workflow.readable, durableFirstEventBudgetMs)
              : claimLiveDurableStream(workflow.readable),
          );
          if (!live) {
            // Correctness: the inline turn below must not start until this
            // cancel is issued, or the same turn runs twice and settles twice.
            if (durableBudgetApplies) {
              await timePhase(CHAT_TURN_PHASE.durableBudgetFallback, () =>
                workflow.cancel().catch(() => undefined),
              );
            } else {
              await workflow.cancel().catch(() => undefined);
            }
            throw new DurableStreamStalledError(durableBudgetApplies);
          }
          const durableHeaders = baseAgentHeaders();
          durableHeaders['X-AGI-Tool-Loop'] = 'durable';
          durableHeaders['X-AGI-Workflow-Run-Id'] = workflow.workflowRunId;
          const bounded = boundDurableTurnStream({
            readable: live,
            db: runDb,
            userId,
            runId: run.id,
            workflowRunId: workflow.workflowRunId,
            requestId: processed.requestId,
          });
          return new NextResponse(withSseHeartbeat(bounded), {
            headers: durableHeaders,
          });
        } catch (error) {
          // Degrade, do not fail: the inline path below produces the same SSE
          // wire and the same journal. The turn is merely no longer detachable.
          // A turn with no reservation at all is an ordinary, expected miss, not
          // an incident, so it is not logged at error.
          const unreserved = error instanceof CloudAgentWorkflowBillingUnavailableError;
          const overBudget = error instanceof DurableStreamStalledError && error.budgetExceeded;
          const details = { error, userId, requestId: processed.requestId, runId: run.id };
          if (unreserved) {
            logger.debug(details, 'Agent turn carries no reservation; running request-scoped');
          } else if (overBudget) {
            logger.warn(
              {
                ...details,
                event: DURABLE_FIRST_EVENT_BUDGET_EVENT,
                budgetMs: durableFirstEventBudgetMs,
              },
              'Durable transport missed the chat first-byte budget; serving this turn request-scoped',
            );
          } else {
            logger.error(
              details,
              'Durable initial agent turn could not start; falling back to the request-scoped stream',
            );
          }
        }
      }

      // Approval mode:
      //   - Built-in platform tools only: 'auto', E2B tools run in an isolated sandbox,
      //     url_fetch is read-only + SSRF-guarded, and web_search uses the configured
      //     server-owned search backend. These tools fail closed with an explicit result
      //     if their backend is unavailable, so the model can recover inside the loop.
      //   - MCP tools present (with or without E2B/url_fetch): 'manual', keep the existing
      //     fail-closed approval gate. If both MCP + E2B tools are present, MCP's manual
      //     gate takes precedence; E2B tool calls in that mix stall on approval (acceptable;
      //     mixed MCP+E2B is an edge case and the operator can enable the resume endpoint).
      // Build the agentic SSE stream from the tool-loop generator. The connector
      // executor is bound to the authenticated userId (only meaningful when the
      // user actually connected connectors; a no-op otherwise).
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
        ...breakers,
        onResilienceObservation: recordResilienceObservation,
        ...(processed.freeLane ? { onAttemptFailure: observeFreeLaneAttemptFailure } : {}),
      });
      const permissionGate = createCloudAgentToolPermissionGate(requestDb, {
        userId,
        organizationId: processed.organizationId ?? null,
        connectorToolNames: connectorToolNames(mcpTools),
        conversationId: processed.conversationId,
        temporary: processed.conversationIsTemporary === true,
        disabledConnectorIds: processed.chatRequest.disabled_connector_ids,
      });
      const toolLoopGen = runToolLoop(processed, {
        mcpTools,
        approvalMode: loopInputs.approvalMode,
        userId,
        connectorExecutor,
        usage: toolLoopUsage,
        // Server-side enforcement of the user's saved verdicts,
        // layered with this turn's per-conversation connector opt-out.
        connectorPermissions: turnConnectorPermissions,
        sessionGrantRefusal: (name, risk) => permissionGate.refusalFor(name, risk),
        toolApprovalPolicy,
        // A client cancel aborts the in-flight provider call instead of
        // billing a full agentic turn nobody sees.
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
        takeSteerMessages: () =>
          takeCloudAgentRunSteers(runDb, {
            userId,
            organizationId: processed.organizationId ?? null,
            runId: run.id,
          }),
        onApprovalCheckpoint: async (checkpoint) => {
          await saveCloudAgentApprovalCheckpoint(runDb, {
            userId,
            runId: run.id,
            sessionId: checkpoint.sessionId,
            turnId: checkpoint.turnId,
            nextEventSequence: checkpoint.nextEventSequence,
            completedSteps: checkpoint.completedSteps,
            request: buildApprovalCheckpointRequest(
              processed.chatRequest,
              processed.callerToolFields,
              processed.turnAttachments,
              processed.modelSelection,
              processed.turnToolProhibition,
            ),
            messages: checkpoint.messages,
            pendingToolCalls: checkpoint.pendingToolCalls,
            events: checkpoint.events,
          });
          approvalCheckpointSaved = true;
        },
        // An MCP `input_required` pause is a NON-TERMINAL exit: the loop parks the
        // run in `awaiting_input`, streams [DONE], and returns. Without this write
        // it parked with nothing recorded, `resume-input/` had no checkpoint to
        // claim, so the run was unresumable and the work already done was lost.
        // The durable transport has always written it; the inline one now does too.
        onInputCheckpoint: async (checkpoint) => {
          await saveCloudAgentInputCheckpoint(runDb, {
            userId,
            runId: run.id,
            sessionId: checkpoint.sessionId,
            turnId: checkpoint.turnId,
            nextEventSequence: checkpoint.nextEventSequence,
            completedSteps: checkpoint.completedSteps,
            request: buildApprovalCheckpointRequest(
              processed.chatRequest,
              processed.callerToolFields,
              processed.turnAttachments,
              processed.modelSelection,
              processed.turnToolProhibition,
            ),
            messages: checkpoint.messages,
            pendingToolCalls: checkpoint.pendingToolCalls,
            inputRequests: checkpoint.inputRequests,
            requestState: checkpoint.requestState,
            events: checkpoint.events,
          });
          approvalCheckpointSaved = true;
        },
        onDeviceCheckpoint: async (checkpoint) => {
          await saveCloudAgentDeviceCheckpoint(runDb, {
            userId,
            runId: run.id,
            sessionId: checkpoint.sessionId,
            turnId: checkpoint.turnId,
            nextEventSequence: checkpoint.nextEventSequence,
            completedSteps: checkpoint.completedSteps,
            request: buildApprovalCheckpointRequest(
              processed.chatRequest,
              processed.callerToolFields,
              processed.turnAttachments,
              processed.modelSelection,
              processed.turnToolProhibition,
            ),
            messages: checkpoint.messages,
            pendingToolCalls: checkpoint.pendingToolCalls,
            deviceStep: checkpoint.deviceStep,
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

      // Managed failover: the rotation point is startProviderStream's
      // first-chunk peek, so a rotated attempt has BY CONSTRUCTION delivered
      // nothing to the client (the peek either throws before any chunk is
      // consumable, or the attempt is committed and later failures surface
      // mid-stream). One managed-
      // usage reservation spans all attempts; the attempt view swaps the
      // serving model so attribution and settlement follow it.
      const failover = createFailoverPlan(processed, {
        signal: request.signal,
        isProviderDispatchable: (candidate) => Boolean(ADAPTER_PROVIDERS[candidate]),
        modelPolicy: processed.modelPolicy ?? null,
        ...breakers,
        onResilienceObservation: recordResilienceObservation,
        ...(processed.freeLane ? { onAttemptFailure: observeFreeLaneAttemptFailure } : {}),
      });
      let attemptProcessed: ProcessedRequest = processed;
      let attemptAdapterProvider = adapterProvider;
      for (;;) {
        let chunks: AsyncIterable<StreamChunk>;
        try {
          const adapter = attemptAdapterProvider.buildAdapter(attemptProcessed);
          const chatRequest = attemptAdapterProvider.buildChatRequest(attemptProcessed);
          chunks = await timePhase(CHAT_TURN_PHASE.providerStream, () =>
            startProviderStreamWithinTurnDeadlines(
              adapter,
              chatRequest,
              request.signal,
              attemptAdapterProvider.mapError,
              {
                firstTokenMs: firstTokenDeadlineMs(Date.now() - streamStartedAt),
                streamMs: nestedDeadlineMs(
                  PROVIDER_STREAM_DEADLINE_MS,
                  CHAT_TOOL_LOOP_BUDGET_MS,
                  Date.now() - streamStartedAt,
                ),
              },
            ),
          );
        } catch (error) {
          const budgetLeft = hasFirstTokenBudgetLeft(Date.now() - streamStartedAt);
          if (!budgetLeft) {
            logger.warn(
              {
                requestId: attemptProcessed.requestId,
                provider: attemptProcessed.provider,
                model: attemptProcessed.chatRequest.model,
                elapsedMs: Date.now() - streamStartedAt,
              },
              'First-token budget for this turn is spent; refusing to try another route',
            );
          }
          const nextAttempt = budgetLeft
            ? failover.next(error, { step: FIRST_PROVIDER_STEP, sameRouteRetrySafe: true })
            : null;
          const nextAdapterProvider = nextAttempt ? ADAPTER_PROVIDERS[nextAttempt.provider] : null;
          if (nextAttempt && nextAdapterProvider) {
            attemptProcessed = nextAttempt.processed;
            attemptAdapterProvider = nextAdapterProvider;
            continue;
          }
          await refundFailedReservation(
            userId,
            attemptProcessed,
            'streaming_failure',
            classifyError(error).category,
          );
          await recordFailedTurn(attemptProcessed, userId, request.signal);
          return buildUpstreamErrorResponse(
            error,
            attemptProcessed.provider,
            attemptProcessed.chatRequest.model,
            attemptProcessed.requestedModel,
            userId,
            attemptProcessed.requestId,
            'streaming',
            { isolatedCredential: servedOnIsolatedPromotionCredential(attemptProcessed) },
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

    // A provider id outside `ADAPTER_PROVIDERS` is refunded and refused, so a
    // catalog change that produced one fails as an ordinary error response.
    await refundFailedReservation(userId, processed, 'streaming_failure', 'unsupported_provider');
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
      ...breakers,
      onResilienceObservation: recordResilienceObservation,
      ...(processed.freeLane ? { onAttemptFailure: observeFreeLaneAttemptFailure } : {}),
    });
    let attemptProcessed: ProcessedRequest = processed;
    let attemptAdapterProvider = nonStreamAdapterProvider;
    const nonStreamStartedAt = Date.now();
    for (;;) {
      let llmResponse;
      try {
        const adapter = attemptAdapterProvider.buildAdapter(attemptProcessed);
        const chatRequest = attemptAdapterProvider.buildChatRequest(attemptProcessed);
        const elapsedMs = Date.now() - nonStreamStartedAt;
        llmResponse = await withProviderDeadlines(
          (derived, markFirstToken) =>
            drainToLlmResponse(
              markFirstProviderChunk(adapter.stream(chatRequest, derived), markFirstToken),
              attemptProcessed.llmRequest.model,
              attemptAdapterProvider.mapError,
              attemptAdapterProvider.wireMode,
            ),
          {
            firstTokenMs: firstTokenDeadlineMs(elapsedMs),
            streamMs: nestedDeadlineMs(
              PROVIDER_STREAM_DEADLINE_MS,
              CHAT_TOOL_LOOP_BUDGET_MS,
              elapsedMs,
            ),
            model: chatRequest.model,
          },
          request.signal,
        );
      } catch (error) {
        const nextAttempt = failover.next(error, { step: FIRST_PROVIDER_STEP });
        const nextAdapterProvider = nextAttempt ? ADAPTER_PROVIDERS[nextAttempt.provider] : null;
        if (nextAttempt && nextAdapterProvider) {
          attemptProcessed = nextAttempt.processed;
          attemptAdapterProvider = nextAdapterProvider;
          continue;
        }
        await refundFailedReservation(
          userId,
          attemptProcessed,
          'request_failure',
          classifyError(error).category,
        );
        await recordFailedTurn(attemptProcessed, userId, request.signal);
        return buildUpstreamErrorResponse(
          error,
          attemptProcessed.provider,
          attemptProcessed.chatRequest.model,
          attemptProcessed.requestedModel,
          userId,
          attemptProcessed.requestId,
          'non-streaming',
          { isolatedCredential: servedOnIsolatedPromotionCredential(attemptProcessed) },
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

  await refundFailedReservation(userId, processed, 'request_failure', 'unsupported_provider');
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

/**
 * Bound CONCURRENT managed turns per plan, to the billing catalog's
 * `maxConcurrentTurns`. The requests-per-minute limiter (`llm-completion`) and
 * spend do not bound concurrency: 30 simultaneous 10-minute streams pass a
 * per-minute limiter cleanly, so this stands between a plan's advertised
 * ceiling and unbounded parallel provider spend.
 *
 * Acquired after the auth gate, the first point with a userId AND a plan tier.
 * The acquire-and-attach pair lives in lib/turn-slot.ts so that the approve and
 * resume-input routes, which start the same kind of turn, inherit the ceiling
 * rather than having to remember it.
 */
async function handleChatCompletions(request: NextRequest): Promise<NextResponse | Response> {
  return runWithPhaseTimer((timer) =>
    withSpan(CHAT_TURN_SPAN, { kind: 'server', domain: 'model' }, async (span) => {
      try {
        return await admitAndDispatchTurn(request);
      } finally {
        span.setAttributes(timer.attributes());
      }
    }),
  );
}

async function admitAndDispatchTurn(request: NextRequest): Promise<NextResponse | Response> {
  // 1. Auth + rate-limit + CSRF + subscription gate
  const authResult = await timePhase(CHAT_TURN_PHASE.authGate, () => runAuthGate(request));
  if (!authResult.ok) return authResult.response;

  const { userId, token } = authResult;
  const replay = freeQuotaFallbackReplay(request, {
    planTier: authResult.subscription.plan_tier,
    viaApiKey: Boolean(authResult.apiKeyId),
  });
  const response = await timePhase(CHAT_TURN_PHASE.turnSlot, () =>
    withManagedTurnSlot({ userId, planTier: authResult.subscription.plan_tier }, async () => {
      if (!replay) return dispatchChatCompletions(request, authResult);
      const quotaLane = { answered: false, tried: null as string | null };
      const dispatched = await dispatchChatCompletions(request, authResult, async (scopedDb) => {
        const first = await serveFreeQuotaFirst({
          request,
          replay: replay.clone(),
          userId,
          scopedDb: () => scopedDb,
        });
        quotaLane.answered = first.response !== null;
        quotaLane.tried = first.tried;
        return first.response;
      });
      if (quotaLane.answered) return dispatched;
      const fallback = await serveFreeQuotaFallback({
        request,
        replay,
        refusal: dispatched,
        userId,
        scopedDb: () => getVerifiedBearerUserScopedDb(request, { userId, token }),
        tried: quotaLane.tried,
      });
      return fallback ?? dispatched;
    }),
  );
  if (authResult.termsNotice) attachHeaders(response, authResult.termsNotice);
  if (authResult.billingNotice) attachHeaders(response, authResult.billingNotice);
  return response;
}

/** A response built from a fetch keeps immutable headers; the notice is advisory, so skip it there. */
function attachHeaders(response: NextResponse | Response, headers: Record<string, string>): void {
  try {
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  } catch {
    // Immutable headers: the turn itself is unaffected.
  }
}

export const POST = withCorsRoute(
  withAdmittedRateLimitHeaders(withErrorHandler(handleChatCompletions)),
);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}

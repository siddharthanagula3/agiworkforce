import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest, getSecurityHeaders, getCorsHeaders } from '@/lib/cors';
import { buildManagedComputeGateResponse } from '@/lib/managed-compute-gate';
import { runAuthGate } from './lib/auth-gate';
import { processRequest, type ProcessedRequest } from './lib/request-processor';
import { buildAdapterStreamResponse } from './lib/stream-transform';
import { buildNonStreamResponse, buildUpstreamErrorResponse } from './lib/response-builder';
import { runToolLoop, loadMcpToolDefs } from './lib/tool-loop';
import { loadUserConnectorToolDefs, makeUserConnectorExecutor } from '@/lib/user-connector-tools';
import { runResearchLoop } from './lib/research-loop';
import { buildManagedAgentStream } from './lib/managed-agent-stream';
import { buildApprovalCheckpointRequest } from './lib/approval-checkpoint-request';
import { classifyToolLoopInputs } from './lib/tool-loop-routing';
import { createObservedProviderUsage } from '@/lib/services/managed-usage-accounting-service';
import { startProviderStream } from './lib/adapter-factory';
import { ADAPTER_PROVIDERS } from './lib/adapter-providers';
import { drainToLlmResponse } from './lib/adapter-response';
import { createFailoverPlan } from './lib/managed-failover';
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
  transitionCloudAgentRun,
} from '@/lib/services/cloud-agent-run-service';
import type {
  CloudAgentOriginSurface,
  CloudAgentRun,
  CloudAgentWorkMode,
} from '@agiworkforce/cloud-contracts';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { startCloudAgentWorkflowExecution } from '@/lib/workflows/start-cloud-agent-workflow';
import { recordManagedAutoMemoryTurn } from '@/lib/services/managed-auto-memory-service';
import { settleFreeTrialRequest } from '@/lib/services/free-trial-service';

/** Current Vercel Hobby maximum; durable AGI Work will span workflow steps. */
export const maxDuration = 300;

/**
 * OpenAI-compatible Chat Completions API
 * Endpoint: POST /v1/chat/completions (via api.agiworkforce.com)
 *
 * Routes to 10+ LLM providers based on model. Auth: Clerk JWT. Billing: cloud credits.
 * Service modules: auth-gate | request-processor | stream-transform | response-builder
 *
 * Agentic extension: every AGI Work stream enters the durable Workflow-backed
 * tool-loop driver, including turns that begin without an explicit tool. Normal
 * chat enters the request-scoped loop only when MCP/platform tools are present.
 * The approval_mode query parameter controls gating: ?approval_mode=auto skips
 * the per-tool prompt; the default 'manual' persists a signed checkpoint before
 * emitting x_tool_approval_request events.
 *
 * Provider dispatch, for the standard (non-agentic) paths below (restructure
 * Wave 2, task #34): Anthropic, Google, OpenAI, and the 9 openai-compat
 * providers (groq, mistral, moonshot, zhipu, qwen, openrouter, deepseek,
 * xai, perplexity) go through `packages/ai/providers/*` adapters
 * (`ADAPTER_PROVIDERS`, ./lib/adapter-providers.ts) -- that is every provider
 * `processed.provider` (request-processor.ts's catalog lookup + heuristic
 * fallback chain) can resolve to, so there is no longer a `LLMProviderFactory`
 * (apps/web/lib/llm-providers, retired) dispatch fallback below; an unlisted
 * provider id is treated as an explicit unsupported-provider failure instead.
 * The agentic tool-loop path (MCP/E2B, `runToolLoop`) shares the SAME
 * `ADAPTER_PROVIDERS` table via its own table-driven per-step dispatch, see
 * tool-loop-anthropic.ts.
 */

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
        usage: { reason },
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

function resolveAgentOriginSurface(request: NextRequest): CloudAgentOriginSurface {
  const surface = resolveCloudChatSurface(request);
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
      originSurface: resolveAgentOriginSurface(request),
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

async function handleChatCompletions(request: NextRequest) {
  // 1. Auth + rate-limit + CSRF + subscription gate
  const authResult = await runAuthGate(request);
  if (!authResult.ok) return authResult.response;

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

  // 2. Parse body, validate, run classifier, resolve model, quota gate, reserve credits
  const processResult = await processRequest(request, authResult);
  if (!processResult.ok) return processResult.response;

  const processed = processResult;

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
    // this defense-in-depth gate keeps the paid-only contract explicit. The
    // path is also gated to non-Anthropic providers (their raw streams
    // are only normalized by buildStreamResponse; every other provider already
    // emits OpenAI-compatible SSE, which the research loop consumes). Free
    // trial and Anthropic keep the existing single-turn research behavior
    // (research prompt + forced web_search) unchanged.
    if (
      processed.researchMode &&
      !processed.freeTrial &&
      processed.provider.toLowerCase() !== 'anthropic'
    ) {
      const startedRun = await beginCloudAgentRun(request, userId, processed, 'research');
      if (startedRun instanceof NextResponse) return startedRun;
      const { run, db: runDb } = startedRun;
      const researchUsage = createObservedProviderUsage();
      const researchGen = runResearchLoop(
        processed,
        { userId, token },
        {
          usage: researchUsage,
          isCancellationRequested: () =>
            isCloudAgentRunCancellationRequested(runDb, { userId, runId: run.id }),
        },
      );
      const researchStream = buildManagedAgentStream({
        generator: researchGen,
        processed,
        usage: researchUsage,
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
      if (processed.quotaWarningHeader) {
        researchHeaders['X-Quota-Warning'] = processed.quotaWarningHeader;
      }

      return new NextResponse(researchStream, { headers: researchHeaders });
    }

    // Agentic path: load MCP tools (fast -- catalog is cached for 60s).
    // If no tools are configured, mcpTools is empty and we fall through to
    // the standard single-turn streaming path unchanged.
    //
    // Additive per-user connector tools (fixes WEB-CONNECTORS-NO-RUNTIME-EFFECT-01):
    // a signed-in user's CONNECTED connectors (github built-in / operator-mapped
    // remote MCP connectors) contribute tools alongside the operator MCP catalog.
    // Fully server-side and degrades to [] on any failure, so the SSE wire shape
    // is unchanged (no new event types) and an unconfigured/empty environment
    // behaves exactly as before.
    // Per-model tools gate (WEB-TOOLS-MODEL-CAP-GATE-01): a model whose registry
    // capability `tools` is false (e.g. the Perplexity `sonar` search models) cannot
    // do function calling. Shipping MCP / connector tool definitions to it makes the
    // provider reject the whole request. Skip tool loading for such models so they
    // fall through to the standard single-turn path — search-native models still
    // answer; connectors/MCP are simply not offered. The office-creation, skill, and
    // E2B paths already 4xx for tools:false; this closes the same gap for connectors/MCP.
    const modelSupportsTools =
      getModelMetadataById(processed.chatRequest.model)?.capabilities?.tools ?? true;
    const [operatorTools, connectorTools] = modelSupportsTools
      ? await Promise.all([
          loadMcpToolDefs(),
          loadUserConnectorToolDefs(userId, {
            customConnectorLimit: getCustomRemoteMcpLimit(processed.subscriptionTier) ?? undefined,
          }),
        ])
      : [[], []];
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

      if (processed.chatRequest.work_mode === 'agiwork') {
        try {
          const workflow = await startCloudAgentWorkflowExecution({
            db: runDb,
            runId: run.id,
            userId,
            processed,
            mcpTools,
            approvalMode: loopInputs.approvalMode,
          });
          const workflowHeaders: Record<string, string> = {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-AGI-Tool-Loop': 'workflow',
            'X-AGI-Workflow-Run-Id': workflow.workflowRunId,
            ...getCorsHeaders(request),
            ...getSecurityHeaders(),
          };
          addAgentRunHeaders(workflowHeaders, run);
          if (processed.quotaWarningHeader) {
            workflowHeaders['X-Quota-Warning'] = processed.quotaWarningHeader;
          }
          return new NextResponse(workflow.readable, { headers: workflowHeaders });
        } catch (error) {
          logger.error(
            { error, userId, requestId: processed.requestId, runId: run.id },
            'Durable Cloud agent workflow could not be started',
          );
          await transitionCloudAgentRun(runDb, {
            userId,
            runId: run.id,
            state: 'failed',
          }).catch(() => undefined);
          await refundFailedReservation(userId, processed, 'request_failure');
          return NextResponse.json(
            {
              error: {
                message: 'Durable agent execution is temporarily unavailable.',
                type: 'server_error',
                code: 'agent_workflow_unavailable',
              },
            },
            { status: 503, headers: getSecurityHeaders() },
          );
        }
      }

      // Approval mode:
      //   - Built-in platform tools only: 'auto' — E2B tools run in an isolated sandbox,
      //     url_fetch is read-only + SSRF-guarded, and web_search uses the configured
      //     server-owned search backend. These tools fail closed with an explicit result
      //     if their backend is unavailable, so the model can recover inside the loop.
      //   - MCP tools present (with or without E2B/url_fetch): 'manual' — keep the existing
      //     fail-closed approval gate. If both MCP + E2B tools are present, MCP's manual
      //     gate takes precedence; E2B tool calls in that mix stall on approval (acceptable;
      //     mixed MCP+E2B is an edge case and the operator can enable the resume endpoint).
      // Build the agentic SSE stream from the tool-loop generator. The connector
      // executor is bound to the authenticated userId (only meaningful when the
      // user actually connected connectors; a no-op otherwise).
      const connectorExecutor =
        connectorTools.length > 0 ? makeUserConnectorExecutor(userId) : undefined;
      const toolLoopUsage = createObservedProviderUsage();
      let approvalCheckpointSaved = false;
      const toolLoopGen = runToolLoop(processed, {
        mcpTools,
        approvalMode: loopInputs.approvalMode,
        userId,
        connectorExecutor,
        usage: toolLoopUsage,
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
      });

      const agentStream = buildManagedAgentStream({
        generator: toolLoopGen,
        processed,
        usage: toolLoopUsage,
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

      const streamHeaders: Record<string, string> = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-AGI-Tool-Loop': 'active',
        ...getCorsHeaders(request),
        ...getSecurityHeaders(),
      };
      addAgentRunHeaders(streamHeaders, run);
      if (processed.quotaWarningHeader) {
        streamHeaders['X-Quota-Warning'] = processed.quotaWarningHeader;
      }

      return new NextResponse(agentStream, { headers: streamHeaders });
    }

    // Standard single-turn streaming path (no MCP tools configured).
    const adapterProvider = ADAPTER_PROVIDERS[processed.provider];
    if (adapterProvider) {
      // Captured BEFORE startProviderStream's error-detection peek, which
      // awaits the first StreamChunk -- taking this timestamp any later
      // would measure the peek's own wait, not the real time-to-first-token.
      // See buildAdapterStreamResponse's docstring.
      const streamStartedAt = Date.now();

      // Managed failover (AUTO-ROUTER-MIGRATION-01, web twin): the rotation
      // point is startProviderStream's first-chunk peek — a rotated attempt
      // has BY CONSTRUCTION delivered nothing to the client (the peek either
      // throws before any chunk is consumable, or the attempt is committed
      // and later failures keep today's mid-stream behavior). One managed-
      // usage reservation spans all attempts; the attempt view swaps the
      // serving model so attribution and settlement follow it.
      const failover = createFailoverPlan(processed, {
        signal: request.signal,
        isProviderDispatchable: (candidate) => Boolean(ADAPTER_PROVIDERS[candidate]),
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

export const POST = withErrorHandler(handleChatCompletions);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}

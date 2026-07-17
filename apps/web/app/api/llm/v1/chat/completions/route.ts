import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { CreditService } from '@/lib/services/credit-service';
import { logger } from '@/lib/logger';
import { refundFreeTrialPrompt } from '@/lib/services/free-trial-service';
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
import { createObservedProviderUsage } from '@/lib/services/managed-usage-accounting-service';
import { isExecutionTool } from '@/lib/e2b/execution-tools';
import { isUrlFetchTool } from '@/lib/url-fetch/url-fetch-tool';
import { startProviderStream } from './lib/adapter-factory';
import { ADAPTER_PROVIDERS } from './lib/adapter-providers';
import { drainToLlmResponse } from './lib/adapter-response';
import { createFailoverPlan } from './lib/managed-failover';
import type { StreamChunk } from '@agiworkforce/types';
import {
  ManagedUsageRequestError,
  finalizeManagedUsageRequest,
  markManagedUsageProviderStarted,
} from '@/lib/services/managed-usage-request-service';

/**
 * OpenAI-compatible Chat Completions API
 * Endpoint: POST /v1/chat/completions (via api.agiworkforce.com)
 *
 * Routes to 10+ LLM providers based on model. Auth: Clerk JWT. Billing: cloud credits.
 * Service modules: auth-gate | request-processor | stream-transform | response-builder
 *
 * Agentic extension: when remote MCP tools are configured through the validated
 * WEB_MCP_SERVERS_JSON contract, streaming requests enter the
 * tool-loop driver (tool-loop.ts) which executes tools and re-invokes the
 * model up to DEFAULT_MAX_STEPS times.  The approval_mode query parameter
 * controls gating: ?approval_mode=auto skips the per-tool prompt; the default
 * 'manual' suspends and emits x_tool_approval_request events.
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
    await refundFreeTrialPrompt({
      userId,
      requestId: processed.requestId,
      reason,
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

  const refundKey = CreditService.generateIdempotencyKey(userId, 'refund', processed.requestId);
  try {
    await CreditService.settleCreditsDurably({
      userId,
      amountCents: -processed.estimatedCostCents,
      description: `Refund for failed request: ${processed.provider}/${processed.chatRequest.model}`,
      metadata: { type: 'refund', reason, requestId: processed.requestId },
      idempotencyKey: refundKey,
    });
  } catch (settlementError) {
    logger.error(
      {
        event: 'chat_refund_settlement_unrecorded',
        error: settlementError,
        userId,
        requestId: processed.requestId,
      },
      'Chat refund could not be persisted',
    );
  }
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
    // rounds -> cited synthesis). Gated to non-free-trial requests (a run is
    // several provider turns) and non-Anthropic providers (their raw streams
    // are only normalized by buildStreamResponse; every other provider already
    // emits OpenAI-compatible SSE, which the research loop consumes). Free
    // trial and Anthropic keep the existing single-turn research behavior
    // (research prompt + forced web_search) unchanged.
    if (
      processed.researchMode &&
      !processed.freeTrial &&
      processed.provider.toLowerCase() !== 'anthropic'
    ) {
      const researchUsage = createObservedProviderUsage();
      const researchGen = runResearchLoop(processed, { userId, token }, { usage: researchUsage });
      const researchStream = buildManagedAgentStream({
        generator: researchGen,
        processed,
        usage: researchUsage,
        completionReason: 'research_loop_completed',
        cancellationReason: 'client_cancelled_research_loop',
      });

      const researchHeaders: Record<string, string> = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-AGI-Research-Loop': 'active',
        ...getCorsHeaders(request),
        ...getSecurityHeaders(),
      };
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
    const [operatorTools, connectorTools] = await Promise.all([
      loadMcpToolDefs(),
      loadUserConnectorToolDefs(userId),
    ]);
    const mcpTools = [...operatorTools, ...connectorTools];
    const hasMcpTools = mcpTools.length > 0 && !processed.freeTrial;

    // Detect E2B execution tools offered on this request (set by request-processor when
    // AGI_E2B_EXECUTION=1 and the provider routes to E2B). Uses isExecutionTool() on the
    // tool `function.name` field — the shape `e2bExecutionToolDefs()` returns is
    // `{type:'function', function:{name,...}}`, while native tools use type-object shapes
    // with no `function` key, so they never match.
    const hasE2BTools =
      !processed.freeTrial &&
      (processed.llmRequest.tools ?? []).some((t) =>
        isExecutionTool((t as { function?: { name?: string } }).function?.name ?? ''),
      );

    // Platform url_fetch tool offered by request-processor (web_fetch on a
    // non-Anthropic provider). Same detection seam as E2B: function-tool shape only.
    const hasUrlFetchTool =
      !processed.freeTrial &&
      (processed.llmRequest.tools ?? []).some((t) =>
        isUrlFetchTool((t as { function?: { name?: string } }).function?.name ?? ''),
      );

    if (hasMcpTools || hasE2BTools || hasUrlFetchTool) {
      // Approval mode:
      //   - E2B-only and/or url_fetch-only: 'auto' — E2B tools run in an isolated sandbox
      //     (no real fs/secrets) and url_fetch is read-only + SSRF-guarded, so auto-run is
      //     both safe and necessary (no user prompt needed for a page read). The loop uses
      //     runMcpTool → routeExecutionTool / executeUrlFetch, fail-closed (explicit error
      //     to model if E2B_API_KEY is absent, sandbox creation fails, or a fetch is
      //     blocked/unreachable).
      //   - MCP tools present (with or without E2B/url_fetch): 'manual' — keep the existing
      //     fail-closed approval gate. If both MCP + E2B tools are present, MCP's manual
      //     gate takes precedence; E2B tool calls in that mix stall on approval (acceptable;
      //     mixed MCP+E2B is an edge case and the operator can enable the resume endpoint).
      const approvalMode = hasMcpTools ? ('manual' as const) : ('auto' as const);

      // Build the agentic SSE stream from the tool-loop generator. The connector
      // executor is bound to the authenticated userId (only meaningful when the
      // user actually connected connectors; a no-op otherwise).
      const connectorExecutor =
        connectorTools.length > 0 ? makeUserConnectorExecutor(userId) : undefined;
      const toolLoopUsage = createObservedProviderUsage();
      const toolLoopGen = runToolLoop(processed, {
        mcpTools,
        approvalMode,
        userId,
        connectorExecutor,
        usage: toolLoopUsage,
      });

      const agentStream = buildManagedAgentStream({
        generator: toolLoopGen,
        processed,
        usage: toolLoopUsage,
        completionReason: 'tool_loop_completed',
        cancellationReason: 'client_cancelled_tool_loop',
      });

      const streamHeaders: Record<string, string> = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-AGI-Tool-Loop': 'active',
        ...getCorsHeaders(request),
        ...getSecurityHeaders(),
      };
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

      return buildNonStreamResponse(request, llmResponse, attemptProcessed, userId, token);
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

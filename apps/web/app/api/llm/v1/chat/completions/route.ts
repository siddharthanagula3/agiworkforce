import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { CreditService } from '@/lib/services/credit-service';
import { refundFreeTrialPrompt } from '@/lib/services/free-trial-service';
import { handleCorsPreflightRequest, getSecurityHeaders, getCorsHeaders } from '@/lib/cors';
import { buildManagedComputeGateResponse } from '@/lib/managed-compute-gate';
import { runAuthGate } from './lib/auth-gate';
import { processRequest, type ProcessedRequest } from './lib/request-processor';
import { buildAdapterStreamResponse } from './lib/stream-transform';
import { buildNonStreamResponse, buildUpstreamErrorResponse } from './lib/response-builder';
import { runToolLoop, loadMcpToolDefs } from './lib/tool-loop';
import { isExecutionTool } from '@/lib/e2b/execution-tools';
import { startProviderStream } from './lib/adapter-factory';
import { ADAPTER_PROVIDERS } from './lib/adapter-providers';
import { drainToLlmResponse } from './lib/adapter-response';
import type { StreamChunk } from '@agiworkforce/types';

/**
 * OpenAI-compatible Chat Completions API
 * Endpoint: POST /v1/chat/completions (via api.agiworkforce.com)
 *
 * Routes to 10+ LLM providers based on model. Auth: Clerk JWT. Billing: cloud credits.
 * Service modules: auth-gate | request-processor | stream-transform | response-builder
 *
 * Agentic extension: when MCP tools are configured (MCP_WEB_CONFIG_PATH or
 * mcp-servers.json with enabled:true entries), streaming requests enter the
 * tool-loop driver (tool-loop.ts) which executes tools and re-invokes the
 * model up to DEFAULT_MAX_STEPS times.  The approval_mode query parameter
 * controls gating: ?approval_mode=auto skips the per-tool prompt; the default
 * 'manual' suspends and emits x_tool_approval_request events.
 *
 * Provider dispatch, for the standard (non-agentic) paths below (restructure
 * Wave 2, task #34): Anthropic, Google, OpenAI, and the 9 openai-compat
 * providers (groq, mistral, moonshot, zhipu, qwen, openrouter, deepseek,
 * xai, perplexity) go through `packages/providers/*` adapters
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

  const refundKey = CreditService.generateIdempotencyKey(userId, 'refund', processed.requestId);
  await CreditService.deductCredits(
    userId,
    -processed.estimatedCostCents,
    `Refund for failed request: ${processed.provider}/${processed.chatRequest.model}`,
    { type: 'refund', reason, requestId: processed.requestId },
    refundKey,
  );
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

  // 3. Dispatch to provider
  if (processed.chatRequest.stream) {
    // Agentic path: load MCP tools (fast -- catalog is cached for 60s).
    // If no tools are configured, mcpTools is empty and we fall through to
    // the standard single-turn streaming path unchanged.
    const mcpTools = await loadMcpToolDefs();
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

    if (hasMcpTools || hasE2BTools) {
      // Approval mode:
      //   - E2B-only: 'auto' — E2B tools run in an isolated sandbox (no real fs/secrets),
      //     and there is no /approve resume endpoint, so auto-run is both safe and
      //     necessary. The loop uses runMcpTool → routeExecutionTool, fail-closed (explicit
      //     error to model if E2B_API_KEY is absent or sandbox creation fails).
      //   - MCP tools present (with or without E2B): 'manual' — keep the existing
      //     fail-closed approval gate. If both MCP + E2B tools are present, MCP's manual
      //     gate takes precedence; E2B tool calls in that mix stall on approval (acceptable;
      //     mixed MCP+E2B is an edge case and the operator can enable the resume endpoint).
      const approvalMode = hasMcpTools ? ('manual' as const) : ('auto' as const);

      // Build the agentic SSE stream from the tool-loop generator.
      const toolLoopGen = runToolLoop(processed, { mcpTools, approvalMode, userId });

      const encoder = new TextEncoder();
      const agentStream = new ReadableStream({
        async pull(controller) {
          const { value, done } = await toolLoopGen.next();
          if (done) {
            controller.close();
          } else {
            controller.enqueue(value ?? encoder.encode(''));
          }
        },
        async cancel() {
          // Drain the generator so it can release handles.
          try {
            await toolLoopGen.return(undefined);
          } catch {
            // ignore
          }
        },
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
      let chunks: AsyncIterable<StreamChunk>;
      try {
        const adapter = adapterProvider.buildAdapter(processed);
        const chatRequest = adapterProvider.buildChatRequest(processed);
        chunks = await startProviderStream(
          adapter,
          chatRequest,
          request.signal,
          adapterProvider.mapError,
        );
      } catch (error) {
        await refundFailedReservation(userId, processed, 'streaming_failure');
        return buildUpstreamErrorResponse(
          error,
          processed.provider,
          processed.chatRequest.model,
          processed.requestedModel,
          userId,
          processed.requestId,
          'streaming',
        );
      }

      return buildAdapterStreamResponse(
        request,
        chunks,
        processed,
        userId,
        token,
        streamStartedAt,
        adapterProvider.wireMode,
      );
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
    let llmResponse;
    try {
      const adapter = nonStreamAdapterProvider.buildAdapter(processed);
      const chatRequest = nonStreamAdapterProvider.buildChatRequest(processed);
      const chunks = adapter.stream(chatRequest, request.signal);
      llmResponse = await drainToLlmResponse(
        chunks,
        processed.llmRequest.model,
        nonStreamAdapterProvider.mapError,
        nonStreamAdapterProvider.wireMode,
      );
    } catch (error) {
      await refundFailedReservation(userId, processed, 'request_failure');
      return buildUpstreamErrorResponse(
        error,
        processed.provider,
        processed.chatRequest.model,
        processed.requestedModel,
        userId,
        processed.requestId,
        'non-streaming',
      );
    }

    return buildNonStreamResponse(request, llmResponse, processed, userId, token);
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

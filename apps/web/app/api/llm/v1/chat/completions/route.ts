import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { LLMProviderFactory } from '@/lib/llm-providers/factory';
import { CreditService } from '@/lib/services/credit-service';
import { refundFreeTrialPrompt } from '@/lib/services/free-trial-service';
import { handleCorsPreflightRequest, getSecurityHeaders, getCorsHeaders } from '@/lib/cors';
import { buildManagedComputeGateResponse } from '@/lib/managed-compute-gate';
import { runAuthGate } from './lib/auth-gate';
import { processRequest, type ProcessedRequest } from './lib/request-processor';
import { buildStreamResponse } from './lib/stream-transform';
import { buildNonStreamResponse, buildUpstreamErrorResponse } from './lib/response-builder';
import { runToolLoop, loadMcpToolDefs } from './lib/tool-loop';

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

  const { userId, token } = authResult;

  const managedGateResponse = buildManagedComputeGateResponse(
    request,
    {
      provider: 'managed',
      model: 'chat-completions',
      feature: 'llm_v1_chat_completions',
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

    if (hasMcpTools) {
      // Determine approval mode from query param (default: manual = fail-closed).
      const approvalMode =
        request.nextUrl.searchParams.get('approval_mode') === 'auto' ? 'auto' : 'manual';

      // Build the agentic SSE stream from the tool-loop generator.
      const toolLoopGen = runToolLoop(processed, { mcpTools, approvalMode });

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
    let stream: ReadableStream;
    try {
      stream = await LLMProviderFactory.streamRequest(processed.provider, processed.llmRequest);
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

    return buildStreamResponse(request, stream, processed, userId, token);
  }

  // Non-streaming path
  let llmResponse;
  try {
    llmResponse = await LLMProviderFactory.sendRequest(processed.provider, processed.llmRequest);
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

export const POST = withErrorHandler(handleChatCompletions);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}

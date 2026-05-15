import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { LLMProviderFactory } from '@/lib/llm-providers/factory';
import { CreditService } from '@/lib/services/credit-service';
import { handleCorsPreflightRequest, getSecurityHeaders } from '@/lib/cors';
import { runAuthGate } from './lib/auth-gate';
import { processRequest } from './lib/request-processor';
import { buildStreamResponse } from './lib/stream-transform';
import { buildNonStreamResponse, buildUpstreamErrorResponse } from './lib/response-builder';

/**
 * OpenAI-compatible Chat Completions API
 * Endpoint: POST /v1/chat/completions (via api.agiworkforce.com)
 *
 * Routes to 10+ LLM providers based on model. Auth: Supabase JWT. Billing: cloud credits.
 * Service modules: auth-gate | request-processor | stream-transform | response-builder
 */
async function handleChatCompletions(request: NextRequest) {
  // 1. Auth + rate-limit + CSRF + subscription gate
  const authResult = await runAuthGate(request);
  if (!authResult.ok) return authResult.response;

  const { user, token, userClient } = authResult;

  // 2. Parse body, validate, run classifier, resolve model, quota gate, reserve credits
  const processResult = await processRequest(request, authResult);
  if (!processResult.ok) return processResult.response;

  const processed = processResult;

  // 3. Dispatch to provider
  if (processed.chatRequest.stream) {
    let stream: ReadableStream;
    try {
      stream = await LLMProviderFactory.streamRequest(processed.provider, processed.llmRequest);
    } catch (error) {
      // Refund reservation on upstream failure
      const refundKey = CreditService.generateIdempotencyKey(
        user.id,
        'refund',
        processed.requestId,
      );
      await CreditService.deductCredits(
        userClient,
        user.id,
        -processed.estimatedCostCents,
        `Refund for failed streaming request: ${processed.provider}/${processed.chatRequest.model}`,
        { type: 'refund', reason: 'streaming_failure', requestId: processed.requestId },
        refundKey,
      );
      return buildUpstreamErrorResponse(
        error,
        processed.provider,
        processed.chatRequest.model,
        processed.requestedModel,
        user.id,
        processed.requestId,
        'streaming',
      );
    }

    return buildStreamResponse(request, stream, processed, userClient, user.id, token);
  }

  // Non-streaming path
  let llmResponse;
  try {
    llmResponse = await LLMProviderFactory.sendRequest(processed.provider, processed.llmRequest);
  } catch (error) {
    const refundKey = CreditService.generateIdempotencyKey(user.id, 'refund', processed.requestId);
    await CreditService.deductCredits(
      userClient,
      user.id,
      -processed.estimatedCostCents,
      `Refund for failed request: ${processed.provider}/${processed.chatRequest.model}`,
      { type: 'refund', reason: 'request_failure', requestId: processed.requestId },
      refundKey,
    );
    return buildUpstreamErrorResponse(
      error,
      processed.provider,
      processed.chatRequest.model,
      processed.requestedModel,
      user.id,
      processed.requestId,
      'non-streaming',
    );
  }

  return buildNonStreamResponse(request, llmResponse, processed, userClient, user.id, token);
}

export const POST = withErrorHandler(handleChatCompletions);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}

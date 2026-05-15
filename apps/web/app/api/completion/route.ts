import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { LLMProviderFactory } from '@/lib/llm-providers/factory';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getTaskModelForProvider, getProviderDefaultModel } from '@agiworkforce/types';

/**
 * Prompt Completion API
 * Endpoint: POST /api/completion
 *
 * Provides ghost-text prompt completions for the AI prompt box.
 * Used by useApiPromptCompletion hook to power inline suggestions.
 */

export const maxDuration = 30;
export const runtime = 'nodejs';

const CompletionRequestSchema = z.object({
  input: z.string().min(1).max(10000),
  context: z.string().max(5000).nullable().optional(),
});

interface PromptCompletionResponse {
  suggestion: string;
  model: string;
  latency_ms: number;
}

async function handleCompletion(request: NextRequest): Promise<NextResponse> {
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) {
    return preflightResponse;
  }

  // Rate limiting
  const rateLimitResponse = await withRateLimit(request, 'prompt-completion');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // Authentication — verify the caller is signed in; we do not use the user
  // object here (completions are not user-scoped), but this gate prevents
  // unauthenticated access.
  await getAuthenticatedUser(request);

  // Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  const validationResult = CompletionRequestSchema.safeParse(body);
  if (!validationResult.success) {
    throw createError.validation('Invalid request body');
  }

  const { input, context } = validationResult.data;

  const startTime = Date.now();

  // Use a fast, cheap model for prompt completions.
  // MODEL-IDS-HARDCODED fix: look up via catalog instead of hardcoding.
  const completionModel =
    getTaskModelForProvider('anthropic', 'fast_completion') ??
    getProviderDefaultModel('anthropic') ??
    'claude-haiku-4-5'; // last-resort fallback — should never be reached
  const provider = LLMProviderFactory.getProviderFromModel(completionModel);

  const systemContent = context
    ? `You are a helpful assistant providing prompt completions. Context: ${context}\n\nComplete the user's partial input with a natural, helpful continuation. Return ONLY the completion text (not the original input), keeping it concise (1-2 sentences max).`
    : "You are a helpful assistant providing prompt completions. Complete the user's partial input with a natural, helpful continuation. Return ONLY the completion text (not the original input), keeping it concise (1-2 sentences max).";

  let suggestion = '';
  try {
    const llmResponse = await LLMProviderFactory.sendRequest(provider, {
      model: completionModel,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: input },
      ],
      max_tokens: 150,
      temperature: 0.3,
      stream: false,
    });

    suggestion = llmResponse.content?.trim() ?? '';
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Completion LLM request failed',
    );
    // Return empty suggestion on failure rather than erroring out
    suggestion = '';
  }

  const latencyMs = Date.now() - startTime;

  const response: PromptCompletionResponse = {
    suggestion,
    model: completionModel,
    latency_ms: latencyMs,
  };

  return NextResponse.json(response);
}

export const POST = withErrorHandler(handleCompletion);

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { LLMProviderFactory } from '@/lib/llm-providers/factory';
import { handleCorsPreflightRequest } from '@/lib/cors';

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

  // Authentication via Bearer token
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw createError.unauthorized('Missing or invalid authorization header');
  }

  const token = authHeader.substring(7);

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  // Use service role key for server-side JWT verification — anon key cannot verify
  // JWT signatures server-side since it lacks the JWT secret.
  const supabase = createClient(supabaseUrl, requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    logger.warn({ error: authError }, 'Completion auth failed');
    throw createError.unauthorized('Invalid authentication token');
  }

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

  // Use a fast, cheap model for prompt completions
  const completionModel = 'claude-haiku-4.5';
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

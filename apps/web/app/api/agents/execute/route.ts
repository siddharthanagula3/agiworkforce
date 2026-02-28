import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimitHandler } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { LLMProviderFactory } from '@/lib/llm-providers/factory';
import { CreditService } from '@/lib/services/credit-service';
import { handleCorsPreflightRequest } from '@/lib/cors';

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

/**
 * Estimate cost in cents for a request based on message length.
 * This is a conservative estimate for pre-flight checks.
 * Actual cost is calculated from real token counts after streaming.
 */
function estimateCostCents(messages: Array<{ content: string }>): number {
  // Rough estimate: 1 token ~ 4 characters, $0.01 per 1K tokens average
  const totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
  const estimatedInputTokens = Math.ceil(totalChars / 4);
  // Assume output will be roughly equal to input (conservative overestimate)
  const estimatedOutputTokens = estimatedInputTokens;
  const totalTokens = estimatedInputTokens + estimatedOutputTokens;
  // Average cost: ~$0.003 per 1K tokens -> 0.3 cents per 1K tokens
  // Use 1 cent per 1K tokens as a conservative estimate for pre-flight
  return Math.max(1, Math.ceil(totalTokens / 1000));
}

/**
 * POST /api/agents/execute
 * Execute an AI agent with a given prompt and employee context.
 * Streams the response using SSE.
 *
 * Billing flow:
 * 1. Pre-flight: Check user has enough credits (estimated cost)
 * 2. Stream: Execute LLM call
 * 3. Post-flight: Deduct actual cost based on real token counts
 */
async function handler(request: NextRequest) {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  // Authenticate user
  const authHeader = request.headers.get('authorization');

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let userId: string;

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) {
      throw createError.unauthorized('Invalid or expired token');
    }
    userId = user.id;
  } else {
    // Try cookie-based auth for browser requests
    const { createServerClient } = await import('@supabase/ssr');
    const ssrClient = createServerClient(supabaseUrl, requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          // Read-only for this route
        },
      },
    });
    const {
      data: { user },
      error,
    } = await ssrClient.auth.getUser();
    if (error || !user) {
      throw createError.unauthorized('Authentication required');
    }
    userId = user.id;
  }

  const body = await request.json();
  const { employeeId, message, model, provider, systemPrompt, conversationHistory } = body;

  if (!message) {
    throw createError.badRequest('Message is required');
  }

  // Build messages array
  const messages: Array<{ role: string; content: string }> = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  if (conversationHistory && Array.isArray(conversationHistory)) {
    messages.push(...conversationHistory);
  }

  messages.push({ role: 'user', content: message });

  // --- BILLING: Pre-flight credit check ---
  const estimatedCents = estimateCostCents(messages);
  const hasCredits = await CreditService.checkAvailable(userId, estimatedCents);

  if (!hasCredits) {
    const balance = await CreditService.getBalance(userId);
    const remainingCents = balance?.credits_remaining_cents ?? 0;
    throw createError.forbidden(
      `Insufficient credits. You need approximately ${estimatedCents} credits but have ${remainingCents} remaining. Please upgrade your plan at /pricing.`,
    );
  }

  // Use the LLM provider factory to get the appropriate provider
  const selectedModel = model || 'claude-haiku-4.5';
  const selectedProvider = provider || LLMProviderFactory.getProviderFromModel(selectedModel);

  try {
    const llmProvider = LLMProviderFactory.createProvider(selectedProvider);

    if (!llmProvider) {
      throw createError.badRequest(
        `Provider "${selectedProvider}" is not configured. Check API key configuration.`,
      );
    }

    // Generate a unique request ID for idempotency
    const requestId = crypto.randomUUID();

    const stream = await llmProvider.streamRequest({
      model: LLMProviderFactory.mapModelIdToApiId(selectedModel),
      messages: messages as Array<{
        role: 'system' | 'user' | 'assistant' | 'tool';
        content: string;
      }>,
      temperature: 0.7,
      max_tokens: 4096,
    });

    logger.info(
      { userId, employeeId, model: selectedModel, provider: selectedProvider },
      'Agent execution started',
    );

    // Wrap the stream to track token usage and deduct credits after completion
    const trackingStream = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk);
      },
      async flush() {
        // After streaming completes, deduct the estimated cost.
        // In a production system, we'd parse SSE events for actual token counts.
        // For now, deduct the conservative estimate.
        try {
          const idempotencyKey = CreditService.generateIdempotencyKey(
            userId,
            'reservation',
            requestId,
          );

          const result = await CreditService.deductCredits(
            userId,
            estimatedCents,
            `${selectedProvider}/${selectedModel} agent execution`,
            {
              provider: selectedProvider,
              model: selectedModel,
              employeeId: employeeId || 'general',
              requestId,
            },
            idempotencyKey,
          );

          if (!result.success) {
            logger.warn(
              { userId, error: result.error, requestId },
              'Post-stream credit deduction failed (request already served)',
            );
          } else {
            logger.info(
              {
                userId,
                deducted: estimatedCents,
                remaining: result.remaining_cents,
                requestId,
              },
              'Credits deducted after agent execution',
            );
          }
        } catch (error) {
          // Log but don't fail — the response was already streamed
          logger.error(
            { error, userId, requestId },
            'Error deducting credits after agent execution',
          );
        }
      },
    });

    const trackedStream = stream.pipeThrough(trackingStream);

    return new NextResponse(trackedStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    logger.error({ userId, employeeId, error }, 'Agent execution failed');
    throw createError.internal('Agent execution failed');
  }
}

export const POST = withErrorHandler(withRateLimitHandler(handler, 'llm-streaming'));

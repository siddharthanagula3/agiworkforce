import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { readFile, access } from 'fs/promises';
import { join } from 'path';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimitHandler } from '@/lib/rate-limit';
import { createError, isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { LLMProviderFactory } from '@/lib/llm-providers/factory';
import { CreditService } from '@/lib/services/credit-service';
import { getAuthenticatedUserWithClient } from '@/lib/api-auth';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { getTaskModelForProvider } from '@agiworkforce/types';

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

const DEFAULT_EMPLOYEE_MODEL = getTaskModelForProvider('anthropic', 'chat') ?? 'claude-sonnet-4.6';

// H9: Zod validation schema for execute requests
const ExecuteRequestSchema = z.object({
  employeeId: z.string(),
  message: z.string().max(50000),
  systemPrompt: z.string().max(10000).optional(),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
      }),
    )
    .max(50)
    .optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
});

/**
 * Load the canonical system prompt for an employee from the filesystem.
 * Returns the markdown content after YAML frontmatter, or null if not found.
 */
async function loadEmployeeSystemPrompt(employeeId: string): Promise<string | null> {
  // Sanitize employeeId to prevent path traversal
  const sanitized = employeeId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (sanitized !== employeeId) {
    return null;
  }

  const filePath = join(process.cwd(), '.agi', 'employees', `${sanitized}.md`);
  try {
    await access(filePath);
  } catch {
    return null;
  }

  const content = await readFile(filePath, 'utf-8');

  // Extract content after YAML frontmatter (--- ... ---)
  const frontmatterMatch = content.match(/^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/);
  if (frontmatterMatch?.[1]) {
    return frontmatterMatch[1].trim();
  }

  // No frontmatter, use entire content
  return content.trim();
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
  // AUDIT-008-006: Enforce CSRF protection for credit-deducting endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  // Authenticate user. The userClient is RLS-bound so all CreditService ops
  // happen under the user's identity — no service-role escalation.
  let userId: string;
  let userClient;
  try {
    const auth = await getAuthenticatedUserWithClient(request);
    userId = auth.user.id;
    userClient = auth.userDb;
  } catch {
    throw createError.unauthorized('Authentication required');
  }

  // H9: Validate request body with Zod
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.badRequest('Invalid JSON in request body');
  }

  const validationResult = ExecuteRequestSchema.safeParse(body);
  if (!validationResult.success) {
    throw createError.badRequest(
      'Invalid request body: ' + validationResult.error.issues.map((i) => i.message).join(', '),
    );
  }

  const { employeeId, message, model, provider, systemPrompt, conversationHistory } =
    validationResult.data;

  // H10: Load canonical skill from filesystem - caller's systemPrompt is appended as context, never replaces
  const canonicalPrompt = await loadEmployeeSystemPrompt(employeeId);
  if (!canonicalPrompt) {
    throw createError.badRequest(`Employee "${employeeId}" not found`);
  }

  // Build messages array
  const messages: Array<{ role: string; content: string }> = [];

  // Use the server-loaded canonical system prompt
  messages.push({ role: 'system', content: canonicalPrompt });

  if (conversationHistory) {
    // H16: Prevent prompt injection via system-role entries in conversation history.
    // Remap any system-role messages to user-role so callers cannot override
    // the canonical system prompt loaded from the filesystem.
    const sanitizedHistory = conversationHistory.map((m) =>
      m.role === 'system' ? { ...m, role: 'user' as const } : m,
    );
    messages.push(...sanitizedHistory);
  }

  // If caller provided a systemPrompt, append it as additional user context (not system override)
  if (systemPrompt) {
    messages.push({ role: 'user', content: `[Additional context from caller]: ${systemPrompt}` });
  }

  messages.push({ role: 'user', content: message });

  // --- BILLING: Pre-flight credit check ---
  const estimatedCents = estimateCostCents(messages);
  const hasCredits = await CreditService.checkAvailable(userClient, userId, estimatedCents);

  if (!hasCredits) {
    const balance = await CreditService.getBalance(userClient, userId);
    const remainingCents = balance?.credits_remaining_cents ?? 0;
    throw createError.forbidden(
      `Insufficient credits. You need approximately ${estimatedCents} credits but have ${remainingCents} remaining. Please upgrade your plan at /pricing.`,
    );
  }

  // Use the LLM provider factory to get the appropriate provider
  const selectedModel = model || DEFAULT_EMPLOYEE_MODEL;
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
            userClient,
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
          // Log but don't fail - the response was already streamed
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
    // Re-throw AppErrors (400 BAD_REQUEST, 403 FORBIDDEN, etc.) with their original status
    if (isAppError(error)) throw error;
    logger.error({ userId, employeeId, error }, 'Agent execution failed');
    throw createError.internal('Agent execution failed');
  }
}

export const POST = withErrorHandler(withRateLimitHandler(handler, 'llm-streaming'));

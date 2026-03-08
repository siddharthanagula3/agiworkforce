import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { LLMProviderFactory } from '@/lib/llm-providers/factory';
import { CreditService } from '@/lib/services/credit-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';

/**
 * Mission Control API
 * Endpoint: POST /api/mission
 *
 * Accepts a natural-language mission from the user, decomposes it into a plan
 * of agent tasks, and returns an initial chat response plus the structured plan.
 *
 * Response shape:
 *   { missionId, plan, chatResponse, agents }
 */

export const maxDuration = 60;
export const runtime = 'nodejs';

const MissionRequestSchema = z.object({
  userId: z.string().min(1),
  input: z.string().min(1).max(10000),
  mode: z.literal('mission'),
  sessionId: z.string().optional(),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
      }),
    )
    .max(50)
    .optional(),
});

/** A single task within a mission plan. */
interface MissionTask {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  requiredAgent: string;
  domain: string;
  priority: number;
}

/** Mission Control API response. */
interface MissionResponse {
  missionId: string;
  plan: MissionTask[];
  chatResponse: string;
  agents: string[];
}

/**
 * Parse the LLM's JSON plan out of its text response.
 * Returns null if the response cannot be parsed.
 */
function parsePlanFromResponse(text: string): MissionTask[] | null {
  // Look for a JSON block in the response (```json ... ``` or bare [ ... ])
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/i);
  const jsonRaw = jsonBlockMatch?.[1]?.trim() ?? null;

  // Fall back to first JSON array in the response
  const fallbackMatch = !jsonRaw ? text.match(/\[[\s\S]*?\]/m) : null;

  const raw = jsonRaw ?? fallbackMatch?.[0] ?? null;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;

    return parsed.map((item: unknown, idx: number) => {
      const t = item as Record<string, unknown>;
      return {
        id: (t['id'] as string | undefined) ?? `task-${idx + 1}`,
        title: (t['title'] as string | undefined) ?? `Task ${idx + 1}`,
        description: (t['description'] as string | undefined) ?? '',
        status: 'pending' as const,
        requiredAgent: (t['requiredAgent'] as string | undefined) ?? 'general',
        domain: (t['domain'] as string | undefined) ?? 'general',
        priority: typeof t['priority'] === 'number' ? (t['priority'] as number) : idx + 1,
      };
    });
  } catch {
    return null;
  }
}

/**
 * Extract the human-readable chat message (everything outside the JSON block).
 */
function extractChatResponse(text: string): string {
  // Remove JSON code blocks from the response
  const stripped = text
    .replace(/```json[\s\S]*?```/gi, '')
    .replace(/```[\s\S]*?```/gi, '')
    .trim();

  if (stripped.length > 0) return stripped;

  // If everything was JSON, return a generic confirmation
  return 'Mission plan created. Starting execution…';
}

/**
 * Build the system prompt for mission decomposition.
 */
function buildMissionSystemPrompt(): string {
  return `You are an AI Mission Controller for AGI Workforce. Your role is to decompose complex user goals into structured task plans that can be executed by specialized AI agents.

When a user provides a mission:
1. Analyze the goal and break it into concrete, actionable tasks
2. Assign each task to the most appropriate agent type
3. Respond with BOTH a friendly explanation AND a JSON task plan

Always include a JSON code block with this exact structure:
\`\`\`json
[
  {
    "id": "task-1",
    "title": "Short task name",
    "description": "Detailed description of what needs to be done",
    "requiredAgent": "agent-type (e.g. code, research, writing, data, design)",
    "domain": "domain area (e.g. frontend, backend, content, analytics)",
    "priority": 1
  }
]
\`\`\`

Keep tasks focused and achievable. Typical missions have 3-7 tasks.
Before the JSON block, write a brief friendly acknowledgment of the mission.`;
}

async function handleMissionControl(request: NextRequest): Promise<NextResponse> {
  // CORS preflight
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) return preflightResponse;

  // CSRF protection
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  // Rate limiting — share the llm-completion bucket
  const rateLimitResponse = await withRateLimit(request, 'llm-completion');
  if (rateLimitResponse) return rateLimitResponse;

  // Authentication
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: { message: 'Missing or invalid authorization header', code: 'unauthorized' } },
      {
        status: 401,
        headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
      },
    );
  }

  const token = authHeader.substring(7);
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, flowType: 'pkce' },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json(
      { error: { message: 'Invalid authentication token', code: 'unauthorized' } },
      {
        status: 401,
        headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
      },
    );
  }

  // Validate subscription
  const subscription = await SubscriptionService.getSubscription(user.id);
  if (!subscription || !['active', 'trialing'].includes(subscription.status)) {
    throw createError.forbidden('An active subscription is required to use Mission Control.');
  }

  // Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  const validationResult = MissionRequestSchema.safeParse(body);
  if (!validationResult.success) {
    throw createError.validation('Invalid request body', validationResult.error);
  }

  const { input, conversationHistory } = validationResult.data;

  // Build messages for the LLM
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: buildMissionSystemPrompt() },
  ];

  if (conversationHistory) {
    for (const msg of conversationHistory) {
      if (msg.role !== 'system') {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }
  }

  messages.push({ role: 'user', content: input });

  // Estimate cost for pre-flight credit check
  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  const estimatedTokens = Math.ceil(totalChars / 3.5) + 500; // +500 for output buffer
  // Use claude-haiku-4.5 as the mission planner — cost-effective and fast
  const missionModel = 'claude-haiku-4.5';
  const missionProvider = 'anthropic';
  const estimatedCostCents = Math.max(
    1,
    Math.ceil((estimatedTokens * 2 * 0.001) / 1000), // rough: $0.001/1K tokens average
  );

  const hasCredits = await CreditService.checkAvailable(user.id, estimatedCostCents);
  if (!hasCredits) {
    const balance = await CreditService.getBalance(user.id);
    return NextResponse.json(
      {
        error: {
          message: 'Insufficient credits for mission planning. Please upgrade your plan.',
          code: 'insufficient_credits',
          credits_remaining: balance?.credits_remaining_cents ?? 0,
        },
      },
      {
        status: 402,
        headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
      },
    );
  }

  // Reserve credits
  const requestId = randomUUID();
  const reservationKey = CreditService.generateIdempotencyKey(user.id, 'reservation', requestId);
  const reserveResult = await CreditService.deductCredits(
    user.id,
    estimatedCostCents,
    `Credit reservation: mission control planning`,
    { provider: missionProvider, model: missionModel, type: 'reservation', requestId },
    reservationKey,
  );

  if (!reserveResult.success) {
    return NextResponse.json(
      {
        error: {
          message: 'Insufficient credits for mission planning.',
          code: reserveResult.code ?? 'insufficient_credits',
        },
      },
      {
        status: 402,
        headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
      },
    );
  }

  // Call the LLM to decompose the mission
  let llmResponseText: string;
  try {
    const llmResponse = await LLMProviderFactory.sendRequest(missionProvider, {
      model: missionModel,
      messages,
      temperature: 0.4,
      max_tokens: 2048,
    });
    llmResponseText = llmResponse.content;

    // Reconcile actual cost
    const { LLMCostCalculator } = await import('@/lib/services/llm-cost-calculator');
    const actualCostCents = LLMCostCalculator.calculateCost(missionProvider, missionModel, {
      promptTokens: llmResponse.promptTokens,
      completionTokens: llmResponse.completionTokens,
      totalTokens: llmResponse.totalTokens,
    });
    const costDiff = actualCostCents - estimatedCostCents;
    if (costDiff !== 0) {
      const reconcKey = CreditService.generateIdempotencyKey(user.id, 'reconciliation', requestId);
      await CreditService.deductCredits(
        user.id,
        costDiff,
        `Credit adjustment: mission control (${missionProvider}/${missionModel})`,
        { provider: missionProvider, model: missionModel, type: 'reconciliation', requestId },
        reconcKey,
      );
    }
  } catch (error) {
    // Refund reserved credits on failure
    const refundKey = CreditService.generateIdempotencyKey(user.id, 'refund', requestId);
    await CreditService.deductCredits(
      user.id,
      -estimatedCostCents,
      `Refund: mission control planning failed`,
      { type: 'refund', reason: 'llm_failure', requestId },
      refundKey,
    );
    logger.error({ error, userId: user.id, requestId }, 'Mission control LLM call failed');
    throw createError.internal('Failed to process mission. Please try again.');
  }

  // Parse the plan from the LLM response
  const plan = parsePlanFromResponse(llmResponseText) ?? [];
  const chatResponse = extractChatResponse(llmResponseText);

  // Derive the list of agent types involved
  const agents = Array.from(new Set(plan.map((t) => t.requiredAgent))).filter(Boolean);

  const missionId = `mission-${requestId}`;

  logger.info(
    { userId: user.id, missionId, taskCount: plan.length, agents },
    'Mission plan generated',
  );

  const response: MissionResponse = {
    missionId,
    plan,
    chatResponse,
    agents,
  };

  return NextResponse.json(response, {
    headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
  });
}

export const POST = withErrorHandler(handleMissionControl);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}

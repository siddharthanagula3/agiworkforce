import 'server-only';

import { classifyTaskLocally, resolveAutoRoute } from '@agiworkforce/routing';
import { openAIWireRequestToChatRequest } from '@agiworkforce/provider-protocol';
import { drainToLlmResponse } from '@/app/api/llm/v1/chat/completions/lib/adapter-response';
import { isFreePlanTier } from '@/lib/services/free-trial-service';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import {
  finalizeManagedUsageRequest,
  fingerprintManagedUsageRequest,
  markManagedUsageProviderStarted,
  reserveManagedUsageRequest,
} from '@/lib/services/managed-usage-request-service';
import {
  buildServerProviderAdapter,
  toGenericUpstreamError,
} from '@/lib/services/provider-adapter-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import type { ScheduleTask, ScheduledExecutionResult } from './schedule-service';

const MAX_PROMPT_LENGTH = 50_000;
const MAX_OUTPUT_CHARS = 100_000;
const MAX_OUTPUT_TOKENS = 4_096;
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);

function validateAgentTask(task: ScheduleTask): string {
  if (task.actionType !== 'agent') {
    throw new Error(`Unsupported scheduled action type: ${task.actionType}`);
  }
  const prompt = task.prompt?.trim();
  if (!prompt) throw new Error('Scheduled agent task has no prompt');
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new Error(`Scheduled agent prompt exceeds ${MAX_PROMPT_LENGTH} characters`);
  }
  return prompt;
}

/**
 * Execute the managed-cloud mechanics for one already-owned durable run.
 * Claiming, retries, terminal status, and recurrence advancement remain in
 * schedule-service; this module owns only provider execution and billing.
 */
export async function executeScheduledAgent(
  task: ScheduleTask,
  signal: AbortSignal,
  runId: string,
): Promise<ScheduledExecutionResult> {
  const prompt = validateAgentTask(task);
  signal.throwIfAborted();

  const subscription = await SubscriptionService.getSubscription(task.userId);
  const subscriptionTier = subscription?.plan_tier ?? 'free';
  if (
    subscription &&
    !ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status) &&
    !isFreePlanTier(subscription.plan_tier)
  ) {
    throw new Error('Scheduled execution requires an active subscription');
  }

  const taskType = classifyTaskLocally(prompt, []).type;
  const route = resolveAutoRoute({
    selection: task.model ?? 'auto-balanced',
    taskType,
    subscriptionTier,
    trustMode: 'managed_cloud',
    runtimeProfileId: 'web/cloud-chat',
  });
  if (route.status === 'unavailable') {
    throw new Error('The selected model is not available for scheduled managed execution');
  }
  if (route.harnessId.endsWith('/media')) {
    throw new Error('Scheduled media generation is unavailable');
  }

  const estimatedPromptTokens = Math.ceil(prompt.length / 3.5) + 32;
  const estimatedCostCents = LLMCostCalculator.estimateCost(
    route.provider,
    route.modelKey,
    estimatedPromptTokens,
    MAX_OUTPUT_TOKENS,
  );
  const idempotencyKey = `schedule-run:${runId}`;
  const requestHash = fingerprintManagedUsageRequest({
    kind: 'scheduled_agent_execution',
    taskId: task.id,
    runId,
    prompt,
    requestedModel: task.model,
    provider: route.provider,
    model: route.modelKey,
    providerModelId: route.providerModelId,
  });
  const reservation = await reserveManagedUsageRequest({
    db: getNeonDb(),
    userId: task.userId,
    idempotencyKey,
    requestHash,
    provider: route.provider,
    model: route.modelKey,
    estimatedCostCents,
    leaseSeconds: 120,
  });

  let providerCompleted = false;
  try {
    signal.throwIfAborted();
    await markManagedUsageProviderStarted(reservation);
    const adapter = buildServerProviderAdapter(route.provider);
    const chatRequest = openAIWireRequestToChatRequest({
      model: route.providerModelId,
      messages: [
        {
          role: 'system',
          content:
            'Complete the scheduled task now. Return the final result directly. Do not claim to have performed external actions unless a tool result proves it.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: MAX_OUTPUT_TOKENS,
      stream: false,
    });
    const wireMode =
      route.provider === 'anthropic' || route.provider === 'google'
        ? 'legacy-web'
        : 'openai-passthrough';
    const response = await drainToLlmResponse(
      adapter.stream(chatRequest, signal),
      route.modelKey,
      (chunk) => toGenericUpstreamError(route.provider, chunk),
      wireMode,
    );
    const text = response.content.trim();
    if (!text) throw new Error('Scheduled provider response contained no text');
    providerCompleted = true;

    const actualCostCents = LLMCostCalculator.calculateCost(route.provider, route.modelKey, {
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
      totalTokens: response.totalTokens,
      cacheReadInputTokens: response.cachedInputTokens,
      cacheCreationInputTokens: response.cacheCreationInputTokens,
      cacheCreation1hInputTokens: response.cacheCreation1hInputTokens,
    });
    const finalization = await finalizeManagedUsageRequest({
      ...reservation,
      outcome: 'completed',
      actualCostCents,
      usage: {
        type: 'scheduled_agent_execution',
        taskId: task.id,
        runId,
        provider: route.provider,
        model: route.modelKey,
        promptTokens: response.promptTokens,
        completionTokens: response.completionTokens,
        totalTokens: response.totalTokens,
      },
    });

    return {
      text: text.slice(0, MAX_OUTPUT_CHARS),
      model: route.modelKey,
      provider: route.provider,
      usage: {
        promptTokens: response.promptTokens,
        completionTokens: response.completionTokens,
        totalTokens: response.totalTokens,
        costCents: actualCostCents,
      },
      billingStatus: finalization.settlementStatus ?? finalization.requestStatus,
    };
  } catch (error) {
    if (!providerCompleted) {
      try {
        await finalizeManagedUsageRequest({
          ...reservation,
          outcome: 'failed',
          actualCostCents: 0,
          usage: {
            type: 'scheduled_agent_execution',
            taskId: task.id,
            runId,
            reason: error instanceof Error ? error.message : String(error),
          },
        });
      } catch (releaseError) {
        logger.error(
          { taskId: task.id, runId, error: releaseError },
          'Scheduled execution reservation release could not be persisted',
        );
      }
    }
    throw error;
  }
}

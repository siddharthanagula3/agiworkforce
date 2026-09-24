import 'server-only';

import { randomUUID } from 'node:crypto';
import { openAIWireRequestToChatRequest } from '@agiworkforce/provider-protocol';
import { resolveAutoRoute } from '@agiworkforce/routing';
import { resolveWireMode } from '@/app/api/llm/v1/chat/completions/lib/adapter-providers';
import { drainToLlmResponse } from '@/app/api/llm/v1/chat/completions/lib/adapter-response';
import {
  buildServerProviderAdapter,
  toGenericUpstreamError,
} from '@/lib/services/provider-adapter-service';
import { recordSettledProviderCost } from '@/lib/services/cogs-ledger-service';
import { dispatchProviderForSelectedRoute } from '@/lib/services/aggregator-routing';
import {
  lookupSemanticResponseCache,
  recordSemanticCacheHit,
  storeSemanticResponseCache,
  type SemanticCacheKeyFields,
  type SemanticCacheSafety,
} from '@/lib/services/semantic-response-cache-service';
import { resolvePrompt } from '@/lib/prompts/prompt-registry';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { assertNoLeaks } from '@/lib/leak-detector';
import { logger } from '@/lib/logger';
import { getOptionalEnv } from '@/shared/utils/env';
import { buildSupportSystemPrompt } from '../prompt/system-prompt';

const MAX_OUTPUT_TOKENS = 800;

export const SUPPORT_SYSTEM_PROMPT_ID = 'support.system';

/**
 * The support answer is drawn only from excerpts already inside the prompt, it
 * offers the model no tool, carries no attachment and samples at zero, so an
 * identical question over identical excerpts has one correct answer and a
 * repeat may be served from cache.
 */
const SUPPORT_CACHE_SAFETY: SemanticCacheSafety = {
  toolsOffered: false,
  attachmentsPresent: false,
  freshDataRequired: false,
  temperature: 0,
};

export type SupportModelResult =
  | { status: 'ok'; text: string; route: { provider: string; modelKey: string } }
  | {
      status: 'unavailable';
      reason: 'disabled' | 'no_route' | 'provider_error' | 'empty_response' | 'prompt_rejected';
      route: { provider: string; modelKey: string } | null;
    };

export function isSupportAgentEnabled(): boolean {
  const raw = getOptionalEnv('SUPPORT_AGENT_ENABLED');
  if (raw === undefined) return false;
  return ['1', 'true', 'on', 'yes'].includes(raw.trim().toLowerCase());
}

export interface SupportModelCallInput {
  userMessage: string;
  planTier: string | null;
  userId: string | null;
  surface: 'app' | 'marketing';
  signal?: AbortSignal;
}

export async function callSupportModel(input: SupportModelCallInput): Promise<SupportModelResult> {
  if (!isSupportAgentEnabled()) {
    return { status: 'unavailable', reason: 'disabled', route: null };
  }

  const route = resolveAutoRoute({
    selection: 'auto',
    taskType: 'simple_chat',
    subscriptionTier: input.planTier ?? 'free',
    trustMode: 'managed_cloud',
    runtimeProfileId: 'web/cloud-chat',
  });
  if (route.status === 'unavailable') {
    logger.warn({ code: route.code }, '[support-agent] no managed route available');
    return { status: 'unavailable', reason: 'no_route', route: null };
  }

  const routeInfo = { provider: route.provider, modelKey: route.modelKey };
  const dispatchProvider = dispatchProviderForSelectedRoute(route);
  const prompt = resolvePrompt(SUPPORT_SYSTEM_PROMPT_ID);
  const system = buildSupportSystemPrompt();
  const cacheFields: SemanticCacheKeyFields = {
    callType: 'support-answer',
    tenantId: input.userId ?? 'anonymous',
    provider: route.provider,
    modelId: route.modelKey,
    routeId: route.routeId,
    promptStamps: [prompt.stamp],
    systemPrompt: system,
    input: input.userMessage,
  };

  try {
    assertNoLeaks('support-agent-prompt', { system, user: input.userMessage });
  } catch {
    logger.error('[support-agent] prompt rejected by leak detector');
    return { status: 'unavailable', reason: 'prompt_rejected', route: routeInfo };
  }

  const chatRequest = openAIWireRequestToChatRequest({
    model: route.providerModelId,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: input.userMessage },
    ],
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: 0,
    stream: false,
  });

  const wireMode = resolveWireMode(dispatchProvider);

  const cached = await lookupSemanticResponseCache(cacheFields, SUPPORT_CACHE_SAFETY);
  if (cached.outcome === 'hit' && cached.entry) {
    await recordSemanticCacheHit({
      userId: input.userId ?? 'anonymous',
      provider: route.provider,
      modelId: route.modelKey,
      routeId: route.routeId,
      surface: input.surface,
      sourceRef: `support-cache:${randomUUID()}`,
      promptStamps: [prompt.stamp],
      usage: cached.entry.usage,
    });
    return { status: 'ok', text: cached.entry.content, route: routeInfo };
  }

  try {
    const response = await drainToLlmResponse(
      adapterStream(dispatchProvider, chatRequest, input.signal),
      route.modelKey,
      (chunk) => toGenericUpstreamError(dispatchProvider, chunk),
      wireMode,
    );
    const usage = {
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
      totalTokens: response.totalTokens,
      cacheReadInputTokens: response.cachedInputTokens,
      cacheCreationInputTokens: response.cacheCreationInputTokens,
      cacheCreation1hInputTokens: response.cacheCreation1hInputTokens,
    };
    await recordSettledProviderCost({
      userId: input.userId ?? 'anonymous',
      provider: route.provider,
      model: route.modelKey,
      routeId: route.routeId,
      actualCostCents: LLMCostCalculator.calculateCost(
        route.provider,
        route.modelKey,
        usage,
        undefined,
        route.routeId,
      ),
      sourceRef: `support:${randomUUID()}`,
      taskOutcome: 'delivered',
      surface: input.surface,
      customerCanonicalMicrousd: 0,
      usage,
      promptIds: [prompt.stamp],
    });

    const text = response.content.trim();
    if (!text) return { status: 'unavailable', reason: 'empty_response', route: routeInfo };
    await storeSemanticResponseCache(
      cacheFields,
      {
        content: text,
        usage: {
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          cachedInputTokens: usage.cacheReadInputTokens,
        },
      },
      SUPPORT_CACHE_SAFETY,
    );
    return { status: 'ok', text, route: routeInfo };
  } catch (error) {
    logger.error(
      {
        provider: route.provider,
        error: error instanceof Error ? error.message : String(error),
      },
      '[support-agent] provider call failed',
    );
    return { status: 'unavailable', reason: 'provider_error', route: routeInfo };
  }
}

function adapterStream(
  provider: string,
  chatRequest: ReturnType<typeof openAIWireRequestToChatRequest>,
  signal: AbortSignal | undefined,
): ReturnType<ReturnType<typeof buildServerProviderAdapter>['stream']> {
  const adapter = buildServerProviderAdapter(provider);
  return adapter.stream(chatRequest, signal ?? new AbortController().signal);
}

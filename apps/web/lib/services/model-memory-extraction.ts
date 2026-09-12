import 'server-only';

/**
 * Model-backed auto-memory extraction, behind a kill-switch that is OFF.
 *
 * The pattern extractor in `@agiworkforce/agent-core` only finds the phrasings
 * it was written for, so "I just moved to Berlin" is lost. Reading the turn
 * with a model finds it, but that is one extra provider call per eligible turn
 * and the per-turn spend is a founder decision, not an engineering one. So the
 * capability is built and wired and stays dark until `AGI_MODEL_MEMORY_EXTRACTION`
 * is set: with the flag unset this module is never entered and memory behaves
 * exactly as it does today.
 *
 * The call is made on the cheapest managed utility route, the same primitive
 * the conversation titler uses, so it never rides the requester's paid model
 * access and never inherits a flagship price.
 */

import { randomUUID } from 'node:crypto';
import {
  extractCandidateMemoryFacts,
  extractMemoryFactsWithModel,
  isMemoryExtractionWorthwhile,
} from '@agiworkforce/agent-core';
import { openAIWireRequestToChatRequest } from '@agiworkforce/provider-protocol';
import { resolveAutoRoute } from '@agiworkforce/routing';
import { resolveWireMode } from '@/app/api/llm/v1/chat/completions/lib/adapter-providers';
import { drainToLlmResponse } from '@/app/api/llm/v1/chat/completions/lib/adapter-response';
import {
  buildServerProviderAdapter,
  toGenericUpstreamError,
} from '@/lib/services/provider-adapter-service';
import { recordSettledProviderCost } from '@/lib/services/cogs-ledger-service';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { logger } from '@/lib/logger';

export const MODEL_MEMORY_EXTRACTION_ENV = 'AGI_MODEL_MEMORY_EXTRACTION';

/** Matches the pattern path's own `slice(0, 5)`, so the flag cannot widen the write. */
export const MAX_AUTO_MEMORY_FACTS = 5;

/**
 * A list of five short sentences. The cap is generous enough for a reasoning
 * model's preamble to be cut off rather than to arrive as prose the validator
 * would have to refuse.
 */
const MAX_OUTPUT_TOKENS = 256;

/**
 * The turn is already answered when this runs, so the deadline only bounds how
 * long the invocation is held open afterwards.
 */
const EXTRACTION_TIMEOUT_MS = 6000;

/**
 * Default off. Same reader shape as `AGI_EVENT_ENABLED`: only an explicit
 * on-value engages it, so a typo or an empty deployment variable leaves the
 * pattern extractor in charge and spends nothing.
 */
export function isModelMemoryExtractionEnabled(): boolean {
  const raw = process.env[MODEL_MEMORY_EXTRACTION_ENV]?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}

export interface ModelAutoMemoryExtractionInput {
  message: string;
  userId: string;
  organizationId: string | null;
  requestId?: string;
}

function patternFacts(message: string): string[] {
  return extractCandidateMemoryFacts(message).slice(0, MAX_AUTO_MEMORY_FACTS);
}

/**
 * Returns the candidates for this turn. Every failure, including no managed
 * route at all, resolves to the pattern candidates rather than to an empty
 * list, because a broken extractor must not silently stop memory from learning.
 */
export async function extractAutoMemoryFactsWithModel(
  input: ModelAutoMemoryExtractionInput,
): Promise<string[]> {
  // Checked here as well as inside agent-core so that an unworthwhile turn does
  // not even resolve a route or touch the registry.
  if (!isMemoryExtractionWorthwhile(input.message)) return patternFacts(input.message);

  const route = resolveAutoRoute({
    selection: 'auto',
    taskType: 'simple_chat',
    subscriptionTier: 'free',
    trustMode: 'managed_cloud',
    runtimeProfileId: 'web/cloud-chat',
  });
  if (route.status === 'unavailable') {
    logger.warn(
      { code: route.code, userId: input.userId, requestId: input.requestId },
      '[memory-extraction] no managed utility route; keeping the pattern candidates',
    );
    return patternFacts(input.message);
  }
  const wireMode = resolveWireMode(route.provider);

  const result = await extractMemoryFactsWithModel(input.message, {
    timeoutMs: EXTRACTION_TIMEOUT_MS,
    maxFacts: MAX_AUTO_MEMORY_FACTS,
    onFallback: (reason) => {
      if (reason === 'not_worthwhile') return;
      logger.warn(
        { reason, provider: route.provider, userId: input.userId, requestId: input.requestId },
        '[memory-extraction] fell back to the pattern candidates',
      );
    },
    runner: async ({ systemPrompt, message }, signal) => {
      const chatRequest = openAIWireRequestToChatRequest({
        model: route.providerModelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0,
        stream: false,
      });
      const adapter = buildServerProviderAdapter(route.provider);
      const response = await drainToLlmResponse(
        adapter.stream(chatRequest, signal),
        route.modelKey,
        (chunk) => toGenericUpstreamError(route.provider, chunk),
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
      // Recorded as cost of goods with nothing charged to the customer: when
      // the founder turns this on, the spend has to be visible on the very
      // first turn rather than discovered on an invoice. A ledger failure is
      // logged rather than thrown, because the provider call already happened
      // and discarding its facts would not unspend it.
      try {
        await recordSettledProviderCost({
          userId: input.userId,
          organizationId: input.organizationId,
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
          sourceRef: `memory-extraction:${input.requestId ?? randomUUID()}`,
          taskOutcome: 'delivered',
          surface: 'memory_extraction',
          customerCanonicalMicrousd: 0,
          usage,
        });
      } catch (error) {
        logger.warn(
          { error, userId: input.userId, requestId: input.requestId },
          '[memory-extraction] provider cost was not recorded',
        );
      }

      return response.content;
    },
  });

  return result.facts;
}

import 'server-only';

import { LLMProviderRequest } from './llm-providers/base';

/**
 * Determines if prompt caching should be enabled for a request
 * Caching is beneficial when:
 * 1. System prompt is large (>1000 tokens = ~4000 chars)
 * 2. Context will be reused (documents, RAG)
 * 3. Using Anthropic Claude or OpenAI models
 */
export function shouldEnablePromptCache(request: LLMProviderRequest, model: string): boolean {
  // Only support Anthropic Claude and OpenAI models
  const modelLower = model.toLowerCase();
  const supportsCaching = modelLower.includes('claude-') || modelLower.includes('gpt-');

  if (!supportsCaching) {
    return false;
  }

  // Find system message
  const systemMessage = request.messages.find((msg) => msg.role === 'system');
  if (!systemMessage) {
    return false;
  }

  // Estimate tokens: ~1 token per 4 characters
  const estimatedTokens = Math.ceil(systemMessage.content.length / 4);

  // Enable caching if system prompt is substantial (>1000 tokens)
  // This ensures cache write cost is justified by reuse
  if (estimatedTokens > 1000) {
    return true;
  }

  // Also enable for document/RAG queries (indicated by certain patterns)
  const isDocumentQuery =
    systemMessage.content.includes('document') ||
    systemMessage.content.includes('context:') ||
    systemMessage.content.includes('passage') ||
    systemMessage.content.includes('excerpt') ||
    systemMessage.content.toLowerCase().includes('rag');

  if (isDocumentQuery && estimatedTokens > 500) {
    return true;
  }

  return false;
}

/**
 * Calculate potential savings from prompt caching
 */
export function calculateCacheSavings(
  response: {
    cacheCreationInputTokens?: number;
    cachedInputTokens?: number;
    promptTokens?: number;
  },
  inputCostPerMtok: number,
): {
  tokensSavedByCache: number;
  savedCostCents: number;
  cacheWriteCostCents: number;
} {
  const cachedTokens = response.cachedInputTokens || 0;
  const cacheWriteTokens = response.cacheCreationInputTokens || 0;

  // Cached tokens cost 10% of normal price
  const normalCostCents = (cachedTokens * inputCostPerMtok) / 100;
  const cachedCostCents = (cachedTokens * inputCostPerMtok * 0.1) / 100;
  const savedCostCents = normalCostCents - cachedCostCents;

  // Cache write costs 25% extra
  const cacheWriteCostCents = (cacheWriteTokens * inputCostPerMtok * 0.25) / 100;

  return {
    tokensSavedByCache: cachedTokens,
    savedCostCents: Math.round(savedCostCents),
    cacheWriteCostCents: Math.round(cacheWriteCostCents),
  };
}

/**
 * Log cache analytics for monitoring
 */
export function logCacheAnalytics(
  userId: string,
  model: string,
  provider: string,
  response: {
    cacheCreationInputTokens?: number;
    cachedInputTokens?: number;
    promptTokens?: number;
  },
  savings: ReturnType<typeof calculateCacheSavings>,
): void {
  // Only log if caching was used
  if (response.cacheCreationInputTokens || response.cachedInputTokens) {
    console.log('[CACHE_ANALYTICS]', {
      userId,
      model,
      provider,
      cacheWriteTokens: response.cacheCreationInputTokens || 0,
      cachedTokens: response.cachedInputTokens || 0,
      totalPromptTokens: response.promptTokens || 0,
      savedCostCents: savings.savedCostCents,
      cacheWriteCostCents: savings.cacheWriteCostCents,
      timestamp: new Date().toISOString(),
    });
  }
}

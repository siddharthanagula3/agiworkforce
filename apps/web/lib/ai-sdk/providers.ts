import 'server-only';

/**
 * AI SDK v6 Provider Instances
 *
 * Creates Vercel AI SDK v6 provider instances for Anthropic, OpenAI, and Google.
 * This is a parallel path to the existing LLMProviderFactory - it does NOT replace it.
 * Use these helpers in /api/llm/v2 to opt into the AI SDK code path.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import { getOptionalEnv } from '@/utils/env';

// ---------------------------------------------------------------------------
// Provider option interfaces
// ---------------------------------------------------------------------------

export interface AnthropicProviderOptions {
  thinking?: { type: 'enabled' | 'disabled'; budgetTokens?: number };
  effort?: 'low' | 'medium' | 'high';
  contextManagement?: 'auto' | 'manual';
}

export interface OpenAIProviderOptions {
  reasoningEffort?: 'low' | 'medium' | 'high';
  reasoningSummary?: 'auto' | 'concise' | 'detailed' | 'none';
  serviceTier?: 'auto' | 'default' | 'flex';
}

export interface GoogleProviderOptions {
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Build the `providerOptions.anthropic` object to pass to `streamText`.
 *
 * AI SDK v6: per-call Anthropic settings (thinking, effort, contextManagement,
 * betas) must be supplied via `providerOptions` in `streamText`, NOT in the
 * `provider(modelId)` factory call.
 *
 * @example
 * const result = streamText({
 *   model: getAnthropicModel(modelId),
 *   providerOptions: buildAnthropicProviderOptions(options),
 * });
 */
export function buildAnthropicProviderOptions(
  options?: AnthropicProviderOptions & { betas?: string[] },
): ProviderOptions | undefined {
  if (!options) return undefined;

  const anthropic: Record<string, any> = {};

  if (options.thinking) {
    anthropic['thinking'] = {
      type: options.thinking.type,
      ...(options.thinking.budgetTokens !== undefined
        ? { budget_tokens: options.thinking.budgetTokens }
        : {}),
    };
  }

  if (options.effort) {
    anthropic['effort'] = options.effort;
  }

  if (options.contextManagement) {
    anthropic['contextManagement'] = options.contextManagement;
  }

  if (options.betas && options.betas.length > 0) {
    anthropic['betas'] = options.betas;
  }

  return Object.keys(anthropic).length > 0 ? { anthropic } : undefined;
}

/**
 * Build the `providerOptions.openai` object to pass to `streamText`.
 *
 * AI SDK v6: per-call OpenAI settings (reasoningEffort, reasoningSummary,
 * serviceTier) must be supplied via `providerOptions` in `streamText`.
 */
export function buildOpenAIProviderOptions(
  options?: OpenAIProviderOptions,
): ProviderOptions | undefined {
  if (!options) return undefined;

  const openai: Record<string, any> = {};

  if (options.reasoningEffort) openai['reasoningEffort'] = options.reasoningEffort;
  if (options.reasoningSummary) openai['reasoningSummary'] = options.reasoningSummary;
  if (options.serviceTier) openai['serviceTier'] = options.serviceTier;

  return Object.keys(openai).length > 0 ? { openai } : undefined;
}

export function getAnthropicModel(modelId: string, apiKey?: string): LanguageModel {
  const provider = createAnthropic({
    apiKey: apiKey ?? getOptionalEnv('ANTHROPIC_API_KEY'),
    ...(getOptionalEnv('ANTHROPIC_BASE_URL')
      ? { baseURL: getOptionalEnv('ANTHROPIC_BASE_URL') }
      : {}),
  });

  // AI SDK v6: provider(modelId) - per-call settings go via providerOptions in streamText
  return provider(modelId);
}

export function getOpenAIModel(modelId: string, apiKey?: string): LanguageModel {
  const provider = createOpenAI({
    apiKey: apiKey ?? getOptionalEnv('OPENAI_API_KEY'),
    ...(getOptionalEnv('OPENAI_BASE_URL') ? { baseURL: getOptionalEnv('OPENAI_BASE_URL') } : {}),
  });
  return provider(modelId);
}

export function getGoogleModel(modelId: string, apiKey?: string): LanguageModel {
  const provider = createGoogleGenerativeAI({
    apiKey: apiKey ?? getOptionalEnv('GOOGLE_API_KEY'),
    ...(getOptionalEnv('GOOGLE_BASE_URL') ? { baseURL: getOptionalEnv('GOOGLE_BASE_URL') } : {}),
  });
  return provider(modelId);
}

// ---------------------------------------------------------------------------
// Provider detection helper
// ---------------------------------------------------------------------------

export type AiSdkProvider = 'anthropic' | 'openai' | 'google';

export function detectAiSdkProvider(modelId: string): AiSdkProvider | null {
  const m = modelId.toLowerCase();
  if (m.includes('claude-')) return 'anthropic';
  if (m.includes('gpt-') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4'))
    return 'openai';
  if (m.includes('gemini-')) return 'google';
  return null;
}

export function getModelForProvider(
  provider: AiSdkProvider,
  modelId: string,
  apiKey?: string,
): LanguageModel {
  switch (provider) {
    case 'anthropic':
      return getAnthropicModel(modelId, apiKey);
    case 'openai':
      return getOpenAIModel(modelId, apiKey);
    case 'google':
      return getGoogleModel(modelId, apiKey);
  }
}

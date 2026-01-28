import 'server-only';

import { getOptionalEnv } from '@/utils/env';
import { BaseLLMProvider, LLMProviderRequest, LLMProviderResponse } from './base';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { GoogleProvider } from './google';
import { XAIProvider } from './xai';
import { QwenProvider } from './qwen';
import { MoonshotProvider } from './moonshot';
import { DeepSeekProvider } from './deepseek';
import { PerplexityProvider } from './perplexity';
import { ZhipuProvider } from './zhipu';
import { logger } from '@/lib/logger';
import { shouldEnablePromptCache } from '@/lib/prompt-cache-helper';

/**
 * Maps internal model IDs to actual provider API model IDs.
 * Internal IDs are user-friendly names used in the frontend.
 * API IDs are the exact strings required by each provider's API.
 */
const MODEL_ID_TO_API_ID: Record<string, string> = {
  // Google Gemini models
  'gemini-3-ultra': 'gemini-2.0-pro-exp', // Gemini 3 Ultra maps to 2.0 Pro
  'gemini-3-pro': 'gemini-2.0-pro-exp', // Gemini 3 Pro maps to 2.0 Pro
  'gemini-3-flash': 'gemini-2.0-flash-exp', // Gemini 3 Flash maps to 2.0 Flash
  // Anthropic Claude models
  'claude-opus-4.5': 'claude-sonnet-4-20250514', // Claude Opus 4.5 (placeholder - update when released)
  'claude-sonnet-4.5': 'claude-sonnet-4-20250514', // Claude Sonnet 4.5
  'claude-haiku-4.5': 'claude-haiku-4-20250514', // Claude Haiku 4.5
  // OpenAI models
  'gpt-5.2': 'gpt-4o', // GPT-5.2 maps to GPT-4o (placeholder)
  'gpt-5-pro': 'gpt-4o', // GPT-5 Pro maps to GPT-4o (placeholder)
  'gpt-5-nano': 'gpt-4o-mini', // GPT-5 Nano maps to GPT-4o Mini
  o3: 'o1', // o3 maps to o1 (placeholder)
  // xAI Grok models
  'grok-4.1': 'grok-2-latest', // Grok 4.1 maps to Grok 2
  'grok-4.1-fast-reasoning': 'grok-2-latest', // Grok Fast
  'grok-4.1-mini': 'grok-2-latest', // Grok Mini
  // DeepSeek models
  'deepseek-v3.2': 'deepseek-chat', // DeepSeek V3.2 maps to deepseek-chat
  'deepseek-r1': 'deepseek-reasoner', // DeepSeek R1 reasoning model
  // Qwen models
  'qwen3-max': 'qwen-max', // Qwen3 Max
  'qwen3-coder-plus': 'qwen-coder-plus', // Qwen3 Coder Plus
  'qwen3-coder-flash': 'qwen-coder-turbo', // Qwen3 Coder Flash
  'qwen-turbo': 'qwen-turbo', // Already correct
  'qwen-flash': 'qwen-turbo', // Qwen Flash maps to turbo
  // Moonshot/Kimi models
  'kimi-k2.5-thinking': 'moonshot-v1-128k', // Kimi K2.5 Thinking
  'kimi-k2.5-turbo': 'moonshot-v1-32k', // Kimi K2.5 Turbo
  // Perplexity models
  sonar: 'sonar', // Already correct
  'sonar-pro': 'sonar-pro', // Already correct
  'sonar-reasoning': 'sonar-reasoning', // Already correct
  'sonar-deep-research': 'sonar-deep-research', // Already correct
  // ZhipuAI GLM models
  'glm-4.7': 'glm-4-plus', // GLM-4.7 maps to glm-4-plus
  'glm-4.6v': 'glm-4v-plus', // GLM-4.6V vision model
  'glm-4.6v-flash': 'glm-4v-flash', // GLM-4.6V Flash
};

// Diagnostic: Log which API keys are configured on first access
let diagnosticsLogged = false;
function logProviderDiagnostics() {
  if (diagnosticsLogged) return;
  diagnosticsLogged = true;

  const providers = [
    'openai',
    'anthropic',
    'google',
    'xai',
    'qwen',
    'moonshot',
    'deepseek',
    'perplexity',
    'zhipu',
  ];
  const envKeyMap: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    google: 'GOOGLE_API_KEY',
    xai: 'XAI_API_KEY',
    qwen: 'QWEN_API_KEY',
    moonshot: 'MOONSHOT_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    perplexity: 'PERPLEXITY_API_KEY',
    zhipu: 'ZHIPU_API_KEY',
  };

  const status: Record<string, string> = {};
  for (const p of providers) {
    const envKey = envKeyMap[p];
    const value = process.env[envKey];
    if (value) {
      // Show first 8 and last 4 chars for debugging (safe for API keys)
      const masked =
        value.length > 12
          ? `${value.substring(0, 8)}...${value.substring(value.length - 4)}`
          : '[short key]';
      status[p] = `configured (${masked})`;
    } else {
      status[p] = 'NOT CONFIGURED';
    }
  }

  logger.info({ providerStatus: status }, 'LLM Provider API Key Status');
}

export class LLMProviderFactory {
  static createProvider(provider: string, apiKey?: string): BaseLLMProvider | null {
    const providerLower = provider.toLowerCase();

    // Log diagnostics on first provider creation attempt
    logProviderDiagnostics();

    // Get API key from parameter or environment
    const key = apiKey || this.getProviderApiKey(providerLower);

    if (!key) {
      const envKey = this.getEnvKeyForProvider(providerLower);
      logger.error(
        {
          provider,
          envKey,
          envKeyPresent: !!process.env[envKey || ''],
          allEnvKeysLoaded: Object.keys(process.env).filter((k) => k.includes('API_KEY')).length,
        },
        `No API key found for provider "${provider}". Expected env var: ${envKey}`,
      );
      return null;
    }

    logger.debug(
      { provider, keyLength: key.length, keyPrefix: key.substring(0, 8) },
      'Creating provider with API key',
    );

    // Get custom base URL if available (for providers like Qwen using MuleRouter)
    const baseUrl = this.getProviderBaseUrl(providerLower);

    switch (providerLower) {
      case 'openai':
        return new OpenAIProvider(key, baseUrl);
      case 'anthropic':
        return new AnthropicProvider(key, baseUrl);
      case 'google':
        return new GoogleProvider(key, baseUrl);
      case 'xai':
        return new XAIProvider(key, baseUrl);
      case 'qwen':
        return new QwenProvider(key, baseUrl);
      case 'moonshot':
        return new MoonshotProvider(key, baseUrl);
      case 'deepseek':
        return new DeepSeekProvider(key, baseUrl);
      case 'perplexity':
        return new PerplexityProvider(key, baseUrl);
      case 'zhipu':
        return new ZhipuProvider(key, baseUrl);
      default:
        logger.warn({ provider }, 'Unknown provider');
        return null;
    }
  }

  private static getProviderBaseUrl(provider: string): string | undefined {
    const envKeyMap: Record<string, string> = {
      qwen: 'QWEN_BASE_URL',
      openai: 'OPENAI_BASE_URL',
      anthropic: 'ANTHROPIC_BASE_URL',
      google: 'GOOGLE_BASE_URL',
      xai: 'XAI_BASE_URL',
      moonshot: 'MOONSHOT_BASE_URL',
      deepseek: 'DEEPSEEK_BASE_URL',
      perplexity: 'PERPLEXITY_BASE_URL',
      zhipu: 'ZHIPU_BASE_URL',
    };

    const envKey = envKeyMap[provider.toLowerCase()];
    if (!envKey) {
      return undefined;
    }

    return getOptionalEnv(envKey);
  }

  private static getEnvKeyForProvider(provider: string): string | undefined {
    const envKeyMap: Record<string, string> = {
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      google: 'GOOGLE_API_KEY',
      xai: 'XAI_API_KEY',
      qwen: 'QWEN_API_KEY',
      moonshot: 'MOONSHOT_API_KEY',
      deepseek: 'DEEPSEEK_API_KEY',
      perplexity: 'PERPLEXITY_API_KEY',
      zhipu: 'ZHIPU_API_KEY',
    };
    return envKeyMap[provider.toLowerCase()];
  }

  private static getProviderApiKey(provider: string): string | undefined {
    const envKey = this.getEnvKeyForProvider(provider);
    if (!envKey) {
      return undefined;
    }

    return getOptionalEnv(envKey);
  }

  /**
   * Route request to appropriate provider based on model name
   */
  static getProviderFromModel(model: string): string {
    const modelLower = model.toLowerCase();

    if (modelLower.includes('gpt-')) {
      return 'openai';
    }
    if (modelLower.includes('claude-')) {
      return 'anthropic';
    }
    if (modelLower.includes('gemini-')) {
      return 'google';
    }
    if (modelLower.includes('grok-')) {
      return 'xai';
    }
    if (modelLower.includes('qwen')) {
      return 'qwen';
    }
    if (modelLower.includes('kimi')) {
      return 'moonshot';
    }
    if (modelLower.includes('deepseek')) {
      return 'deepseek';
    }
    if (modelLower.includes('sonar')) {
      return 'perplexity';
    }
    if (modelLower.includes('glm-')) {
      return 'zhipu';
    }

    // Default to OpenAI
    return 'openai';
  }

  /**
   * Map internal model ID to the actual API model ID required by the provider.
   * Returns the original model ID if no mapping exists.
   */
  static mapModelIdToApiId(modelId: string): string {
    const modelLower = modelId.toLowerCase();
    const mappedId = MODEL_ID_TO_API_ID[modelLower];
    if (mappedId) {
      logger.debug({ internalId: modelId, apiId: mappedId }, 'Mapped model ID to API ID');
      return mappedId;
    }
    // No mapping found - return original (it might already be an API ID)
    return modelId;
  }

  /**
   * Send request using appropriate provider
   * Automatically enables prompt caching for compatible models with large system prompts
   */
  static async sendRequest(
    provider: string,
    request: LLMProviderRequest,
    apiKey?: string,
  ): Promise<LLMProviderResponse> {
    const providerInstance = this.createProvider(provider, apiKey);

    if (!providerInstance) {
      const envKey = this.getEnvKeyForProvider(provider);
      throw new Error(
        `Provider "${provider}" is not configured. ` +
          `Please ensure the ${envKey} environment variable is set. ` +
          `Check your .env.local file or deployment environment variables.`,
      );
    }

    // Map internal model ID to actual API model ID
    const apiModelId = this.mapModelIdToApiId(request.model);

    // Auto-enable prompt caching for large system prompts (RAG, documents, etc.)
    // This is beneficial for Anthropic Claude and OpenAI models
    const requestWithCache: LLMProviderRequest = {
      ...request,
      model: apiModelId, // Use mapped API model ID
      usePromptCache:
        request.usePromptCache !== false && shouldEnablePromptCache(request, request.model),
    };

    try {
      logger.debug(
        { provider, model: apiModelId, originalModel: request.model },
        'Sending LLM request',
      );
      const response = await providerInstance.sendRequest(requestWithCache);
      logger.debug(
        { provider, model: response.model, tokens: response.totalTokens },
        'LLM request successful',
      );
      return response;
    } catch (error) {
      // Enhance error message with provider context
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        { provider, model: request.model, error: errorMessage },
        `LLM request failed for ${provider}`,
      );

      // Check for common error patterns and provide helpful messages
      if (
        errorMessage.includes('401') ||
        errorMessage.includes('Unauthorized') ||
        errorMessage.includes('invalid_api_key')
      ) {
        throw new Error(
          `Authentication failed for ${provider}: The API key appears to be invalid or expired. Please check your ${this.getEnvKeyForProvider(provider)} environment variable.`,
        );
      }
      if (errorMessage.includes('429') || errorMessage.includes('rate_limit')) {
        throw new Error(
          `Rate limit exceeded for ${provider}: Too many requests. Please wait and try again.`,
        );
      }
      if (errorMessage.includes('500') || errorMessage.includes('503')) {
        throw new Error(`${provider} service is temporarily unavailable. Please try again later.`);
      }

      // Re-throw with context
      throw new Error(`${provider} API error: ${errorMessage}`);
    }
  }

  /**
   * Send streaming request using appropriate provider
   */
  static async streamRequest(
    provider: string,
    request: LLMProviderRequest,
    apiKey?: string,
  ): Promise<ReadableStream> {
    const providerInstance = this.createProvider(provider, apiKey);

    if (!providerInstance) {
      const envKey = this.getEnvKeyForProvider(provider);
      throw new Error(
        `Provider "${provider}" is not configured. ` +
          `Please ensure the ${envKey} environment variable is set. ` +
          `Check your .env.local file or deployment environment variables.`,
      );
    }

    // Map internal model ID to actual API model ID
    const apiModelId = this.mapModelIdToApiId(request.model);
    const mappedRequest: LLMProviderRequest = {
      ...request,
      model: apiModelId,
    };

    try {
      logger.debug(
        { provider, model: apiModelId, originalModel: request.model },
        'Starting LLM streaming request',
      );
      const stream = await providerInstance.streamRequest(mappedRequest);
      logger.debug({ provider, model: request.model }, 'LLM streaming started');
      return stream;
    } catch (error) {
      // Enhance error message with provider context
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        { provider, model: request.model, error: errorMessage },
        `LLM streaming request failed for ${provider}`,
      );

      // Check for common error patterns and provide helpful messages
      if (
        errorMessage.includes('401') ||
        errorMessage.includes('Unauthorized') ||
        errorMessage.includes('invalid_api_key')
      ) {
        throw new Error(
          `Authentication failed for ${provider}: The API key appears to be invalid or expired. Please check your ${this.getEnvKeyForProvider(provider)} environment variable.`,
        );
      }
      if (errorMessage.includes('429') || errorMessage.includes('rate_limit')) {
        throw new Error(
          `Rate limit exceeded for ${provider}: Too many requests. Please wait and try again.`,
        );
      }
      if (errorMessage.includes('500') || errorMessage.includes('503')) {
        throw new Error(`${provider} service is temporarily unavailable. Please try again later.`);
      }

      // Re-throw with context
      throw new Error(`${provider} streaming API error: ${errorMessage}`);
    }
  }
}

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
import { logger } from '@/lib/logger';
import { shouldEnablePromptCache } from '@/lib/prompt-cache-helper';

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

    // Default to OpenAI
    return 'openai';
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

    // Auto-enable prompt caching for large system prompts (RAG, documents, etc.)
    // This is beneficial for Anthropic Claude and OpenAI models
    const requestWithCache: LLMProviderRequest = {
      ...request,
      usePromptCache:
        request.usePromptCache !== false && shouldEnablePromptCache(request, request.model),
    };

    try {
      logger.debug({ provider, model: request.model }, 'Sending LLM request');
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

    try {
      logger.debug({ provider, model: request.model }, 'Starting LLM streaming request');
      const stream = await providerInstance.streamRequest(request);
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

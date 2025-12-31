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
import { logger } from '@/lib/logger';
import { shouldEnablePromptCache } from '@/lib/prompt-cache-helper';

export class LLMProviderFactory {
  static createProvider(provider: string, apiKey?: string): BaseLLMProvider | null {
    const providerLower = provider.toLowerCase();

    // Get API key from parameter or environment
    const key = apiKey || this.getProviderApiKey(providerLower);

    if (!key) {
      logger.warn({ provider }, 'No API key found for provider');
      return null;
    }

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
    };

    const envKey = envKeyMap[provider.toLowerCase()];
    if (!envKey) {
      return undefined;
    }

    return getOptionalEnv(envKey);
  }

  private static getProviderApiKey(provider: string): string | undefined {
    const envKeyMap: Record<string, string> = {
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      google: 'GOOGLE_API_KEY',
      xai: 'XAI_API_KEY',
      qwen: 'QWEN_API_KEY',
      moonshot: 'MOONSHOT_API_KEY',
      deepseek: 'DEEPSEEK_API_KEY',
    };

    const envKey = envKeyMap[provider.toLowerCase()];
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
      throw new Error(`Provider ${provider} not available or not configured`);
    }

    // Auto-enable prompt caching for large system prompts (RAG, documents, etc.)
    // This is beneficial for Anthropic Claude and OpenAI models
    const requestWithCache: LLMProviderRequest = {
      ...request,
      usePromptCache:
        request.usePromptCache !== false && shouldEnablePromptCache(request, request.model),
    };

    return providerInstance.sendRequest(requestWithCache);
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
      throw new Error(`Provider ${provider} not available or not configured`);
    }

    return providerInstance.streamRequest(request);
  }
}

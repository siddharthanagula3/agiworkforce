import 'server-only';

import { getOptionalEnv } from '@/utils/env';
import { BaseLLMProvider, LLMProviderRequest, LLMProviderResponse } from './base';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { GoogleProvider } from './google';
import { XAIProvider } from './xai';
import { QwenProvider } from './qwen';
import { MistralProvider } from './mistral';
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

    switch (providerLower) {
      case 'openai':
        return new OpenAIProvider(key);
      case 'anthropic':
        return new AnthropicProvider(key);
      case 'google':
        return new GoogleProvider(key);
      case 'xai':
        return new XAIProvider(key);
      case 'qwen':
        return new QwenProvider(key);
      case 'mistral':
        return new MistralProvider(key);
      case 'moonshot':
        return new MoonshotProvider(key);
      case 'deepseek':
        return new DeepSeekProvider(key);
      default:
        logger.warn({ provider }, 'Unknown provider');
        return null;
    }
  }

  private static getProviderApiKey(provider: string): string | undefined {
    const envKeyMap: Record<string, string> = {
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      google: 'GOOGLE_API_KEY',
      xai: 'XAI_API_KEY',
      qwen: 'QWEN_API_KEY',
      mistral: 'MISTRAL_API_KEY',
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
    if (modelLower.includes('mistral') || modelLower.includes('codestral')) {
      return 'mistral';
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
}

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
import {
  detectProviderFromModelId,
  getModelMetadataById,
  normalizeModelId,
} from '@agiworkforce/types';

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
    const envKeyStr = envKey;
    if (!envKeyStr) continue;
    const value = process.env[envKeyStr];
    if (value) {
      // Show first 4 and last 4 chars for debugging (minimise key exposure)
      const masked =
        value.length > 12
          ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
          : '[configured]';
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

    logger.debug({ provider, keyLength: key.length }, 'Creating provider with API key');

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

  /** WEB-2 (audit 2026-05-03): SSRF allowlist. We honour `*_BASE_URL`
   *  overrides (used by ai-gateway test fixtures, on-prem proxies),
   *  but only if they resolve to a hostname we explicitly recognise.
   *  An attacker who compromises a Vercel preview env var can no
   *  longer redirect LLM traffic - including the user's prompts - to
   *  an arbitrary attacker-controlled host. */
  private static readonly ALLOWED_BASE_HOSTS: ReadonlySet<string> = new Set([
    'api.openai.com',
    'api.anthropic.com',
    'generativelanguage.googleapis.com',
    'api.x.ai',
    'dashscope.aliyuncs.com',
    'api.moonshot.cn',
    'api.deepseek.com',
    'api.perplexity.ai',
    'open.bigmodel.cn',
    'api.groq.com',
    'gateway.ai.cloudflare.com',
    'localhost',
    '127.0.0.1',
  ]);

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

    const raw = getOptionalEnv(envKey);
    if (!raw) {
      return undefined;
    }

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      logger.warn({ provider, envKey }, 'Invalid *_BASE_URL - ignoring');
      return undefined;
    }
    if (
      parsed.protocol !== 'https:' &&
      parsed.hostname !== 'localhost' &&
      parsed.hostname !== '127.0.0.1'
    ) {
      logger.warn({ provider, envKey }, 'Refusing non-https *_BASE_URL override');
      return undefined;
    }
    if (!LLMProviderFactory.ALLOWED_BASE_HOSTS.has(parsed.hostname)) {
      logger.warn(
        { provider, envKey, host: parsed.hostname },
        'Refusing *_BASE_URL override pointing to non-allowlisted host (potential SSRF)',
      );
      return undefined;
    }
    return raw;
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
    const catalogProvider = detectProviderFromModelId(model);
    if (catalogProvider) {
      return catalogProvider;
    }

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
    const metadata = getModelMetadataById(modelId);
    const normalizedModelId = normalizeModelId(modelId);
    const apiModelId = metadata?.apiModelId ?? normalizedModelId;

    if (apiModelId) {
      logger.debug({ internalId: modelId, apiId: apiModelId }, 'Mapped model ID to API ID');
      return apiModelId;
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

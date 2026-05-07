/**
 * User AI Preferences Service
 * Loads user AI preferences from settings and returns them as a context object.
 *
 * server-no-shared-module-state: this module no longer mutates the global
 * unifiedLLMService singleton. Callers receive a config object and should
 * pass it to LLMClientFactory.create(ctx) to obtain a per-request client.
 */

import { settingsService } from '@features/settings/services/user-preferences';
import { type LLMProvider, type RequestContext } from './unified-language-model';
import { logger } from '@shared/lib/logger';
import {
  getProviderDefaultModel,
  getTaskModelForProvider,
  normalizeModelId,
} from '@agiworkforce/types';

const DEFAULT_OPENAI_MODEL = getProviderDefaultModel('openai') ?? 'gpt-5.4';
const DEFAULT_DOCUMENT_MODEL = getTaskModelForProvider('anthropic', 'chat') ?? 'claude-sonnet-4.6';
const DEFAULT_VISUAL_TASK_MODEL =
  getTaskModelForProvider('google', 'chat') ?? 'gemini-3.1-flash-lite';

function resolveDefaultModelForProvider(provider: LLMProvider): string {
  switch (provider) {
    case 'anthropic':
      return getProviderDefaultModel('anthropic') ?? DEFAULT_DOCUMENT_MODEL;
    case 'google':
      return getProviderDefaultModel('google') ?? DEFAULT_VISUAL_TASK_MODEL;
    case 'perplexity':
      return getProviderDefaultModel('perplexity') ?? 'sonar';
    case 'grok':
      return getProviderDefaultModel('xai') ?? 'grok-4';
    case 'deepseek':
      return getProviderDefaultModel('deepseek') ?? 'deepseek-chat';
    case 'qwen':
      return getProviderDefaultModel('qwen') ?? 'qwen-plus';
    case 'openai':
    default:
      return DEFAULT_OPENAI_MODEL;
  }
}

/**
 * Load user AI preferences from settings.
 * Returns a RequestContext that callers should pass to LLMClientFactory.create().
 *
 * server-no-shared-module-state: this function no longer mutates any global
 * state. Each caller gets an isolated config snapshot for its own request.
 */
export async function loadUserAIPreferences(): Promise<RequestContext> {
  try {
    const { data, error } = await settingsService.getSettings();

    if (error || !data) {
      return {
        provider: 'openai',
        model: DEFAULT_OPENAI_MODEL,
        temperature: 0.7,
        maxTokens: 4000,
      };
    }

    const provider = (data.default_ai_provider || 'openai') as LLMProvider;
    const model =
      normalizeModelId(data.default_ai_model) ?? resolveDefaultModelForProvider(provider);
    const temperature = data.ai_temperature ?? 0.7;
    const maxTokens = data.ai_max_tokens ?? 4000;

    return {
      provider,
      model,
      temperature,
      maxTokens,
    };
  } catch (error) {
    logger.error('Error loading user AI preferences:', error);

    return {
      provider: 'openai',
      model: DEFAULT_OPENAI_MODEL,
      temperature: 0.7,
      maxTokens: 4000,
    };
  }
}

/**
 * Get the default provider and model for a specific task type
 * This allows overriding user preferences for specialized tasks
 */
export function getProviderForTaskType(
  taskType: 'chat' | 'document' | 'image' | 'video' | 'code',
): {
  provider: LLMProvider;
  model: string;
} {
  switch (taskType) {
    case 'document':
      // Claude is better for document generation
      return {
        provider: 'anthropic',
        model: DEFAULT_DOCUMENT_MODEL,
      };
    case 'image':
      // Use the fast Gemini 3.1 vision lane for image-adjacent requests.
      return {
        provider: 'google',
        model: DEFAULT_VISUAL_TASK_MODEL,
      };
    case 'video':
      // Use the fast Gemini 3.1 vision lane for video-adjacent requests.
      return {
        provider: 'google',
        model: DEFAULT_VISUAL_TASK_MODEL,
      };
    case 'code':
    case 'chat':
    default:
      // For general chat and code, use user preferences
      // These will be loaded by loadUserAIPreferences()
      return {
        provider: 'openai',
        model: DEFAULT_OPENAI_MODEL,
      };
  }
}

/**
 * Resolve the RequestContext for a given task type.
 * Callers should pass the returned context to LLMClientFactory.create().
 *
 * server-no-shared-module-state: no global state is mutated.
 */
export async function resolveTaskContext(
  taskType: 'chat' | 'document' | 'image' | 'video' | 'code',
  overrideUserPreferences = false,
): Promise<RequestContext> {
  if (overrideUserPreferences) {
    const { provider, model } = getProviderForTaskType(taskType);
    return { provider, model, temperature: 0.7, maxTokens: 4000 };
  }
  return loadUserAIPreferences();
}

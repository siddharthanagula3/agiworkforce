/**
 * User AI Preferences Service
 * Loads user AI preferences from settings and applies them to the LLM service
 */

import { settingsService } from '@features/settings/services/user-preferences';
import { unifiedLLMService, type LLMProvider } from './unified-language-model';
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
 * Load user AI preferences and apply them to the unified LLM service
 * Returns the configured provider and model
 */
export async function loadUserAIPreferences(): Promise<{
  provider: LLMProvider;
  model: string;
  temperature: number;
  maxTokens: number;
}> {
  try {
    const { data, error } = await settingsService.getSettings();

    if (error || !data) {
      // Return defaults if settings can't be loaded
      return {
        provider: 'openai',
        model: DEFAULT_OPENAI_MODEL,
        temperature: 0.7,
        maxTokens: 4000,
      };
    }

    // Extract AI preferences with fallbacks
    const provider = (data.default_ai_provider || 'openai') as LLMProvider;
    const model =
      normalizeModelId(data.default_ai_model) ?? resolveDefaultModelForProvider(provider);
    const temperature = data.ai_temperature ?? 0.7;
    const maxTokens = data.ai_max_tokens ?? 4000;

    // Update the unified LLM service config
    unifiedLLMService.updateConfig({
      provider,
      model,
      temperature,
      maxTokens,
    });

    return {
      provider,
      model,
      temperature,
      maxTokens,
    };
  } catch (error) {
    logger.error('Error loading user AI preferences:', error);

    // Return defaults on error
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
 * Apply task-specific configuration to the LLM service
 */
export async function applyTaskConfiguration(
  taskType: 'chat' | 'document' | 'image' | 'video' | 'code',
  overrideUserPreferences = false,
): Promise<void> {
  if (overrideUserPreferences) {
    // Use task-specific configuration
    const config = getProviderForTaskType(taskType);
    unifiedLLMService.updateConfig(config);
  } else {
    // Load and apply user preferences
    await loadUserAIPreferences();
  }
}

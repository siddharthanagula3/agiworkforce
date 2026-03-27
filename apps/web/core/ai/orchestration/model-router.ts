/**
 * Task-Based Model Router
 * Automatically selects the best LLM for specific task types
 * Supports user override
 */

import type { LLMProvider } from '@core/ai/llm/unified-language-model';
import { getModelMetadataById, getTaskModelForProvider, type Provider } from '@agiworkforce/types';

export type TaskCategory =
  | 'coding'
  | 'general'
  | 'creative'
  | 'image-generation'
  | 'video-generation'
  | 'data-analysis'
  | 'research'
  | 'reasoning'
  | 'agentic'
  | 'computer-use'
  | 'vision'
  | 'multilingual';

export interface ModelRecommendation {
  provider: LLMProvider;
  model: string;
  reason: string;
  confidence: number; // 0-1
  alternatives: Array<{
    provider: LLMProvider;
    model: string;
    reason: string;
  }>;
}

export interface ModelInfo {
  provider: LLMProvider;
  model: string;
  displayName: string;
  description: string;
  strengths: TaskCategory[];
  costPer1KTokens: number;
}

type ModelBlueprint = {
  modelId: string | null;
  strengths: TaskCategory[];
  description: string;
};

const CORE_MODEL_BLUEPRINTS: readonly ModelBlueprint[] = [
  {
    modelId: getTaskModelForProvider('anthropic', 'complex_reasoning'),
    strengths: ['coding', 'reasoning', 'data-analysis', 'research', 'agentic', 'computer-use'],
    description: 'Flagship Claude model for complex reasoning, coding, and high-agency workflows.',
  },
  {
    modelId: getTaskModelForProvider('anthropic', 'chat'),
    strengths: ['coding', 'agentic', 'computer-use', 'general', 'vision', 'research'],
    description: 'Balanced Claude model for chat, coding, research, and computer use.',
  },
  {
    modelId: getTaskModelForProvider('anthropic', 'fast_completion'),
    strengths: ['general', 'agentic', 'computer-use'],
    description: 'Fast Claude model for quick interactive work and tool-driven flows.',
  },
  {
    modelId: getTaskModelForProvider('openai', 'complex_reasoning'),
    strengths: [
      'reasoning',
      'coding',
      'research',
      'vision',
      'agentic',
      'computer-use',
      'image-generation',
    ],
    description:
      'Flagship GPT-5.4 reasoning model for difficult reasoning and high-complexity tasks.',
  },
  {
    modelId: getTaskModelForProvider('openai', 'chat'),
    strengths: [
      'general',
      'research',
      'creative',
      'vision',
      'agentic',
      'computer-use',
      'image-generation',
    ],
    description: 'Primary GPT-5.4 all-rounder for chat, multimodal work, and tool use.',
  },
  {
    modelId: getTaskModelForProvider('openai', 'fast_completion'),
    strengths: ['general', 'agentic', 'computer-use'],
    description: 'Fast GPT-5.4 mini model for cost-sensitive interactive tasks.',
  },
  {
    modelId: getTaskModelForProvider('google', 'complex_reasoning'),
    strengths: ['reasoning', 'coding', 'research', 'vision', 'multilingual', 'video-generation'],
    description: 'Flagship Gemini 3.1 model for large-context reasoning and multimodal analysis.',
  },
  {
    modelId: getTaskModelForProvider('google', 'chat'),
    strengths: ['general', 'research', 'vision', 'multilingual', 'video-generation'],
    description: 'Primary Gemini 3.1 fast model for chat, vision, and broad multilingual tasks.',
  },
  {
    modelId: getTaskModelForProvider('google', 'fast_completion'),
    strengths: ['general', 'creative', 'vision', 'multilingual'],
    description: 'Fast Gemini 3.1 lite model for lightweight multimodal work.',
  },
] as const;

const DEFAULT_ROUTER_MODEL =
  getTaskModelForProvider('anthropic', 'chat') ??
  getTaskModelForProvider('openai', 'chat') ??
  'claude-sonnet-4.6';

function toRouterProvider(provider: Provider | string): LLMProvider | null {
  switch (provider) {
    case 'anthropic':
    case 'openai':
    case 'google':
      return provider;
    case 'xai':
      return 'grok';
    default:
      return null;
  }
}

function buildModelInfo({ modelId, strengths, description }: ModelBlueprint): ModelInfo | null {
  const metadata = getModelMetadataById(modelId);
  if (!metadata) {
    return null;
  }

  const provider = toRouterProvider(metadata.provider);
  if (!provider) {
    return null;
  }

  return {
    provider,
    model: metadata.id,
    displayName: metadata.name,
    description,
    strengths: [...new Set(strengths)],
    costPer1KTokens: (metadata.inputCost + metadata.outputCost) / 1000,
  };
}

const AVAILABLE_MODELS: ModelInfo[] = CORE_MODEL_BLUEPRINTS.map(buildModelInfo).filter(
  (model): model is ModelInfo => Boolean(model),
);

export class ModelRouter {
  /**
   * Detect task category from user input
   */
  detectTaskCategory(userInput: string): TaskCategory {
    const lowerInput = userInput.toLowerCase();

    // Computer use keywords (highest priority - specialized capability)
    if (
      /\b(computer use|browse|click|scroll|screenshot|navigate|automate browser|web automation|desktop automation)\b/i.test(
        lowerInput,
      )
    ) {
      return 'computer-use';
    }

    // Reasoning keywords (complex problem-solving)
    if (
      /\b(reason|reasoning|think through|step by step|complex|mathematical proof|logic|theorem|solve|problem solving|chain of thought)\b/i.test(
        lowerInput,
      )
    ) {
      return 'reasoning';
    }

    // Agentic keywords (autonomous tasks)
    if (
      /\b(agent|autonomous|orchestrate|coordinate|multi-step|workflow|execute tasks|tool use|tools|function calling)\b/i.test(
        lowerInput,
      )
    ) {
      return 'agentic';
    }

    // Vision keywords
    if (
      /\b(look at|analyze image|describe image|what's in|see|vision|recognize|identify in image|image analysis|visual)\b/i.test(
        lowerInput,
      )
    ) {
      return 'vision';
    }

    // Multilingual keywords
    if (
      /\b(translate|translation|chinese|japanese|korean|spanish|french|german|arabic|hindi|multilingual|language)\b/i.test(
        lowerInput,
      )
    ) {
      return 'multilingual';
    }

    // Coding keywords
    if (
      /\b(code|debug|implement|refactor|function|class|api|typescript|javascript|python|react|component|bug|error|test|program|script)\b/i.test(
        lowerInput,
      )
    ) {
      return 'coding';
    }

    // Creative keywords
    if (
      /\b(creative|story|poem|write|article|blog|content|marketing|design|ideate|brainstorm|narrative|fiction)\b/i.test(
        lowerInput,
      )
    ) {
      return 'creative';
    }

    // Research keywords
    if (
      /\b(research|search|find|investigate|study|compare|lookup|information|trends|current events|news|latest)\b/i.test(
        lowerInput,
      )
    ) {
      return 'research';
    }

    // Data analysis keywords
    if (
      /\b(analyze|analytics|data|metrics|statistics|chart|graph|calculate|compute|sql|database|spreadsheet)\b/i.test(
        lowerInput,
      )
    ) {
      return 'data-analysis';
    }

    // Image generation keywords
    if (
      /\b(generate image|create image|draw|illustration|picture|photo|visualize|diagram|render|dalle|midjourney|imagen)\b/i.test(
        lowerInput,
      )
    ) {
      return 'image-generation';
    }

    // Video generation keywords
    if (
      /\b(video|animation|movie|generate video|create video|sora|veo|runway)\b/i.test(lowerInput)
    ) {
      return 'video-generation';
    }

    // Default to general
    return 'general';
  }

  /**
   * Recommend the best model for a task
   */
  recommendModel(userInput: string, taskCategory?: TaskCategory): ModelRecommendation {
    const category = taskCategory || this.detectTaskCategory(userInput);

    // Find models that excel at this category
    const suitableModels = AVAILABLE_MODELS.filter((model) =>
      model.strengths.includes(category),
    ).sort((a, b) => {
      // Primary: strength match
      const aIndex = a.strengths.indexOf(category);
      const bIndex = b.strengths.indexOf(category);
      if (aIndex !== bIndex) return aIndex - bIndex;

      // Secondary: cost (lower is better for similar capability)
      return a.costPer1KTokens - b.costPer1KTokens;
    });

    if (suitableModels.length === 0) {
      // Fallback to the current balanced general-purpose core model.
      const fallback =
        AVAILABLE_MODELS.find((m) => m.model === DEFAULT_ROUTER_MODEL) ||
        AVAILABLE_MODELS.find((m) => m.model === 'gpt-5.4') ||
        AVAILABLE_MODELS[0];
      return {
        provider: fallback?.provider ?? 'anthropic',
        model: fallback?.model ?? DEFAULT_ROUTER_MODEL,
        reason: `No specialized model found for "${category}". Using general-purpose model.`,
        confidence: 0.5,
        alternatives: [],
      };
    }

    const primary = suitableModels[0];
    const alternatives = suitableModels.slice(1, 3).map((m) => ({
      provider: m.provider,
      model: m.model,
      reason: m.description,
    }));

    return {
      provider: primary?.provider ?? 'anthropic',
      model: primary?.model ?? DEFAULT_ROUTER_MODEL,
      reason: this.getRecommendationReason(category, primary!),
      confidence: 0.85,
      alternatives,
    };
  }

  /**
   * Get a human-readable reason for the recommendation
   */
  private getRecommendationReason(category: TaskCategory, model: ModelInfo): string {
    const reasons: Record<TaskCategory, string> = {
      coding: `${model.displayName} excels at code generation, debugging, and technical analysis with superior reasoning capabilities.`,
      general: `${model.displayName} provides the best balance of performance and versatility for general tasks.`,
      creative: `${model.displayName} is optimized for creative writing, content generation, and brainstorming.`,
      'image-generation': `${model.displayName} supports multimodal capabilities for image understanding and generation guidance.`,
      'video-generation': `${model.displayName} can help plan and script video content effectively.`,
      'data-analysis': `${model.displayName} has strong analytical and mathematical reasoning for data work.`,
      research: `${model.displayName} provides excellent research capabilities with real-time web access and citations.`,
      reasoning: `${model.displayName} features advanced reasoning with chain-of-thought and extended thinking for complex problems.`,
      agentic: `${model.displayName} is optimized for autonomous task execution with tool use and multi-step workflows.`,
      'computer-use': `${model.displayName} supports computer use capabilities for browser and desktop automation.`,
      vision: `${model.displayName} has advanced vision capabilities for image analysis and understanding.`,
      multilingual: `${model.displayName} excels at multilingual tasks including translation and cross-language understanding.`,
    };

    return reasons[category] || model.description;
  }

  /**
   * Get model by ID
   */
  getModelById(modelId: string): ModelInfo | undefined {
    return AVAILABLE_MODELS.find((m) => m.model === modelId);
  }

  /**
   * Get all available models
   */
  getAllModels(): ModelInfo[] {
    return AVAILABLE_MODELS;
  }

  /**
   * Get models by provider
   */
  getModelsByProvider(provider: LLMProvider): ModelInfo[] {
    return AVAILABLE_MODELS.filter((m) => m.provider === provider);
  }

  /**
   * Get default model (current balanced core model)
   */
  getDefaultModel(): ModelInfo {
    return AVAILABLE_MODELS.find((m) => m.model === DEFAULT_ROUTER_MODEL) || AVAILABLE_MODELS[0]!;
  }

  /**
   * Get best model by category
   */
  getBestModelForCategory(category: TaskCategory): ModelInfo | undefined {
    const categoryModels = AVAILABLE_MODELS.filter((m) => m.strengths.includes(category));
    return categoryModels[0];
  }

  /**
   * Get all models grouped by provider
   */
  getModelsGroupedByProvider(): Record<LLMProvider, ModelInfo[]> {
    const grouped: Record<string, ModelInfo[]> = {};
    for (const model of AVAILABLE_MODELS) {
      if (!grouped[model.provider]) {
        grouped[model.provider] = [];
      }
      grouped[model.provider]!.push(model);
    }
    return grouped as Record<LLMProvider, ModelInfo[]>;
  }

  /**
   * Get image generation capable providers
   */
  getImageGenerationProviders(): LLMProvider[] {
    return ['openai', 'google'];
  }

  /**
   * Get video generation capable providers
   */
  getVideoGenerationProviders(): LLMProvider[] {
    return ['openai', 'google'];
  }

  /**
   * Get computer use capable models
   */
  getComputerUseModels(): ModelInfo[] {
    return AVAILABLE_MODELS.filter((m) => m.strengths.includes('computer-use'));
  }

  /**
   * Get reasoning-optimized models
   */
  getReasoningModels(): ModelInfo[] {
    return AVAILABLE_MODELS.filter((m) => m.strengths.includes('reasoning'));
  }

  /**
   * Get agentic/tool-use capable models
   */
  getAgenticModels(): ModelInfo[] {
    return AVAILABLE_MODELS.filter((m) => m.strengths.includes('agentic'));
  }
}

// Export singleton instance
export const modelRouter = new ModelRouter();

// Export convenience functions
export function recommendModelForTask(userInput: string): ModelRecommendation {
  return modelRouter.recommendModel(userInput);
}

export function getAvailableModels(): ModelInfo[] {
  return modelRouter.getAllModels();
}

export function getModelInfo(modelId: string): ModelInfo | undefined {
  return modelRouter.getModelById(modelId);
}

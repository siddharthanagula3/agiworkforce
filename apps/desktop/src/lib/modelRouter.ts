/**
 * Intelligent Model Router (January 2026)
 *
 * This module provides smart model selection for Auto modes based on:
 * - Task type classification (coding, reasoning, general, agentic, multimodal)
 * - Benchmark performance for the detected task type
 * - Cost efficiency (cheapest viable model)
 * - Subscription tier (through auto mode selection)
 * - **CRITICAL: Model capabilities (vision, tools, thinking, etc.)**
 *
 * Architecture:
 * 1. User selects auto-economy, auto-balanced, or auto-premium
 * 2. When a message is sent, we classify the task type
 * 3. We filter models by REQUIRED CAPABILITIES first
 * 4. Then select the best model from viable candidates based on benchmarks and cost
 * 5. If user manually selects a model from QuickModelSelector, bypass routing
 *
 * ========================================
 * HOW TO ADD NEW MODELS (FOR DEVELOPERS)
 * ========================================
 *
 * When adding a new model to the routing system:
 *
 * 1. First add the model to MODEL_METADATA in constants/llm.ts with accurate capabilities
 *    - vision: Can the model process images? (NOT all models can!)
 *    - tools: Does it support function calling?
 *    - thinking: Does it have extended reasoning mode?
 *    - computerUse: Can it control mouse/keyboard? (Only Claude models currently)
 *    - codeExecution: Does it have a sandbox for running code?
 *
 * 2. Add the model to the appropriate MODEL_POOLS below:
 *    - auto-economy: Models < $1/1M output, good for simple tasks
 *    - auto-balanced: Models $1-15/1M output, good quality/cost ratio
 *    - auto-premium: Best models regardless of cost
 *
 * 3. The router will automatically:
 *    - Filter out models that lack required capabilities for the task
 *    - Rank remaining models by benchmark performance and cost
 *    - Select the optimal model for the user's request
 *
 * IMPORTANT CAPABILITY NOTES (January 2026):
 * - DeepSeek V3: NO vision (requires separate deepseek-vl model)
 * - Grok 4.1: NO vision (requires separate grok-2-vision model)
 * - Qwen 3: NO vision (requires separate qwen-vl model)
 * - Claude models: NO code execution sandbox (use MCP tools instead)
 * - GPT-4o-mini: NO agentic optimization (use GPT-4o or GPT-5 for agentic)
 */

import { MODEL_METADATA, type ModelMetadata } from '../constants/llm';

// ============================================
// TYPES
// ============================================

export type TaskType = 'coding' | 'reasoning' | 'general' | 'agentic' | 'multimodal';

export type AutoMode = 'auto-economy' | 'auto-balanced' | 'auto-premium';

export interface RoutingResult {
  selectedModel: string;
  taskType: TaskType;
  reason: string;
  confidence: number;
}

export interface ClassificationResult {
  taskType: TaskType;
  confidence: number;
  keywords: string[];
}

// ============================================
// MODEL POOLS BY AUTO MODE
// ============================================

/**
 * Model pools are tier-restricted to control costs:
 * - Economy: Cheapest models that meet minimum quality thresholds
 * - Balanced: Mid-tier models with good quality/cost ratio
 * - Premium: Best available models regardless of cost
 *
 * IMPORTANT: The router filters by CAPABILITY before cost/benchmark.
 * For example, multimodal tasks will skip DeepSeek/Grok/Qwen (no vision).
 *
 * Capability Legend for each model:
 * V=Vision, T=Tools, Th=Thinking, C=ComputerUse, A=Agentic, E=CodeExecution
 */
export const MODEL_POOLS: Record<AutoMode, string[]> = {
  'auto-economy': [
    'gemini-3-flash', // $0.08/$0.30 - V✓ T✓ Th✗ C✗ A✗ E✓ (1M ctx)
    'gpt-4o-mini', // $0.15/$0.60 - V✓ T✓ Th✗ C✗ A✗ E✓ (128K ctx)
    'grok-4-fast', // $0.20/$0.50 - V✗ T✓ Th✗ C✗ A✗ E✓ (2M ctx, NO VISION)
    'deepseek-v3.2', // $0.27/$1.10 - V✗ T✓ Th✓ C✗ A✓ E✗ (128K ctx, NO VISION)
    'qwen-3', // $0.40/$1.20 - V✗ T✓ Th✓ C✗ A✗ E✗ (128K ctx, NO VISION)
  ],
  'auto-balanced': [
    'deepseek-v3.2', // $0.27/$1.10 - V✗ T✓ Th✓ C✗ A✓ E✗ (best value coding, NO VISION)
    'gemini-3-pro', // $1.25/$5.00 - V✓ T✓ Th✓ C✗ A✓ E✓ (2M ctx, excellent all-around)
    'gpt-4o', // $2.50/$10.00 - V✓ T✓ Th✗ C✗ A✓ E✓ (128K ctx, good multimodal)
    'claude-sonnet-4.5', // $3.00/$15.00 - V✓ T✓ Th✓ C✓ A✓ E✗ (200K ctx, computer use)
    'grok-4.1', // $3.00/$15.00 - V✗ T✓ Th✓ C✗ A✓ E✓ (256K ctx, NO VISION)
  ],
  'auto-premium': [
    'claude-opus-4.5', // $5.00/$25.00 - V✓ T✓ Th✓ C✓ A✓ E✗ (200K ctx, BEST coding)
    'gpt-5.2', // $1.75/$14.00 - V✓ T✓ Th✓ C✓ A✓ E✓ (400K ctx, BEST agentic)
    'gemini-3-pro', // $1.25/$5.00 - V✓ T✓ Th✓ C✗ A✓ E✓ (2M ctx)
    'claude-sonnet-4.5', // $3.00/$15.00 - V✓ T✓ Th✓ C✓ A✓ E✗ (200K ctx)
    'grok-4.1', // $3.00/$15.00 - V✗ T✓ Th✓ C✗ A✓ E✓ (256K ctx, NO VISION)
  ],
};

// ============================================
// MINIMUM BENCHMARK THRESHOLDS
// ============================================

/**
 * Minimum benchmark scores for a model to be considered "viable" for a task type.
 * Economy mode uses these to filter out models that won't perform well enough.
 */
export const BENCHMARK_THRESHOLDS: Record<
  TaskType,
  { metric: keyof NonNullable<ModelMetadata['benchmarks']>; minimum: number }
> = {
  coding: { metric: 'swebench', minimum: 50 }, // User selected 50+ SWE-bench
  reasoning: { metric: 'gpqa', minimum: 55 },
  general: { metric: 'mmlu', minimum: 80 },
  agentic: { metric: 'swebench', minimum: 40 }, // Agentic requires decent coding ability
  multimodal: { metric: 'mmlu', minimum: 75 }, // Vision tasks need general intelligence
};

// ============================================
// TASK CLASSIFICATION
// ============================================

/**
 * Keywords for fast local classification (before LLM classification)
 * If high confidence keywords are detected, skip LLM classification
 */
const TASK_KEYWORDS: Record<TaskType, { high: string[]; medium: string[] }> = {
  coding: {
    high: [
      'write code',
      'write a function',
      'implement',
      'debug',
      'fix this bug',
      'refactor',
      'unit test',
      'typescript',
      'javascript',
      'python',
      'rust',
      'code review',
      'pull request',
      'git',
      'compile',
      'syntax error',
      'runtime error',
    ],
    medium: [
      'function',
      'class',
      'variable',
      'loop',
      'array',
      'object',
      'api',
      'endpoint',
      'database',
    ],
  },
  reasoning: {
    high: [
      'explain why',
      'analyze',
      'compare',
      'evaluate',
      'pros and cons',
      'trade-offs',
      'solve this problem',
      'math problem',
      'logic puzzle',
      'prove',
      'deduce',
    ],
    medium: ['think', 'reason', 'calculate', 'derive', 'conclude', 'infer'],
  },
  general: {
    high: [
      'what is',
      'tell me about',
      'explain',
      'how does',
      'summarize',
      'translate',
      'write an email',
      'draft a message',
    ],
    medium: ['help', 'question', 'curious', 'wondering', 'learn'],
  },
  agentic: {
    high: [
      'browse the web',
      'search online',
      'open browser',
      'click',
      'navigate to',
      'fill form',
      'book',
      'order',
      'automate',
      'workflow',
      'use tools',
    ],
    medium: ['find', 'search', 'look up', 'get me', 'do this for me'],
  },
  multimodal: {
    high: [
      'look at this image',
      'analyze this picture',
      'what do you see',
      'describe this image',
      'screenshot',
      'photo',
      'diagram',
      'chart',
    ],
    medium: ['image', 'picture', 'visual', 'see', 'look'],
  },
};

/**
 * Fast local keyword-based classification
 * Returns null if confidence is too low (needs LLM classification)
 */
export function classifyTaskLocally(message: string): ClassificationResult | null {
  const lowerMessage = message.toLowerCase();
  const results: Array<{ type: TaskType; score: number; keywords: string[] }> = [];

  for (const [taskType, keywords] of Object.entries(TASK_KEYWORDS)) {
    let score = 0;
    const matchedKeywords: string[] = [];

    for (const keyword of keywords.high) {
      if (lowerMessage.includes(keyword)) {
        score += 3;
        matchedKeywords.push(keyword);
      }
    }

    for (const keyword of keywords.medium) {
      if (lowerMessage.includes(keyword)) {
        score += 1;
        matchedKeywords.push(keyword);
      }
    }

    if (score > 0) {
      results.push({ type: taskType as TaskType, score, keywords: matchedKeywords });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // If top result has high confidence (score >= 3), use it
  const topResult = results[0];
  if (topResult && topResult.score >= 3) {
    const confidence = Math.min(0.95, 0.5 + topResult.score * 0.1);
    return {
      taskType: topResult.type,
      confidence,
      keywords: topResult.keywords,
    };
  }

  // Low confidence - need LLM classification
  return null;
}

/**
 * LLM-based task classification using Gemini 3 Flash (cheapest)
 * This is called when local classification has low confidence
 */
export function getClassificationPrompt(message: string): string {
  return `Classify the following user message into exactly ONE task type. Respond with ONLY the task type name.

Task Types:
- coding: Writing, debugging, reviewing, or modifying code
- reasoning: Complex analysis, problem-solving, math, logic
- general: Simple questions, explanations, writing, translation
- agentic: Tasks requiring web browsing, tool use, or automation
- multimodal: Tasks involving images, screenshots, or visual content

User Message: "${message.slice(0, 500)}"

Task Type:`;
}

/**
 * Parse LLM classification response
 */
export function parseClassificationResponse(response: string): TaskType {
  const normalized = response.toLowerCase().trim();

  if (normalized.includes('coding') || normalized.includes('code')) return 'coding';
  if (normalized.includes('reasoning') || normalized.includes('reason')) return 'reasoning';
  if (normalized.includes('agentic') || normalized.includes('agent')) return 'agentic';
  if (
    normalized.includes('multimodal') ||
    normalized.includes('image') ||
    normalized.includes('visual')
  )
    return 'multimodal';

  // Default to general for ambiguous responses
  return 'general';
}

// ============================================
// MODEL SELECTION
// ============================================

/**
 * Get the effective cost of a model (input + output weighted)
 * We weight output higher as it's typically more expensive
 */
function getEffectiveCost(model: ModelMetadata): number {
  return model.inputCost + model.outputCost * 1.5;
}

/**
 * Get the benchmark score for a model based on task type
 */
function getBenchmarkScore(model: ModelMetadata, taskType: TaskType): number {
  if (!model.benchmarks) return 0;

  switch (taskType) {
    case 'coding':
      return (model.benchmarks.swebench ?? 0) * 0.7 + (model.benchmarks.humaneval ?? 0) * 0.3;
    case 'reasoning':
      return (model.benchmarks.gpqa ?? 0) * 0.5 + (model.benchmarks.aime ?? 0) * 0.5;
    case 'general':
      return model.benchmarks.mmlu ?? 0;
    case 'agentic': {
      // Agentic tasks need coding ability + tool use capability
      const baseScore = (model.benchmarks.swebench ?? 0) * 0.5 + (model.benchmarks.mmlu ?? 0) * 0.5;
      return model.capabilities.agentic ? baseScore * 1.2 : baseScore * 0.5;
    }
    case 'multimodal': {
      // Multimodal needs vision + general intelligence
      const mmluScore = model.benchmarks.mmlu ?? 0;
      return model.capabilities.vision ? mmluScore * 1.1 : 0;
    }
    default:
      return model.benchmarks.mmlu ?? 0;
  }
}

/**
 * Check if a model meets the minimum benchmark threshold for a task type
 */
function meetsThreshold(model: ModelMetadata, taskType: TaskType): boolean {
  const threshold = BENCHMARK_THRESHOLDS[taskType];
  if (!threshold || !model.benchmarks) return true; // No threshold = allow

  const score = model.benchmarks[threshold.metric];
  return score !== undefined && score >= threshold.minimum;
}

/**
 * Check if model has required capabilities for task type
 *
 * CRITICAL: This function ensures we never route to a model that
 * lacks the necessary capabilities. For example:
 * - Multimodal tasks MUST go to vision-capable models
 * - Agentic tasks MUST go to models with tool support
 * - Reasoning tasks PREFER thinking-capable models (but don't require)
 */
function hasRequiredCapabilities(model: ModelMetadata, taskType: TaskType): boolean {
  switch (taskType) {
    case 'multimodal':
      // HARD REQUIREMENT: Model must support vision for image tasks
      // Models without vision: DeepSeek V3, Grok 4.1, Qwen 3
      return model.capabilities.vision === true;

    case 'agentic':
      // HARD REQUIREMENT: Model must support tools for agentic tasks
      // PREFERRED: Model should be optimized for agentic workflows
      return model.capabilities.tools === true && model.capabilities.agentic === true;

    case 'coding':
      // SOFT REQUIREMENT: Tools help with coding but aren't strictly required
      return model.capabilities.tools === true;

    case 'reasoning':
      // SOFT PREFERENCE: Thinking mode helps but isn't required
      // All models can reason, but thinking models do it better
      return true;

    case 'general':
      // No special requirements for general tasks
      return true;

    default:
      return true;
  }
}

/**
 * Get the capabilities a model is missing for a task type
 * Used for UI feedback when a model can't handle certain inputs
 */
export function getMissingCapabilities(modelId: string, taskType: TaskType): string[] {
  const model = MODEL_METADATA[modelId];
  if (!model) return ['unknown model'];

  const missing: string[] = [];

  switch (taskType) {
    case 'multimodal':
      if (!model.capabilities.vision) missing.push('vision');
      break;
    case 'agentic':
      if (!model.capabilities.tools) missing.push('tool use');
      if (!model.capabilities.agentic) missing.push('agentic optimization');
      break;
    case 'coding':
      if (!model.capabilities.tools) missing.push('tool use');
      break;
  }

  return missing;
}

/**
 * Check if a model can handle specific input types
 * Used by UI to enable/disable attachment buttons
 */
export function canModelHandleInput(
  modelId: string,
  inputType: 'image' | 'audio' | 'video' | 'file',
): boolean {
  const model = MODEL_METADATA[modelId];
  if (!model) return false;

  // Auto modes can handle all inputs (router will pick appropriate model)
  if (modelId.startsWith('auto-')) {
    return true;
  }

  switch (inputType) {
    case 'image':
      return model.capabilities.vision === true;
    case 'audio':
      // Currently only Gemini models have native audio support
      return model.provider === 'google' && model.capabilities.vision === true;
    case 'video':
      // Video requires vision + specific model support
      return model.provider === 'google' && model.capabilities.vision === true;
    case 'file':
      // Most models can handle text files, but some need tools for processing
      return model.capabilities.tools === true;
    default:
      return false;
  }
}

/**
 * Select the best model from a pool for a given task type
 * Prioritizes: cheapest model that meets quality thresholds
 */
export function selectModelFromPool(
  pool: string[],
  taskType: TaskType,
  autoMode: AutoMode,
): { modelId: string; reason: string } {
  const candidates: Array<{
    model: ModelMetadata;
    score: number;
    cost: number;
    reason: string;
  }> = [];

  for (const modelId of pool) {
    const model = MODEL_METADATA[modelId];
    if (!model) continue;

    // Check capabilities
    if (!hasRequiredCapabilities(model, taskType)) {
      continue;
    }

    // For economy mode, enforce benchmark thresholds
    if (autoMode === 'auto-economy' && !meetsThreshold(model, taskType)) {
      continue;
    }

    const score = getBenchmarkScore(model, taskType);
    const cost = getEffectiveCost(model);

    candidates.push({
      model,
      score,
      cost,
      reason: `${model.name} - ${taskType} score: ${score.toFixed(1)}, cost: $${cost.toFixed(2)}/1M`,
    });
  }

  if (candidates.length === 0) {
    // Fallback to first model in pool
    const firstModelId = pool[0] ?? 'gemini-3-flash';
    const fallback = MODEL_METADATA[firstModelId];
    return {
      modelId: firstModelId,
      reason: `Fallback to ${fallback?.name ?? firstModelId} - no models met criteria`,
    };
  }

  // Sort by strategy based on auto mode
  if (autoMode === 'auto-economy') {
    // Economy: cheapest that meets threshold
    candidates.sort((a, b) => a.cost - b.cost);
  } else if (autoMode === 'auto-premium') {
    // Premium: best quality regardless of cost
    candidates.sort((a, b) => b.score - a.score);
  } else {
    // Balanced: best score/cost ratio
    candidates.sort((a, b) => {
      const ratioA = a.score / (a.cost + 0.1); // Add 0.1 to avoid division by zero
      const ratioB = b.score / (b.cost + 0.1);
      return ratioB - ratioA;
    });
  }

  // After sorting, first candidate is guaranteed to exist since we checked length > 0
  const selected = candidates[0]!;
  return {
    modelId: selected.model.id,
    reason: selected.reason,
  };
}

// ============================================
// MAIN ROUTING FUNCTION
// ============================================

/**
 * Route a message to the optimal model based on auto mode
 *
 * @param message - The user's message to classify
 * @param autoMode - The selected auto mode (economy/balanced/premium)
 * @param hasImages - Whether the message includes images
 * @returns Routing result with selected model and reasoning
 */
export function routeMessage(
  message: string,
  autoMode: AutoMode,
  hasImages: boolean = false,
): RoutingResult {
  // Force multimodal if images are present
  if (hasImages) {
    const pool = MODEL_POOLS[autoMode];
    const { modelId, reason } = selectModelFromPool(pool, 'multimodal', autoMode);

    return {
      selectedModel: modelId,
      taskType: 'multimodal',
      reason: `Image detected. ${reason}`,
      confidence: 1.0,
    };
  }

  // Try local classification first (fast, free)
  const localResult = classifyTaskLocally(message);

  if (localResult && localResult.confidence >= 0.7) {
    const pool = MODEL_POOLS[autoMode];
    const { modelId, reason } = selectModelFromPool(pool, localResult.taskType, autoMode);

    return {
      selectedModel: modelId,
      taskType: localResult.taskType,
      reason: `Keywords: [${localResult.keywords.slice(0, 3).join(', ')}]. ${reason}`,
      confidence: localResult.confidence,
    };
  }

  // Low confidence local classification - use default task type based on mode
  // In production, this would call Gemini Flash for LLM classification
  const defaultTaskType: TaskType = autoMode === 'auto-premium' ? 'reasoning' : 'general';
  const pool = MODEL_POOLS[autoMode];
  const { modelId, reason } = selectModelFromPool(pool, defaultTaskType, autoMode);

  return {
    selectedModel: modelId,
    taskType: defaultTaskType,
    reason: `Default ${defaultTaskType} task. ${reason}`,
    confidence: 0.5,
  };
}

// ============================================
// BYPASS CHECK
// ============================================

/**
 * Check if the selected model is a manual selection (bypass auto routing)
 * Returns true if the model was manually selected from QuickModelSelector
 */
export function isManualSelection(selectedModel: string): boolean {
  // Auto modes are not manual selections
  if (selectedModel.startsWith('auto-')) {
    return false;
  }

  // Any specific model selection bypasses routing
  return selectedModel in MODEL_METADATA;
}

/**
 * Get the model to use for a request
 * - If manual selection: use that model directly
 * - If auto mode: route based on message content
 */
export function getModelForRequest(
  selectedModel: string,
  message: string,
  hasImages: boolean = false,
): { modelId: string; reason: string; wasRouted: boolean } {
  // Manual selection bypasses routing
  if (isManualSelection(selectedModel)) {
    const metadata = MODEL_METADATA[selectedModel];
    return {
      modelId: selectedModel,
      reason: `Manual selection: ${metadata?.name || selectedModel}`,
      wasRouted: false,
    };
  }

  // Auto mode - perform routing
  if (
    selectedModel === 'auto-economy' ||
    selectedModel === 'auto-balanced' ||
    selectedModel === 'auto-premium'
  ) {
    const result = routeMessage(message, selectedModel as AutoMode, hasImages);
    return {
      modelId: result.selectedModel,
      reason: result.reason,
      wasRouted: true,
    };
  }

  // Legacy 'auto' mode - treat as balanced
  if (selectedModel === 'auto') {
    const result = routeMessage(message, 'auto-balanced', hasImages);
    return {
      modelId: result.selectedModel,
      reason: result.reason,
      wasRouted: true,
    };
  }

  // Unknown - fallback to the selection
  return {
    modelId: selectedModel,
    reason: 'Unknown model, using as-is',
    wasRouted: false,
  };
}

// ============================================
// EXPORTS FOR TESTING AND UI
// ============================================

export const _internal = {
  getEffectiveCost,
  getBenchmarkScore,
  meetsThreshold,
  hasRequiredCapabilities,
};

/**
 * Intelligent Model Router (January 2026)
 *
 * This module provides smart model selection for Auto modes based on:
 * - Intent classification (chat, coding, image-gen, video-gen, search, etc.)
 * - Task type classification (coding, reasoning, general, agentic, multimodal)
 * - Benchmark performance for the detected task type
 * - Cost efficiency (cheapest viable model)
 * - Subscription tier (through auto mode selection)
 * - **CRITICAL: Model capabilities (vision, tools, thinking, etc.)**
 * - **NEW: Multi-modal routing for image/video/audio generation**
 * - **NEW: Automatic tool matching and suggestion**
 *
 * Architecture:
 * 1. User selects auto-economy, auto-balanced, or auto-premium
 * 2. IntentClassifier determines what the user wants (chat, image-gen, etc.)
 * 3. For non-chat intents, MultiModalRouter selects the appropriate model
 * 4. For chat intents, we classify task type and select from MODEL_POOLS
 * 5. ToolMatcher suggests relevant tools for the intent
 * 6. If user manually selects a model, bypass routing
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
 * 2. For CHAT models, add to the appropriate MODEL_POOLS below:
 *    - auto-economy: Models < $1/1M output, good for simple tasks
 *    - auto-balanced: Models $1-15/1M output, good quality/cost ratio
 *    - auto-premium: Best models regardless of cost
 *
 * 3. For NON-CHAT models (image, video, audio), add to multiModalRouter.ts:
 *    - IMAGE_MODELS, VIDEO_MODELS, TTS_MODELS, STT_MODELS, MUSIC_MODELS, SEARCH_MODELS
 *
 * 4. The router will automatically:
 *    - Classify user intent (what type of output they want)
 *    - Route to appropriate model type (chat vs image vs video, etc.)
 *    - Filter by capabilities and select optimal model
 *
 * IMPORTANT CAPABILITY NOTES (January 2026):
 * - DeepSeek Chat: NO vision (requires separate deepseek-vl model)
 * - Grok 4: NO vision (requires separate grok-2-vision model)
 * - Qwen 3: NO vision (requires separate qwen-vl model)
 * - Claude models: NO code execution sandbox (use MCP tools instead)
 * - GPT-5 Nano: Economy model, not optimized for agentic (use GPT-5.2+ for agentic)
 */

import {
  MODEL_METADATA,
  getAllowedModelsForTier,
  getTaskModelForProvider,
  normalizeModelId,
  type ModelMetadata,
} from '../constants/llm';
import {
  classifyIntent,
  classifyIntentLocally,
  getIntentClassificationPrompt,
  requiresSpecializedModel,
  getModelCategory,
  intentToTaskType,
  selectClassifierCategory,
  getClassifierCategorySpec,
  CLASSIFIER_REQUIREMENTS,
  type IntentType,
  type ClassifiedIntent,
  type ClassificationOptions,
  type ClassifierCategory,
  type ClassifierModelSpec,
} from './intentClassifier';
import {
  routeToModalityModel,
  isModalityModel,
  getModalityModelById,
  type SubscriptionTier,
  type MultiModalRoutingResult,
} from './multiModalRouter';
import {
  matchTools,
  convertMcpToolSchema,
  type McpTool,
  type ToolMatchResult,
  type MatchedTool,
} from './toolMatcher';

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

/**
 * Comprehensive routing result with all intelligence
 */
export interface IntelligentRoutingResult {
  // Model selection
  selectedModel: string;
  modelCategory: 'chat' | 'image' | 'video' | 'search' | 'tts' | 'stt' | 'music';
  wasRouted: boolean;

  // Intent classification
  intent: ClassifiedIntent;
  taskType: TaskType; // For backward compatibility

  // Tool suggestions
  suggestedTools: MatchedTool[];
  autoExecuteTools: boolean;

  // Reasoning
  reason: string;
  confidence: number;

  // Metadata
  estimatedCost?: number;
  alternativeModels?: string[];
}

// ============================================
// MODEL POOLS BY AUTO MODE
// ============================================

/**
 * Model pools are tier-restricted to control access:
 * - Economy: Budget-friendly models available to Hobby tier
 * - Balanced: Mid-tier + Economy models for Pro tier
 * - Premium: All models including flagships for Max/Enterprise tier
 *
 * BENCHMARK-FIRST ROUTING (January 2026):
 * Models within each tier are ordered by BENCHMARK PERFORMANCE.
 * The router selects the highest-benchmark model that has required capabilities.
 * Cost is used as tiebreaker when benchmarks are equal.
 *
 * Capability Legend: V=Vision, T=Tools, Th=Thinking, C=ComputerUse, A=Agentic, E=CodeExecution
 */
// =========================================================================
// HOBBY TIER (auto-economy) - Budget models, ordered by BENCHMARK
// Best benchmarks first within cost constraints
// =========================================================================
const ECONOMY_MODELS: readonly string[] = getAllowedModelsForTier('hobby');
const BALANCED_MODELS: readonly string[] = getAllowedModelsForTier('pro');
const PREMIUM_MODELS: readonly string[] = getAllowedModelsForTier('max');

export const MODEL_POOLS: Record<AutoMode, string[]> = {
  'auto-economy': [...ECONOMY_MODELS],
  'auto-balanced': [...BALANCED_MODELS],
  'auto-premium': [...PREMIUM_MODELS],
};

function buildPreferenceList(modelIds: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const models: string[] = [];

  for (const modelId of modelIds) {
    const canonicalModelId = normalizeModelId(modelId);
    if (!canonicalModelId || seen.has(canonicalModelId) || !MODEL_METADATA[canonicalModelId]) {
      continue;
    }

    seen.add(canonicalModelId);
    models.push(canonicalModelId);
  }

  return models;
}

const DEFAULT_CHAT_FALLBACK_MODEL =
  getTaskModelForProvider('google', 'fast_completion') ??
  getTaskModelForProvider('openai', 'fast_completion') ??
  'gpt-5.4-mini';

// ============================================
// MINIMUM BENCHMARK THRESHOLDS
// ============================================

/**
 * Minimum benchmark scores for a model to be considered "viable" for a task type.
 * Economy mode uses these to filter out models that won't perform well enough.
 *
 * @remarks Threshold values based on internal eval suite v2.1 (2026-02). Models below
 * these scores produced unacceptable quality regressions in internal testing.
 * Re-evaluate when new benchmark data is available (quarterly cadence recommended).
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

// ============================================
// COMPLEXITY ESTIMATION (70/20/10 Strategy)
// ============================================

/**
 * Complexity level for cost-optimized routing
 * - simple: 70% of traffic → cheapest models (DeepSeek Chat.2, Qwen Flash)
 * - moderate: 20% of traffic → mid-tier models (GLM-4.7, Gemini Flash)
 * - complex: 10% of traffic → premium-at-tier (Claude Haiku, GLM-4.6V)
 */
export type ComplexityLevel = 'simple' | 'moderate' | 'complex';

/**
 * Complexity indicators - patterns that suggest higher complexity
 */
const COMPLEXITY_INDICATORS = {
  // High complexity indicators (2 points each)
  high: [
    // Multi-step reasoning
    /step[- ]by[- ]step/i,
    /explain.*in detail/i,
    /compare and contrast/i,
    /analyze.*thoroughly/i,
    /comprehensive/i,
    // Complex coding
    /refactor.*entire/i,
    /architect/i,
    /design pattern/i,
    /microservice/i,
    /distributed system/i,
    // Academic/research
    /research paper/i,
    /peer[- ]review/i,
    /thesis/i,
    /dissertation/i,
    // Long-form content
    /write.*article/i,
    /write.*essay/i,
    /write.*report/i,
    /10+ page/i,
    /2000\+? words/i,
  ],
  // Moderate complexity indicators (1 point each)
  moderate: [
    // Multi-part questions
    /first.*then.*finally/i,
    /multiple.*questions/i,
    /several.*points/i,
    // Code generation
    /write.*function/i,
    /implement/i,
    /create.*class/i,
    /build.*component/i,
    // Explanation depth
    /how does.*work/i,
    /why does/i,
    /explain.*concept/i,
    // Creative tasks
    /creative/i,
    /brainstorm/i,
    /generate.*ideas/i,
  ],
  // Simple indicators (reduce complexity score)
  simple: [
    // Quick questions
    /what is/i,
    /who is/i,
    /when did/i,
    /where is/i,
    /^hi\b/i,
    /^hello\b/i,
    /^hey\b/i,
    // Simple tasks
    /translate/i,
    /summarize/i,
    /^fix this/i,
    /^convert/i,
    // Short responses expected
    /one word/i,
    /yes or no/i,
    /true or false/i,
    /briefly/i,
  ],
};

/**
 * Estimate the complexity of a user message for cost-optimized routing
 * Returns 'simple' (70%), 'moderate' (20%), or 'complex' (10%)
 *
 * @param message - User's input message
 * @param hasAttachments - Whether images/files are attached
 * @returns Complexity level for routing decisions
 */
export function estimateComplexity(
  message: string,
  hasAttachments: boolean = false,
): ComplexityLevel {
  let score = 0;
  let hasHighIndicator = false;

  // Length-based scoring (longer messages tend to be more complex)
  const wordCount = message.split(/\s+/).length;
  if (wordCount > 200) score += 2;
  else if (wordCount > 100) score += 1;
  else if (wordCount < 20) score -= 1;

  // Attachment complexity (images/files usually need more capable models)
  // Attachments always indicate at least moderate complexity — use +2 to
  // survive the short-message penalty.
  if (hasAttachments) {
    score += 2;
    hasHighIndicator = true;
  }

  // Pattern matching
  for (const pattern of COMPLEXITY_INDICATORS.high) {
    if (pattern.test(message)) {
      score += 2;
      hasHighIndicator = true;
    }
  }

  for (const pattern of COMPLEXITY_INDICATORS.moderate) {
    if (pattern.test(message)) score += 1;
  }

  for (const pattern of COMPLEXITY_INDICATORS.simple) {
    if (pattern.test(message)) score -= 1;
  }

  // Question count (multiple questions = more complex)
  const questionCount = (message.match(/\?/g) || []).length;
  if (questionCount >= 3) score += 2;
  else if (questionCount >= 2) score += 1;

  // Code blocks suggest technical complexity — use +2 to survive short-message penalty.
  if (message.includes('```')) {
    score += 2;
    hasHighIndicator = true;
  }

  // If a high-complexity indicator was detected, guarantee at least moderate.
  // This prevents the short-message word-count penalty from masking strong signals.
  if (hasHighIndicator && score < 2) score = 2;

  // Classify based on final score
  // Target: 70% simple, 20% moderate, 10% complex
  // Thresholds calibrated for typical message distribution
  if (score >= 4) return 'complex';
  if (score >= 2) return 'moderate';
  return 'simple';
}

/**
 * Get preferred models for each complexity level (BENCHMARK-FIRST)
 * Used by selectModelFromPool to prioritize highest quality within each tier
 *
 * Based on January 2026 benchmarks:
 * - Coding: Claude Opus 4.6 (80.9% SWE-bench), GPT-5.2 (80.0%), GLM-4.7 (73.8%)
 * - General: GPT-5.2 (93.2% MMLU), Gemini 3 (88.6% MMLU), GLM-4.7 (88% MMLU)
 * - Agentic: GPT-5.2 (97% τ²-bench), Claude Opus 4.6 for orchestration
 * - Reasoning: GPT-5.2 (100% AIME), GLM-4.7 (95.7% AIME)
 */
export const COMPLEXITY_MODEL_PREFERENCES: Record<ComplexityLevel, string[]> = {
  simple: buildPreferenceList([
    getTaskModelForProvider('openai', 'fast_completion'),
    getTaskModelForProvider('google', 'fast_completion'),
    getTaskModelForProvider('xai', 'fast_completion'),
    getTaskModelForProvider('deepseek', 'chat'),
    getTaskModelForProvider('qwen', 'chat'),
  ]),
  moderate: buildPreferenceList([
    getTaskModelForProvider('google', 'chat'),
    getTaskModelForProvider('xai', 'chat'),
    getTaskModelForProvider('openai', 'chat'),
    getTaskModelForProvider('moonshot', 'chat'),
    getTaskModelForProvider('deepseek', 'chat'),
  ]),
  complex: buildPreferenceList([
    getTaskModelForProvider('openai', 'chat'),
    getTaskModelForProvider('anthropic', 'chat'),
    getTaskModelForProvider('anthropic', 'complex_reasoning'),
    getTaskModelForProvider('google', 'long_context'),
    getTaskModelForProvider('moonshot', 'long_context'),
  ]),
};

/**
 * Task-specific model preferences based on January 2026 public opinion
 * These override complexity preferences when task type is known
 */
export const TASK_MODEL_PREFERENCES: Record<TaskType, string[]> = {
  coding: buildPreferenceList([
    getTaskModelForProvider('anthropic', 'complex_reasoning'),
    getTaskModelForProvider('openai', 'code_generation'),
    getTaskModelForProvider('anthropic', 'code_generation'),
    getTaskModelForProvider('google', 'code_generation'),
    getTaskModelForProvider('xai', 'code_generation'),
    getTaskModelForProvider('deepseek', 'chat'),
  ]),
  reasoning: buildPreferenceList([
    getTaskModelForProvider('openai', 'complex_reasoning'),
    getTaskModelForProvider('anthropic', 'complex_reasoning'),
    getTaskModelForProvider('google', 'complex_reasoning'),
    getTaskModelForProvider('xai', 'complex_reasoning'),
    getTaskModelForProvider('moonshot', 'chat'),
  ]),
  general: buildPreferenceList([
    getTaskModelForProvider('openai', 'chat'),
    getTaskModelForProvider('anthropic', 'chat'),
    getTaskModelForProvider('google', 'chat'),
    getTaskModelForProvider('deepseek', 'chat'),
    getTaskModelForProvider('xai', 'chat'),
  ]),
  agentic: buildPreferenceList([
    getTaskModelForProvider('openai', 'chat'),
    getTaskModelForProvider('anthropic', 'chat'),
    getTaskModelForProvider('google', 'chat'),
    getTaskModelForProvider('xai', 'chat'),
    getTaskModelForProvider('moonshot', 'long_context'),
  ]),
  multimodal: buildPreferenceList([
    getTaskModelForProvider('openai', 'vision'),
    getTaskModelForProvider('google', 'vision'),
    getTaskModelForProvider('anthropic', 'vision'),
    getTaskModelForProvider('zhipu', 'vision'),
    getTaskModelForProvider('moonshot', 'long_context'),
  ]),
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

/** Weights for benchmark scoring — derived from internal model evaluation (2026-02) */
const BENCHMARK_WEIGHTS = {
  /** Primary score weight for coding tasks (SWE-bench accuracy) */
  CODING_PRIMARY: 0.7,
  /** Secondary score weight for coding tasks (HumanEval pass rate) */
  CODING_SECONDARY: 0.3,
  /** Primary score weight for reasoning tasks (GPQA accuracy) */
  REASONING_PRIMARY: 0.5,
  /** Secondary score weight for reasoning tasks (AIME accuracy) */
  REASONING_SECONDARY: 0.5,
  /** Primary score weight for agentic tasks (SWE-bench accuracy) */
  AGENTIC_PRIMARY: 0.5,
  /** Secondary score weight for agentic tasks (MMLU general ability) */
  AGENTIC_SECONDARY: 0.5,
  /** Boost multiplier applied when model has verified agentic capability */
  AGENTIC_CAPABLE_BOOST: 1.2,
  /** Penalty multiplier applied when model lacks agentic capability */
  AGENTIC_INCAPABLE_PENALTY: 0.5,
  /** Boost multiplier applied when model has vision capability for multimodal tasks */
  MULTIMODAL_VISION_BOOST: 1.1,
} as const;

/**
 * Get the benchmark score for a model based on task type
 */
function getBenchmarkScore(model: ModelMetadata, taskType: TaskType): number {
  if (!model.benchmarks) return 0;

  switch (taskType) {
    case 'coding':
      return (
        (model.benchmarks.swebench ?? 0) * BENCHMARK_WEIGHTS.CODING_PRIMARY +
        (model.benchmarks.humaneval ?? 0) * BENCHMARK_WEIGHTS.CODING_SECONDARY
      );
    case 'reasoning':
      return (
        (model.benchmarks.gpqa ?? 0) * BENCHMARK_WEIGHTS.REASONING_PRIMARY +
        (model.benchmarks.aime ?? 0) * BENCHMARK_WEIGHTS.REASONING_SECONDARY
      );
    case 'general':
      return model.benchmarks.mmlu ?? 0;
    case 'agentic': {
      // Agentic tasks need coding ability + tool use capability
      const baseScore =
        (model.benchmarks.swebench ?? 0) * BENCHMARK_WEIGHTS.AGENTIC_PRIMARY +
        (model.benchmarks.mmlu ?? 0) * BENCHMARK_WEIGHTS.AGENTIC_SECONDARY;
      return model.capabilities.agentic
        ? baseScore * BENCHMARK_WEIGHTS.AGENTIC_CAPABLE_BOOST
        : baseScore * BENCHMARK_WEIGHTS.AGENTIC_INCAPABLE_PENALTY;
    }
    case 'multimodal': {
      // Multimodal needs vision + general intelligence
      const mmluScore = model.benchmarks.mmlu ?? 0;
      return model.capabilities.vision ? mmluScore * BENCHMARK_WEIGHTS.MULTIMODAL_VISION_BOOST : 0;
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
      // Models without vision: DeepSeek Chat, Grok 4, Qwen 3
      return model.capabilities.vision === true;

    case 'agentic':
      // HARD REQUIREMENT: Model must support tools for agentic tasks
      // PREFERRED: Model should be optimized for agentic workflows
      return model.capabilities.tools === true && model.capabilities.agentic === true;

    case 'coding':
      // SOFT REQUIREMENT: Tools help with coding but aren't strictly required
      return model.capabilities.tools === true;

    default:
      // reasoning, general, or any unknown task type — no hard capability gate
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
 * Uses 70/20/10 complexity-based routing for economy mode
 * Uses task-specific preferences for Pro+ tiers based on January 2026 research
 * Prioritizes: BENCHMARK FIRST - best quality model, with cost as tiebreaker
 *
 * @param pool - Available models for this tier
 * @param taskType - Type of task (coding, reasoning, general, etc.)
 * @param autoMode - Auto mode (economy/balanced/premium)
 * @param message - Optional message for complexity estimation
 * @param hasAttachments - Whether attachments are present
 */
export function selectModelFromPool(
  pool: string[],
  taskType: TaskType,
  autoMode: AutoMode,
  message?: string,
  hasAttachments?: boolean,
): { modelId: string; reason: string; complexity?: ComplexityLevel } {
  // For Pro+ tiers, use task-specific preferences from public opinion research
  if (autoMode !== 'auto-economy') {
    const taskPreferences = TASK_MODEL_PREFERENCES[taskType];

    // Find first preferred model that's in the pool and has required capabilities
    for (const preferredId of taskPreferences) {
      if (pool.includes(preferredId)) {
        const model = MODEL_METADATA[preferredId];
        if (model && hasRequiredCapabilities(model, taskType) && meetsThreshold(model, taskType)) {
          return {
            modelId: preferredId,
            reason: `${taskType} task → ${model.name} (public consensus choice)`,
          };
        }
      }
    }
    // Fall through to standard selection if no task-preferred model found
  }

  // For economy mode, use 70/20/10 complexity-based routing
  if (autoMode === 'auto-economy' && message) {
    const complexity = estimateComplexity(message, hasAttachments);
    const preferredModels = COMPLEXITY_MODEL_PREFERENCES[complexity];

    // Find first preferred model that's in the pool and has required capabilities
    for (const preferredId of preferredModels) {
      if (pool.includes(preferredId)) {
        const model = MODEL_METADATA[preferredId];
        if (model && hasRequiredCapabilities(model, taskType) && meetsThreshold(model, taskType)) {
          const benchmarkScore = getBenchmarkScore(model, taskType);
          return {
            modelId: preferredId,
            reason: `${complexity} complexity → ${model.name} (${benchmarkScore.toFixed(1)}% benchmark)`,
            complexity,
          };
        }
      }
    }
    // If no preferred model found, fall through to standard selection
  }

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
    // Fallback: Try to find ANY model with required capabilities (ignore benchmark thresholds)
    for (const modelId of pool) {
      const model = MODEL_METADATA[modelId];
      if (model && hasRequiredCapabilities(model, taskType)) {
        return {
          modelId,
          reason: `Fallback to ${model.name} - only model with required capabilities for ${taskType}`,
        };
      }
    }

    // Last resort: First model in pool (better than nothing)
    const firstModelId = pool[0] ?? DEFAULT_CHAT_FALLBACK_MODEL;
    const fallback = MODEL_METADATA[firstModelId];
    return {
      modelId: firstModelId,
      reason: `Last resort fallback to ${fallback?.name ?? firstModelId} - no models met criteria`,
    };
  }

  // BENCHMARK-FIRST ROUTING: All tiers prioritize quality (benchmark score)
  // Cost is ONLY used as a tiebreaker when benchmarks are similar (within 0.5%)
  // This ensures users always get the best quality model available in their tier
  candidates.sort((a, b) => {
    // Primary sort: highest benchmark score wins
    const scoreDiff = b.score - a.score;
    if (Math.abs(scoreDiff) > 0.5) {
      // Meaningful difference in benchmark - use benchmark
      return scoreDiff;
    }
    // Tiebreaker: lower cost wins when benchmarks are essentially equal
    return a.cost - b.cost;
  });

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
 * Uses 70/20/10 complexity-based routing for economy tier
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
): RoutingResult & { complexity?: ComplexityLevel } {
  // Force multimodal if images are present
  if (hasImages) {
    const pool = MODEL_POOLS[autoMode];
    const { modelId, reason, complexity } = selectModelFromPool(
      pool,
      'multimodal',
      autoMode,
      message,
      true,
    );

    return {
      selectedModel: modelId,
      taskType: 'multimodal',
      reason: `Image detected. ${reason}`,
      confidence: 1.0,
      complexity,
    };
  }

  // Try local classification first (fast, free)
  const localResult = classifyTaskLocally(message);

  if (localResult && localResult.confidence >= 0.7) {
    const pool = MODEL_POOLS[autoMode];
    const { modelId, reason, complexity } = selectModelFromPool(
      pool,
      localResult.taskType,
      autoMode,
      message,
      false,
    );

    return {
      selectedModel: modelId,
      taskType: localResult.taskType,
      reason: `Keywords: [${localResult.keywords.slice(0, 3).join(', ')}]. ${reason}`,
      confidence: localResult.confidence,
      complexity,
    };
  }

  // Low confidence local classification — use classifyIntentLocally for a content-aware
  // task type instead of always returning a hardcoded 'general' / 'reasoning' default.
  // classifyIntentLocally runs entirely in-process (no network, no cost) and always
  // returns a result at 'hobby' tier, making it safe to call synchronously here.
  // The returned IntentType is mapped to a TaskType via intentToTaskType().
  //
  // For Pro+ tiers, use routeMessageAsync() which accepts an llmClassify callback
  // for higher-accuracy classification via a fast model (e.g. Gemini Flash / GPT-5 Nano).
  let inferredTaskType: TaskType = autoMode === 'auto-premium' ? 'reasoning' : 'general';

  const intentResult = classifyIntentLocally(message, {
    tier: 'hobby',
    hasAttachments: false,
    attachmentTypes: [],
  });

  if (intentResult && intentResult.confidence >= 0.4) {
    inferredTaskType = intentToTaskType(intentResult.primary);
  }

  const pool = MODEL_POOLS[autoMode];
  const { modelId, reason, complexity } = selectModelFromPool(
    pool,
    inferredTaskType,
    autoMode,
    message,
    false,
  );

  return {
    selectedModel: modelId,
    taskType: inferredTaskType,
    reason: `Low-confidence local classification (${intentResult?.primary ?? 'unknown'} → ${inferredTaskType}). ${reason}`,
    confidence: intentResult?.confidence ?? 0.4,
    complexity,
  };
}

// ============================================
// BYPASS CHECK
// ============================================

/**
 * Check if the selected model is a manual selection (bypass auto routing)
 * Returns true if the model was manually selected from QuickModelSelector
 *
 * A manual selection is when the user explicitly chose a specific model
 * (like 'claude-sonnet-4.5' or 'gpt-5.4'), NOT an auto mode.
 *
 * Auto modes that trigger routing:
 * - 'auto' (legacy)
 * - 'auto-economy'
 * - 'auto-balanced'
 * - 'auto-premium'
 */
export function isManualSelection(selectedModel: string): boolean {
  // Auto modes are not manual selections - they trigger routing
  if (selectedModel === 'auto' || selectedModel.startsWith('auto-')) {
    return false;
  }

  // Any specific model selection bypasses routing
  // Even if the model is not in MODEL_METADATA, we treat it as a manual selection
  // to respect the user's explicit choice
  return true;
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
): { modelId: string; taskType: TaskType; reason: string; wasRouted: boolean } {
  // Manual selection bypasses routing
  if (isManualSelection(selectedModel)) {
    const metadata = MODEL_METADATA[selectedModel];
    return {
      modelId: selectedModel,
      taskType: 'general',
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
      taskType: result.taskType,
      reason: result.reason,
      wasRouted: true,
    };
  }

  // Legacy 'auto' mode - treat as balanced
  if (selectedModel === 'auto') {
    const result = routeMessage(message, 'auto-balanced', hasImages);
    return {
      modelId: result.selectedModel,
      taskType: result.taskType,
      reason: result.reason,
      wasRouted: true,
    };
  }

  // Unknown - fallback to the selection
  return {
    modelId: selectedModel,
    taskType: 'general',
    reason: 'Unknown model, using as-is',
    wasRouted: false,
  };
}

// ============================================
// ASYNC ROUTING FOR PRO+ TIERS
// ============================================

/**
 * Async version of routeMessage that uses LLM classification for Pro+ tiers.
 * When local classification has low confidence and an llmClassify callback is
 * provided, it sends the ambiguous message to a fast/cheap model (e.g. Gemini
 * Flash, GPT-5 Nano) for more accurate task type classification.
 *
 * Economy tier always uses local-only classification (no extra LLM call cost).
 */
export async function routeMessageAsync(
  message: string,
  autoMode: AutoMode,
  hasImages: boolean = false,
  llmClassify?: (prompt: string) => Promise<string>,
): Promise<RoutingResult & { complexity?: ComplexityLevel }> {
  // Force multimodal if images are present
  if (hasImages) {
    const pool = MODEL_POOLS[autoMode];
    const { modelId, reason, complexity } = selectModelFromPool(
      pool,
      'multimodal',
      autoMode,
      message,
      true,
    );
    return {
      selectedModel: modelId,
      taskType: 'multimodal',
      reason: `Image detected. ${reason}`,
      confidence: 1.0,
      complexity,
    };
  }

  // Try local classification first (fast, free)
  const localResult = classifyTaskLocally(message);

  if (localResult && localResult.confidence >= 0.7) {
    const pool = MODEL_POOLS[autoMode];
    const { modelId, reason, complexity } = selectModelFromPool(
      pool,
      localResult.taskType,
      autoMode,
      message,
      false,
    );
    return {
      selectedModel: modelId,
      taskType: localResult.taskType,
      reason: `Keywords: [${localResult.keywords.slice(0, 3).join(', ')}]. ${reason}`,
      confidence: localResult.confidence,
      complexity,
    };
  }

  // For Pro+ tiers with low-confidence local classification, use LLM classifier
  if (autoMode !== 'auto-economy' && llmClassify) {
    try {
      const prompt = getClassificationPrompt(message);
      const llmResponse = await llmClassify(prompt);
      const llmTaskType = parseClassificationResponse(llmResponse);

      const pool = MODEL_POOLS[autoMode];
      const { modelId, reason, complexity } = selectModelFromPool(
        pool,
        llmTaskType,
        autoMode,
        message,
        false,
      );
      return {
        selectedModel: modelId,
        taskType: llmTaskType,
        reason: `LLM classified as ${llmTaskType}. ${reason}`,
        confidence: 0.85,
        complexity,
      };
    } catch {
      // LLM classification failed — fall through to local intent classification
    }
  }

  // Fallback: local intent classification (same as sync routeMessage)
  let inferredTaskType: TaskType = autoMode === 'auto-premium' ? 'reasoning' : 'general';

  const intentResult = classifyIntentLocally(message, {
    tier: 'hobby',
    hasAttachments: false,
    attachmentTypes: [],
  });

  if (intentResult && intentResult.confidence >= 0.4) {
    inferredTaskType = intentToTaskType(intentResult.primary);
  }

  const pool = MODEL_POOLS[autoMode];
  const { modelId, reason, complexity } = selectModelFromPool(
    pool,
    inferredTaskType,
    autoMode,
    message,
    false,
  );

  return {
    selectedModel: modelId,
    taskType: inferredTaskType,
    reason: `Local classification (${intentResult?.primary ?? 'unknown'} → ${inferredTaskType}). ${reason}`,
    confidence: intentResult?.confidence ?? 0.4,
    complexity,
  };
}

/**
 * Async version of getModelForRequest for Pro+ tiers.
 * Uses LLM-based classification when local confidence is low.
 *
 * @param selectedModel - The user's selected model or auto mode
 * @param message - The user's message
 * @param hasImages - Whether images are attached
 * @param llmClassify - Optional callback for LLM-based classification (Pro+ only)
 */
export async function getModelForRequestAsync(
  selectedModel: string,
  message: string,
  hasImages: boolean = false,
  llmClassify?: (prompt: string) => Promise<string>,
): Promise<{ modelId: string; taskType: TaskType; reason: string; wasRouted: boolean }> {
  // Manual selection bypasses routing
  if (isManualSelection(selectedModel)) {
    const metadata = MODEL_METADATA[selectedModel];
    return {
      modelId: selectedModel,
      taskType: 'general',
      reason: `Manual selection: ${metadata?.name || selectedModel}`,
      wasRouted: false,
    };
  }

  // Auto mode - perform async routing
  const autoMode: AutoMode =
    selectedModel === 'auto-economy' ||
    selectedModel === 'auto-balanced' ||
    selectedModel === 'auto-premium'
      ? (selectedModel as AutoMode)
      : 'auto-balanced'; // Legacy 'auto' → balanced

  const result = await routeMessageAsync(message, autoMode, hasImages, llmClassify);
  return {
    modelId: result.selectedModel,
    taskType: result.taskType,
    reason: result.reason,
    wasRouted: true,
  };
}

// ============================================
// INTELLIGENT ROUTING (NEW - January 2026)
// ============================================

/**
 * Map AutoMode to SubscriptionTier for multi-modal routing
 */
function autoModeToTier(autoMode: AutoMode): SubscriptionTier {
  switch (autoMode) {
    case 'auto-economy':
      return 'hobby';
    case 'auto-balanced':
      return 'pro';
    case 'auto-premium':
      return 'max';
    default:
      return 'pro';
  }
}

/**
 * Intelligently route a message to the optimal model with full context
 *
 * This is the main entry point for the intelligent routing system.
 * It performs intent classification, routes to the appropriate model type,
 * and suggests relevant tools.
 *
 * @param message - User's message
 * @param autoMode - Auto mode (economy/balanced/premium)
 * @param options - Additional routing options
 * @param llmClassify - Optional LLM function for intent classification (Pro+ tiers)
 * @returns Comprehensive routing result
 */
export async function routeIntelligently(
  message: string,
  autoMode: AutoMode,
  options: {
    hasImages?: boolean;
    hasAudio?: boolean;
    hasVideo?: boolean;
    conversationContext?: string;
    availableMcpTools?: Array<{
      id: string;
      name: string;
      description: string;
      parameters?: Record<string, { type: string; description?: string; required?: boolean }>;
    }>;
    userPreferences?: {
      preferQuality?: boolean;
      preferSpeed?: boolean;
      preferCost?: boolean;
      preferredProvider?: string;
    };
  } = {},
  llmClassify?: (prompt: string) => Promise<string>,
): Promise<IntelligentRoutingResult> {
  const tier = autoModeToTier(autoMode);

  // Build classification options
  const classificationOptions: ClassificationOptions = {
    tier,
    hasAttachments: !!(options.hasImages || options.hasAudio || options.hasVideo),
    attachmentTypes: [
      ...(options.hasImages ? ['image' as const] : []),
      ...(options.hasAudio ? ['audio' as const] : []),
      ...(options.hasVideo ? ['video' as const] : []),
    ],
    conversationContext: options.conversationContext,
    // Map routing preferences to classification preferences
    userPreferences: options.userPreferences
      ? {
          preferredSearchDepth: options.userPreferences.preferQuality
            ? 'deep'
            : options.userPreferences.preferSpeed
              ? 'quick'
              : 'thorough',
        }
      : undefined,
  };

  // Step 1: Classify intent
  const intent = await classifyIntent(message, classificationOptions, llmClassify);

  // Step 2: Convert MCP tools for tool matching
  const mcpTools: McpTool[] = (options.availableMcpTools || []).map(convertMcpToolSchema);

  // Step 3: Match tools based on intent
  const toolMatch = matchTools(intent.primary, message, mcpTools);

  // Step 4: Route to appropriate model
  let selectedModel: string;
  let modelCategory: IntelligentRoutingResult['modelCategory'] = 'chat';
  let reason: string;
  let estimatedCost: number | undefined;
  let alternativeModels: string[] | undefined;

  // Check if intent requires specialized (non-chat) model
  if (requiresSpecializedModel(intent.primary)) {
    const modalityResult = routeToModalityModel(intent.primary, tier, options.userPreferences);

    if (modalityResult) {
      selectedModel = modalityResult.selectedModel;
      modelCategory = getModelCategory(intent.primary);
      reason = modalityResult.reason;
      estimatedCost = modalityResult.estimatedCost;
      alternativeModels = modalityResult.alternativeModels;
    } else {
      // Fallback to chat if modality routing fails
      const chatResult = routeMessage(message, autoMode, options.hasImages);
      selectedModel = chatResult.selectedModel;
      reason = `Modality routing unavailable. ${chatResult.reason}`;
    }
  } else {
    // Use standard chat model routing
    const taskType = intentToTaskType(intent.primary);
    const pool = MODEL_POOLS[autoMode];
    const { modelId, reason: selectionReason } = selectModelFromPool(
      pool,
      taskType,
      autoMode,
      message,
      classificationOptions.hasAttachments,
    );

    selectedModel = modelId;
    reason = `Intent: ${intent.primary}. ${selectionReason}`;
  }

  // Build comprehensive result
  return {
    selectedModel,
    modelCategory,
    wasRouted: true,
    intent,
    taskType: intentToTaskType(intent.primary),
    suggestedTools: toolMatch.suggestedTools,
    autoExecuteTools: toolMatch.autoExecute,
    reason,
    confidence: intent.confidence,
    estimatedCost,
    alternativeModels,
  };
}

/**
 * Synchronous version of intelligent routing (uses local classification only)
 * Use this when you don't need LLM-based classification
 */
export function routeIntelligentlySync(
  message: string,
  autoMode: AutoMode,
  options: {
    hasImages?: boolean;
    hasAudio?: boolean;
    hasVideo?: boolean;
    availableMcpTools?: Array<{
      id: string;
      name: string;
      description: string;
    }>;
    userPreferences?: {
      preferQuality?: boolean;
      preferSpeed?: boolean;
      preferCost?: boolean;
      preferredProvider?: string;
    };
  } = {},
): IntelligentRoutingResult {
  const tier = autoModeToTier(autoMode);

  // Build classification options
  const classificationOptions: ClassificationOptions = {
    tier, // Use computed tier from autoMode (local classification is already guaranteed by classifyIntentLocally)
    hasAttachments: !!(options.hasImages || options.hasAudio || options.hasVideo),
    attachmentTypes: [
      ...(options.hasImages ? ['image' as const] : []),
      ...(options.hasAudio ? ['audio' as const] : []),
      ...(options.hasVideo ? ['video' as const] : []),
    ],
  };

  // Step 1: Classify intent locally
  const intent = classifyIntentLocally(message, classificationOptions) || {
    primary: 'chat' as IntentType,
    confidence: 0.5,
    keywords: [],
    requiredCapabilities: [],
    suggestedTools: [],
  };

  // Step 2: Convert MCP tools for tool matching
  const mcpTools: McpTool[] = (options.availableMcpTools || []).map((t) =>
    convertMcpToolSchema({ ...t, parameters: undefined }),
  );

  // Step 3: Match tools based on intent
  const toolMatch = matchTools(intent.primary, message, mcpTools);

  // Step 4: Route to appropriate model
  let selectedModel: string;
  let modelCategory: IntelligentRoutingResult['modelCategory'] = 'chat';
  let reason: string;
  let estimatedCost: number | undefined;
  let alternativeModels: string[] | undefined;

  // Check if intent requires specialized (non-chat) model
  if (requiresSpecializedModel(intent.primary)) {
    const modalityResult = routeToModalityModel(intent.primary, tier, options.userPreferences);

    if (modalityResult) {
      selectedModel = modalityResult.selectedModel;
      modelCategory = getModelCategory(intent.primary);
      reason = modalityResult.reason;
      estimatedCost = modalityResult.estimatedCost;
      alternativeModels = modalityResult.alternativeModels;
    } else {
      // Fallback to chat
      const chatResult = routeMessage(message, autoMode, options.hasImages);
      selectedModel = chatResult.selectedModel;
      reason = `Modality routing unavailable. ${chatResult.reason}`;
    }
  } else {
    // Use standard chat model routing
    const taskType = intentToTaskType(intent.primary);
    const pool = MODEL_POOLS[autoMode];
    const { modelId, reason: selectionReason } = selectModelFromPool(
      pool,
      taskType,
      autoMode,
      message,
      classificationOptions.hasAttachments,
    );

    selectedModel = modelId;
    reason = `Intent: ${intent.primary}. ${selectionReason}`;
  }

  return {
    selectedModel,
    modelCategory,
    wasRouted: true,
    intent,
    taskType: intentToTaskType(intent.primary),
    suggestedTools: toolMatch.suggestedTools,
    autoExecuteTools: toolMatch.autoExecute,
    reason,
    confidence: intent.confidence,
    estimatedCost,
    alternativeModels,
  };
}

/**
 * Get the LLM prompt for intent classification
 * This can be used to get the prompt for external LLM calls
 */
export function getIntentPrompt(message: string, conversationContext?: string): string {
  return getIntentClassificationPrompt(message, {
    tier: 'pro',
    hasAttachments: false,
    attachmentTypes: [],
    conversationContext,
  });
}

/**
 * Check if a model is a modality model (image, video, etc.) vs chat
 */
export { isModalityModel, getModalityModelById };

/**
 * Re-export classifier utilities for consumers
 */
export { selectClassifierCategory, getClassifierCategorySpec, CLASSIFIER_REQUIREMENTS };

/**
 * Re-export types for consumers
 */
export type {
  IntentType,
  ClassifiedIntent,
  McpTool,
  ToolMatchResult,
  MatchedTool,
  SubscriptionTier,
  MultiModalRoutingResult,
  ClassifierCategory,
  ClassifierModelSpec,
};

// ============================================
// EXPORTS FOR TESTING AND UI
// ============================================

export const _internal = {
  getEffectiveCost,
  getBenchmarkScore,
  meetsThreshold,
  hasRequiredCapabilities,
  autoModeToTier,
  estimateComplexity,
  COMPLEXITY_INDICATORS,
  COMPLEXITY_MODEL_PREFERENCES,
  TASK_MODEL_PREFERENCES,
};

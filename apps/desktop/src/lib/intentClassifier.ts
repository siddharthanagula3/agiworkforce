/**
 * Intelligent Intent Classifier (January 2026)
 *
 * This module classifies user intent into specific categories for multi-modal routing.
 * It determines what type of output the user wants (chat, image, video, audio, etc.)
 * and what tools/capabilities are needed.
 *
 * Architecture:
 * 1. For Hobby tier: Fast keyword-based classification (free, instant)
 * 2. For Pro+ tiers: Uses a fast, cheap classifier model with recent knowledge cutoff
 * 3. Returns structured intent with confidence and required capabilities
 *
 * CLASSIFIER MODEL SELECTION (January 2026):
 * We use the fastest, cheapest model with the most recent knowledge cutoff for classification.
 * This ensures the classifier understands modern terminology, tools, and user expectations.
 *
 * Recommended classifier models (in order of preference):
 * 1. gemini-2.0-flash - $0.10/$0.40, extremely fast, Dec 2025 cutoff, 1M context
 * 2. grok-4.1-fast-reasoning - $0.10/$0.40, fast with reasoning, Jan 2026 cutoff
 * 3. gpt-5-nano - $0.05/$0.40, cheapest, Nov 2025 cutoff
 *
 * Intent Types:
 * - Chat: Regular conversation, Q&A, explanations
 * - Coding: Code generation, debugging, review
 * - Reasoning: Complex analysis, math, logic puzzles
 * - Agentic: Browser automation, workflows, multi-step tasks
 * - Multimodal: Tasks involving image/video analysis (input)
 * - Image Generation: Create images from text
 * - Video Generation: Create videos from text
 * - Search: Web search, research queries
 * - Deep Research: In-depth research with multiple sources
 * - TTS: Text-to-speech conversion
 * - STT: Speech-to-text transcription
 * - Music: Music generation
 */

import type { ModelMetadata } from '../constants/llm';

// ============================================
// CLASSIFIER MODEL CONFIGURATION
// ============================================

/**
 * Classifier Model Requirements
 *
 * Based on industry research (January 2026):
 * - Hybrid approach: Local keyword matching + LLM classification for ambiguous cases
 * - Separation of concerns: Router (classification) vs Task execution (main model)
 * - NVIDIA LLM Router: Uses semantic classification with small models (~1.7B params)
 * - vLLM Semantic Router: Uses lightweight classifiers like ModernBERT
 * - Key insight: 47% latency reduction, 48% token savings with smart routing
 *
 * Classifier Model Requirements (model-agnostic):
 * 1. Fast: <200ms latency for classification prompts
 * 2. Cheap: <$0.50/1M tokens input (classification is ~200 tokens = ~$0.0001)
 * 3. Recent: Knowledge cutoff within last 6 months for modern tool/API awareness
 * 4. Accurate: Good at structured output (JSON) and classification tasks
 *
 * Sources:
 * - https://arize.com/blog/best-practices-for-building-an-ai-agent-router/
 * - https://build.nvidia.com/nvidia/llm-router
 * - https://www.redhat.com/en/blog/bringing-intelligent-efficient-routing-open-source-ai-vllm-semantic-router
 */
export interface ClassifierModelSpec {
  /** Minimum requirements for a classifier model */
  requirements: {
    maxLatencyMs: number;
    maxInputCostPer1M: number;
    maxKnowledgeAgeMonths: number;
    requiresStructuredOutput: boolean;
  };
  /** Preferred capabilities (soft requirements) */
  preferences: {
    supportsJsonMode: boolean;
    supportsFunctionCalling: boolean;
    hasReasoningCapability: boolean;
  };
}

/**
 * Default classifier requirements
 * Any model meeting these specs can be used for intent classification
 */
export const CLASSIFIER_REQUIREMENTS: ClassifierModelSpec = {
  requirements: {
    maxLatencyMs: 300, // Must respond quickly
    maxInputCostPer1M: 0.5, // Must be cheap (classification is overhead)
    maxKnowledgeAgeMonths: 6, // Must understand modern tools/APIs
    requiresStructuredOutput: true, // Must return valid JSON
  },
  preferences: {
    supportsJsonMode: true, // Prefer native JSON mode
    supportsFunctionCalling: true, // Prefer function calling support
    hasReasoningCapability: false, // Not needed for simple classification
  },
};

/**
 * Model categories for classifier selection (provider-agnostic)
 * The actual model is selected at runtime based on available providers
 */
export type ClassifierCategory = 'flash' | 'mini' | 'nano' | 'reasoning';

/**
 * Get classifier category description
 */
export function getClassifierCategorySpec(category: ClassifierCategory): {
  description: string;
  targetLatencyMs: number;
  targetCostPer1M: number;
  useCase: string;
} {
  switch (category) {
    case 'flash':
      return {
        description: 'Fastest available model from any provider',
        targetLatencyMs: 150,
        targetCostPer1M: 0.15,
        useCase: 'Real-time classification with minimal latency',
      };
    case 'mini':
      return {
        description: 'Small, efficient model optimized for classification',
        targetLatencyMs: 200,
        targetCostPer1M: 0.2,
        useCase: 'Balanced speed and accuracy for most use cases',
      };
    case 'nano':
      return {
        description: 'Smallest, cheapest model available',
        targetLatencyMs: 250,
        targetCostPer1M: 0.1,
        useCase: 'High-volume classification with cost constraints',
      };
    case 'reasoning':
      return {
        description: 'Model with reasoning capability for complex classification',
        targetLatencyMs: 400,
        targetCostPer1M: 0.5,
        useCase: 'Ambiguous intents requiring deeper analysis',
      };
  }
}

/**
 * Select the best classifier category based on use case
 */
export function selectClassifierCategory(options: {
  preferSpeed?: boolean;
  preferAccuracy?: boolean;
  preferCost?: boolean;
  isAmbiguous?: boolean;
}): ClassifierCategory {
  if (options.isAmbiguous || options.preferAccuracy) {
    return 'reasoning';
  }
  if (options.preferSpeed) {
    return 'flash';
  }
  if (options.preferCost) {
    return 'nano';
  }
  return 'mini'; // Default balanced option
}

/**
 * User-facing routing modes (similar to OpenAI's Auto/Fast/Thinking)
 * These simplify the complexity for end users
 */
export type UserRoutingMode = 'auto' | 'fast' | 'thinking' | 'creative';

/**
 * Map user routing mode to internal classification strategy
 */
export function getClassificationStrategy(mode: UserRoutingMode): {
  useLocalFirst: boolean;
  localConfidenceThreshold: number;
  classifierPreference: 'speed' | 'accuracy' | 'cost';
  allowThinkingModels: boolean;
} {
  switch (mode) {
    case 'fast':
      return {
        useLocalFirst: true,
        localConfidenceThreshold: 0.5, // Accept lower confidence local results
        classifierPreference: 'speed',
        allowThinkingModels: false,
      };
    case 'thinking':
      return {
        useLocalFirst: false, // Always use LLM for better accuracy
        localConfidenceThreshold: 0.95, // Only skip LLM if very confident
        classifierPreference: 'accuracy',
        allowThinkingModels: true,
      };
    case 'creative':
      return {
        useLocalFirst: true,
        localConfidenceThreshold: 0.7,
        classifierPreference: 'speed',
        allowThinkingModels: false,
      };
    case 'auto':
    default:
      return {
        useLocalFirst: true,
        localConfidenceThreshold: 0.7,
        classifierPreference: 'speed',
        allowThinkingModels: true, // Let the router decide
      };
  }
}

// ============================================
// TYPES
// ============================================

/**
 * Extended intent types covering all modalities
 */
export type IntentType =
  | 'chat' // General conversation
  | 'coding' // Code generation/debugging
  | 'reasoning' // Complex analysis/math
  | 'agentic' // Browser/automation/multi-step
  | 'multimodal' // Image/video analysis (input)
  | 'image-gen' // Image generation (output)
  | 'video-gen' // Video generation (output)
  | 'search' // Web search
  | 'deep-research' // In-depth research
  | 'tts' // Text-to-speech
  | 'stt' // Speech-to-text
  | 'music'; // Music generation

/**
 * Tool categories that can be matched to intents
 */
export type ToolCategory =
  | 'browser'
  | 'file-system'
  | 'code-execution'
  | 'search'
  | 'image'
  | 'video'
  | 'audio'
  | 'database'
  | 'api'
  | 'communication';

/**
 * Classified intent with confidence and metadata
 */
export interface ClassifiedIntent {
  primary: IntentType;
  secondary?: IntentType; // For hybrid tasks
  confidence: number; // 0-1
  keywords: string[];
  requiredCapabilities: Array<keyof ModelMetadata['capabilities']>;
  suggestedTools: ToolCategory[];
  reasoning?: string; // LLM's reasoning (for Pro+ tiers)
}

/**
 * Options for intent classification
 */
export interface ClassificationOptions {
  tier: 'hobby' | 'pro' | 'max' | 'enterprise';
  hasAttachments: boolean;
  attachmentTypes: Array<'image' | 'audio' | 'video' | 'document'>;
  conversationContext?: string; // Previous messages for context
  userPreferences?: {
    preferredImageModel?: string;
    preferredVideoModel?: string;
    preferredSearchDepth?: 'quick' | 'thorough' | 'deep';
  };
}

// ============================================
// INTENT KEYWORDS
// ============================================

/**
 * Keywords for fast local classification
 * Organized by intent type with high-confidence and medium-confidence patterns
 */
const INTENT_KEYWORDS: Record<IntentType, { high: string[]; medium: string[] }> = {
  chat: {
    high: [
      'tell me about',
      'what is',
      'explain',
      'how does',
      'help me understand',
      'can you describe',
      'summarize',
      'translate',
    ],
    medium: ['question', 'curious', 'wondering', 'think about', 'opinion'],
  },
  coding: {
    high: [
      'write code',
      'write a function',
      'implement',
      'debug',
      'fix this bug',
      'refactor',
      'unit test',
      'code review',
      'typescript',
      'javascript',
      'python',
      'rust',
      'compile error',
      'syntax error',
    ],
    medium: ['function', 'class', 'variable', 'api', 'endpoint', 'database query', 'sql'],
  },
  reasoning: {
    high: [
      'solve this problem',
      'calculate',
      'prove',
      'analyze this',
      'compare and contrast',
      'what are the pros and cons',
      'trade-offs',
      'math problem',
      'logic puzzle',
    ],
    medium: ['think through', 'reason about', 'evaluate', 'deduce', 'conclude'],
  },
  agentic: {
    high: [
      'browse to',
      'go to website',
      'open browser',
      'click on',
      'navigate to',
      'fill out form',
      'book a',
      'order',
      'automate',
      'workflow',
      'do this for me',
      'complete this task',
    ],
    medium: ['search for', 'find me', 'look up', 'get information from'],
  },
  multimodal: {
    high: [
      'look at this image',
      'analyze this picture',
      'what do you see',
      'describe this image',
      'in this screenshot',
      'the photo shows',
      'this diagram',
      'read this chart',
    ],
    medium: ['image', 'picture', 'screenshot', 'photo', 'visual'],
  },
  'image-gen': {
    high: [
      'generate an image',
      'create an image',
      'draw',
      'make a picture',
      'design an image',
      'create artwork',
      'generate art',
      'make me an image',
      'dall-e',
      'midjourney style',
      'stable diffusion',
    ],
    medium: ['visualize', 'illustration', 'graphic', 'render', 'create visual'],
  },
  'video-gen': {
    high: [
      'generate a video',
      'create a video',
      'make a video',
      'video of',
      'animate',
      'create animation',
      'sora',
      'veo',
      'runway',
    ],
    medium: ['motion', 'clip', 'footage', 'video content'],
  },
  search: {
    high: [
      'search the web',
      'find online',
      'look up on internet',
      'google',
      'what is the latest',
      'current news about',
      'recent developments',
    ],
    medium: ['search for', 'find information', 'look up'],
  },
  'deep-research': {
    high: [
      'research thoroughly',
      'deep dive',
      'comprehensive research',
      'detailed analysis',
      'investigate',
      'research paper on',
      'in-depth research',
      'academic research',
    ],
    medium: ['research', 'study', 'explore in detail', 'learn everything about'],
  },
  tts: {
    high: [
      'read this aloud',
      'convert to speech',
      'text to speech',
      'say this',
      'speak this',
      'generate audio',
      'create voiceover',
      'narrate',
    ],
    medium: ['voice', 'audio version', 'spoken'],
  },
  stt: {
    high: [
      'transcribe this audio',
      'convert speech to text',
      'transcription',
      'what does this audio say',
      'transcribe the recording',
    ],
    medium: ['transcript', 'dictation', 'speech recognition'],
  },
  music: {
    high: [
      'generate music',
      'create a song',
      'compose music',
      'make a beat',
      'create soundtrack',
      'suno',
      'udio',
      'generate melody',
    ],
    medium: ['music', 'song', 'melody', 'instrumental', 'audio track'],
  },
};

// ============================================
// CAPABILITY MAPPING
// ============================================

/**
 * Maps intent types to required model capabilities
 */
const INTENT_CAPABILITIES: Record<IntentType, Array<keyof ModelMetadata['capabilities']>> = {
  chat: [],
  coding: ['tools'],
  reasoning: ['thinking'],
  agentic: ['tools', 'agentic'],
  multimodal: ['vision'],
  'image-gen': [], // Handled by image models
  'video-gen': [], // Handled by video models
  search: [], // Handled by search models
  'deep-research': [], // Handled by research models
  tts: [], // Handled by TTS models
  stt: [], // Handled by STT models
  music: [], // Handled by music models
};

/**
 * Maps intent types to suggested tool categories
 */
const INTENT_TOOLS: Record<IntentType, ToolCategory[]> = {
  chat: [],
  coding: ['code-execution', 'file-system'],
  reasoning: [],
  agentic: ['browser', 'file-system', 'api', 'code-execution'],
  multimodal: ['image'],
  'image-gen': ['image'],
  'video-gen': ['video'],
  search: ['search', 'browser'],
  'deep-research': ['search', 'browser', 'file-system'],
  tts: ['audio'],
  stt: ['audio'],
  music: ['audio'],
};

// ============================================
// CLASSIFICATION FUNCTIONS
// ============================================

/**
 * Fast keyword-based classification (used for Hobby tier or as first pass)
 * Returns null if confidence is too low
 */
export function classifyIntentLocally(
  message: string,
  options: ClassificationOptions,
): ClassifiedIntent | null {
  const lowerMessage = message.toLowerCase();

  // Check for attachments first - they strongly indicate intent
  if (options.hasAttachments) {
    if (options.attachmentTypes.includes('image')) {
      return {
        primary: 'multimodal',
        confidence: 0.95,
        keywords: ['image attachment'],
        requiredCapabilities: ['vision'],
        suggestedTools: ['image'],
      };
    }
    if (options.attachmentTypes.includes('audio')) {
      return {
        primary: 'stt',
        confidence: 0.9,
        keywords: ['audio attachment'],
        requiredCapabilities: [],
        suggestedTools: ['audio'],
      };
    }
    if (options.attachmentTypes.includes('video')) {
      return {
        primary: 'multimodal',
        confidence: 0.9,
        keywords: ['video attachment'],
        requiredCapabilities: ['vision'],
        suggestedTools: ['video'],
      };
    }
  }

  // Score each intent type
  const scores: Array<{ type: IntentType; score: number; keywords: string[] }> = [];

  for (const [intentType, keywords] of Object.entries(INTENT_KEYWORDS)) {
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
      scores.push({ type: intentType as IntentType, score, keywords: matchedKeywords });
    }
  }

  // Sort by score
  scores.sort((a, b) => b.score - a.score);

  // If no matches, default to chat
  if (scores.length === 0) {
    return {
      primary: 'chat',
      confidence: 0.5,
      keywords: [],
      requiredCapabilities: [],
      suggestedTools: [],
    };
  }

  const topResult = scores[0]!;
  const secondResult = scores[1];

  // Calculate confidence based on score and gap to second result
  let confidence = Math.min(0.95, 0.4 + topResult.score * 0.1);
  if (secondResult && topResult.score - secondResult.score <= 1) {
    confidence *= 0.8; // Reduce confidence if close competition
  }

  // Return null if confidence is too low for keyword-based (need LLM)
  if (confidence < 0.6 && options.tier !== 'hobby') {
    return null;
  }

  return {
    primary: topResult.type,
    secondary: secondResult && secondResult.score >= 2 ? secondResult.type : undefined,
    confidence,
    keywords: topResult.keywords,
    requiredCapabilities: INTENT_CAPABILITIES[topResult.type],
    suggestedTools: INTENT_TOOLS[topResult.type],
  };
}

/**
 * Generate LLM prompt for intent classification (Pro+ tiers)
 */
export function getIntentClassificationPrompt(
  message: string,
  options: ClassificationOptions,
): string {
  const contextInfo = options.conversationContext
    ? `\nConversation Context (recent messages):\n${options.conversationContext}\n`
    : '';

  const attachmentInfo = options.hasAttachments
    ? `\nUser has attached: ${options.attachmentTypes.join(', ')}\n`
    : '';

  return `You are AGI Workforce's intent classifier. Analyze the user's message and classify their intent.

${contextInfo}${attachmentInfo}
User Message: "${message.slice(0, 1000)}"

Classify into ONE primary intent (and optionally a secondary intent):

Intent Types:
- chat: General conversation, Q&A, explanations, summaries
- coding: Code generation, debugging, code review, implementation
- reasoning: Complex analysis, math problems, logic, trade-off analysis
- agentic: Browser automation, workflows, multi-step tasks requiring tools
- multimodal: Tasks analyzing images, screenshots, videos (INPUT analysis)
- image-gen: Create/generate images from descriptions (OUTPUT generation)
- video-gen: Create/generate videos from descriptions (OUTPUT generation)
- search: Quick web search, current events, recent information
- deep-research: Thorough research, academic-style investigation
- tts: Convert text to speech/audio
- stt: Transcribe audio to text
- music: Generate music or songs

Respond in JSON format:
{
  "primary": "<intent_type>",
  "secondary": "<intent_type_or_null>",
  "confidence": <0.0-1.0>,
  "reasoning": "<brief explanation>"
}`;
}

/**
 * Parse LLM response for intent classification
 */
export function parseIntentResponse(response: string, fallbackMessage: string): ClassifiedIntent {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const primary = validateIntentType(parsed.primary);
      const secondary = parsed.secondary ? validateIntentType(parsed.secondary) : undefined;

      return {
        primary,
        secondary,
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.8)),
        keywords: [],
        requiredCapabilities: INTENT_CAPABILITIES[primary],
        suggestedTools: INTENT_TOOLS[primary],
        reasoning: parsed.reasoning,
      };
    }
  } catch {
    // JSON parsing failed, try text parsing
  }

  // Text-based fallback parsing
  const normalized = response.toLowerCase();
  let primary: IntentType = 'chat';

  if (normalized.includes('image-gen') || normalized.includes('generate image')) {
    primary = 'image-gen';
  } else if (normalized.includes('video-gen') || normalized.includes('generate video')) {
    primary = 'video-gen';
  } else if (normalized.includes('deep-research') || normalized.includes('thorough research')) {
    primary = 'deep-research';
  } else if (normalized.includes('search') || normalized.includes('web search')) {
    primary = 'search';
  } else if (normalized.includes('coding') || normalized.includes('code')) {
    primary = 'coding';
  } else if (normalized.includes('reasoning') || normalized.includes('analysis')) {
    primary = 'reasoning';
  } else if (normalized.includes('agentic') || normalized.includes('automation')) {
    primary = 'agentic';
  } else if (normalized.includes('multimodal') || normalized.includes('image analysis')) {
    primary = 'multimodal';
  } else if (normalized.includes('tts') || normalized.includes('text to speech')) {
    primary = 'tts';
  } else if (normalized.includes('stt') || normalized.includes('transcribe')) {
    primary = 'stt';
  } else if (normalized.includes('music') || normalized.includes('song')) {
    primary = 'music';
  }

  // Fallback to local classification
  const localResult = classifyIntentLocally(fallbackMessage, {
    tier: 'hobby',
    hasAttachments: false,
    attachmentTypes: [],
  });

  return (
    localResult || {
      primary,
      confidence: 0.6,
      keywords: [],
      requiredCapabilities: INTENT_CAPABILITIES[primary],
      suggestedTools: INTENT_TOOLS[primary],
    }
  );
}

/**
 * Validate and normalize intent type
 */
function validateIntentType(type: string): IntentType {
  const normalized = type.toLowerCase().trim();
  const validTypes: IntentType[] = [
    'chat',
    'coding',
    'reasoning',
    'agentic',
    'multimodal',
    'image-gen',
    'video-gen',
    'search',
    'deep-research',
    'tts',
    'stt',
    'music',
  ];

  if (validTypes.includes(normalized as IntentType)) {
    return normalized as IntentType;
  }

  // Fuzzy matching
  if (normalized.includes('image') && normalized.includes('gen')) return 'image-gen';
  if (normalized.includes('video') && normalized.includes('gen')) return 'video-gen';
  if (normalized.includes('research')) return 'deep-research';
  if (normalized.includes('search')) return 'search';
  if (normalized.includes('code')) return 'coding';
  if (normalized.includes('reason')) return 'reasoning';
  if (normalized.includes('agent')) return 'agentic';
  if (normalized.includes('vision') || normalized.includes('image')) return 'multimodal';
  if (normalized.includes('speech') && normalized.includes('text')) return 'tts';
  if (normalized.includes('transcri')) return 'stt';
  if (normalized.includes('music') || normalized.includes('song')) return 'music';

  return 'chat';
}

// ============================================
// MAIN CLASSIFICATION FUNCTION
// ============================================

/**
 * Classify user intent
 *
 * For Hobby tier: Uses fast keyword-based classification
 * For Pro+ tiers: Uses GPT-5 Nano for intelligent classification
 *
 * @param message - User's message
 * @param options - Classification options
 * @param llmClassify - Optional async function to call LLM for classification
 * @returns Classified intent
 */
export async function classifyIntent(
  message: string,
  options: ClassificationOptions,
  llmClassify?: (prompt: string) => Promise<string>,
): Promise<ClassifiedIntent> {
  // First, try local classification
  const localResult = classifyIntentLocally(message, options);

  // For Hobby tier, always use local classification
  if (options.tier === 'hobby') {
    return (
      localResult || {
        primary: 'chat',
        confidence: 0.5,
        keywords: [],
        requiredCapabilities: [],
        suggestedTools: [],
      }
    );
  }

  // For Pro+ tiers, use LLM if local confidence is low or LLM is available
  if (localResult && localResult.confidence >= 0.8) {
    return localResult;
  }

  // Use LLM classification if available
  if (llmClassify) {
    try {
      const prompt = getIntentClassificationPrompt(message, options);
      const response = await llmClassify(prompt);
      return parseIntentResponse(response, message);
    } catch {
      // LLM failed, fall back to local result
    }
  }

  // Return local result or default
  return (
    localResult || {
      primary: 'chat',
      confidence: 0.5,
      keywords: [],
      requiredCapabilities: [],
      suggestedTools: [],
    }
  );
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Check if an intent requires a specific model type (not chat)
 */
export function requiresSpecializedModel(intent: IntentType): boolean {
  return ['image-gen', 'video-gen', 'search', 'deep-research', 'tts', 'stt', 'music'].includes(
    intent,
  );
}

/**
 * Get the model category for an intent
 */
export function getModelCategory(
  intent: IntentType,
): 'chat' | 'image' | 'video' | 'search' | 'tts' | 'stt' | 'music' {
  switch (intent) {
    case 'image-gen':
      return 'image';
    case 'video-gen':
      return 'video';
    case 'search':
    case 'deep-research':
      return 'search';
    case 'tts':
      return 'tts';
    case 'stt':
      return 'stt';
    case 'music':
      return 'music';
    default:
      return 'chat';
  }
}

/**
 * Convert legacy TaskType to IntentType
 */
export function taskTypeToIntent(
  taskType: 'coding' | 'reasoning' | 'general' | 'agentic' | 'multimodal',
): IntentType {
  if (taskType === 'general') return 'chat';
  return taskType;
}

/**
 * Convert IntentType to legacy TaskType for backward compatibility
 */
export function intentToTaskType(
  intent: IntentType,
): 'coding' | 'reasoning' | 'general' | 'agentic' | 'multimodal' {
  switch (intent) {
    case 'coding':
      return 'coding';
    case 'reasoning':
      return 'reasoning';
    case 'agentic':
      return 'agentic';
    case 'multimodal':
      return 'multimodal';
    default:
      return 'general';
  }
}

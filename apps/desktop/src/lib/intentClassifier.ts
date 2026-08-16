
import type { ModelMetadata } from '../constants/llm';

export interface ClassifierModelSpec {
  requirements: {
    maxLatencyMs: number;
    maxInputCostPer1M: number;
    maxKnowledgeAgeMonths: number;
    requiresStructuredOutput: boolean;
  };
  preferences: {
    supportsJsonMode: boolean;
    supportsFunctionCalling: boolean;
    hasReasoningCapability: boolean;
  };
}

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

export type ClassifierCategory = 'flash' | 'mini' | 'reasoning';

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
    case 'reasoning':
      return {
        description: 'Model with reasoning capability for complex classification',
        targetLatencyMs: 400,
        targetCostPer1M: 0.5,
        useCase: 'Ambiguous intents requiring deeper analysis',
      };
  }
}

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
    return 'mini';
  }
  return 'mini';
}

export type UserRoutingMode = 'auto' | 'fast' | 'thinking' | 'creative';

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

export type IntentType =
  | 'chat'
  | 'coding'
  | 'reasoning'
  | 'agentic'
  | 'multimodal'
  | 'image-gen'
  | 'video-gen'
  | 'search'
  | 'deep-research'
  | 'tts'
  | 'stt'
  | 'music';

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

export interface ClassifiedIntent {
  primary: IntentType;
  secondary?: IntentType;
  confidence: number;
  keywords: string[];
  requiredCapabilities: Array<keyof ModelMetadata['capabilities']>;
  suggestedTools: ToolCategory[];
  reasoning?: string;
}

export interface ClassificationOptions {
  tier: 'basic' | 'pro' | 'max' | 'enterprise';
  hasAttachments: boolean;
  attachmentTypes: Array<'image' | 'audio' | 'video' | 'document'>;
  conversationContext?: string;
  userPreferences?: {
    preferredImageModel?: string;
    preferredVideoModel?: string;
    preferredSearchDepth?: 'quick' | 'thorough' | 'deep';
  };
}

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
      'ai image',
      'generative image',
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
      'video generation',
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
      'generate melody',
    ],
    medium: ['music', 'song', 'melody', 'instrumental', 'audio track'],
  },
};

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

export function classifyIntentLocally(
  message: string,
  options: ClassificationOptions,
): ClassifiedIntent | null {
  const lowerMessage = message.toLowerCase();

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

  const KEYWORD_SCORE_HIGH = 3;
  const KEYWORD_SCORE_MEDIUM = 1;

  const scores: Array<{ type: IntentType; score: number; keywords: string[] }> = [];

  for (const [intentType, keywords] of Object.entries(INTENT_KEYWORDS)) {
    let score = 0;
    const matchedKeywords: string[] = [];

    for (const keyword of keywords.high) {
      if (lowerMessage.includes(keyword)) {
        score += KEYWORD_SCORE_HIGH;
        matchedKeywords.push(keyword);
      }
    }

    for (const keyword of keywords.medium) {
      if (lowerMessage.includes(keyword)) {
        score += KEYWORD_SCORE_MEDIUM;
        matchedKeywords.push(keyword);
      }
    }

    if (score > 0) {
      scores.push({ type: intentType as IntentType, score, keywords: matchedKeywords });
    }
  }

  scores.sort((a, b) => b.score - a.score);

  if (scores.length === 0) {
    return DEFAULT_CHAT_INTENT;
  }

  const topResult = scores[0]!;
  const secondResult = scores[1];

  let confidence = Math.min(0.95, 0.4 + topResult.score * 0.1);
  if (secondResult && topResult.score - secondResult.score <= 1) {
    confidence *= 0.8;
  }

  if (confidence < 0.6 && options.tier !== 'basic') {
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

export function parseIntentResponse(response: string, fallbackMessage: string): ClassifiedIntent {
  try {
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

  if (primary !== 'chat') {
    return {
      primary,
      confidence: 0.6,
      keywords: [],
      requiredCapabilities: INTENT_CAPABILITIES[primary],
      suggestedTools: INTENT_TOOLS[primary],
    };
  }

  const localResult = classifyIntentLocally(fallbackMessage, {
    tier: 'basic',
    hasAttachments: false,
    attachmentTypes: [],
  });

  return localResult || DEFAULT_CHAT_INTENT;
}

const VALID_INTENT_TYPES = new Set<IntentType>([
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
]);

const DEFAULT_CHAT_INTENT: ClassifiedIntent = {
  primary: 'chat',
  confidence: 0.5,
  keywords: [],
  requiredCapabilities: [],
  suggestedTools: [],
};

function validateIntentType(type: string): IntentType {
  const normalized = type.toLowerCase().trim();

  if (VALID_INTENT_TYPES.has(normalized as IntentType)) {
    return normalized as IntentType;
  }

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

/**
 * Classify user intent
 *
 * For Basic tier: Uses fast keyword-based classification
 * For Pro and above: Uses a fast current model for intelligent classification
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
  const localResult = classifyIntentLocally(message, options);

  if (options.tier === 'basic') {
    return localResult || DEFAULT_CHAT_INTENT;
  }

  if (localResult && localResult.confidence >= 0.8) {
    return localResult;
  }

  if (llmClassify) {
    try {
      const prompt = getIntentClassificationPrompt(message, options);
      const response = await llmClassify(prompt);
      return parseIntentResponse(response, message);
    } catch {
      // LLM failed, fall back to local result
    }
  }

  return localResult || DEFAULT_CHAT_INTENT;
}

export function requiresSpecializedModel(intent: IntentType): boolean {
  return ['image-gen', 'video-gen', 'search', 'deep-research', 'tts', 'stt', 'music'].includes(
    intent,
  );
}

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

export function taskTypeToIntent(
  taskType: 'coding' | 'reasoning' | 'general' | 'agentic' | 'multimodal',
): IntentType {
  if (taskType === 'general') return 'chat';
  return taskType;
}

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

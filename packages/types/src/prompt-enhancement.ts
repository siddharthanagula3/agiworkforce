// Prompt Enhancement and API Routing Types

/**
 * Use case categories for intelligent API routing
 */
export enum UseCase {
  Automation = 'Automation',
  Coding = 'Coding',
  DocumentCreation = 'DocumentCreation',
  Search = 'Search',
  ImageGen = 'ImageGen',
  VideoGen = 'VideoGen',
  GeneralQA = 'GeneralQA',
}

/**
 * Supported API providers for routing
 */
export enum APIProvider {
  Claude = 'Claude',
  GPT = 'GPT',
  Gemini = 'Gemini',
  Perplexity = 'Perplexity',
  Ollama = 'Ollama',
  Veo3 = 'Veo3',
  DALLE = 'DALLE',
  StableDiffusion = 'StableDiffusion',
  Midjourney = 'Midjourney',
}

/**
 * Enhanced prompt with metadata and routing info
 */
export interface EnhancedPrompt {
  /** Original user prompt */
  original: string;
  /** Enhanced/optimized prompt */
  enhanced: string;
  /** Detected use case */
  useCase: UseCase;
  /** Confidence score for use case detection (0-1) */
  confidence: number;
  /** Suggested API provider */
  suggestedProvider: APIProvider;
  /** Additional context extracted from prompt */
  context?: {
    language?: string;
    framework?: string;
    domain?: string;
    complexity?: 'simple' | 'moderate' | 'complex';
  };
  /** Enhancement metadata */
  metadata?: {
    tokensAdded?: number;
    enhancementReason?: string;
    alternativeProviders?: APIProvider[];
  };
}

/**
 * API routing decision with rationale
 */
export interface APIRoute {
  /** Selected API provider */
  provider: APIProvider;
  /** Reasoning for selection */
  rationale: string;
  /** Estimated cost in USD */
  estimatedCost?: number;
  /** Estimated latency in ms */
  estimatedLatency?: number;
  /** Fallback providers in order of preference */
  fallbacks: APIProvider[];
  /** Specific model to use (e.g., "gpt-4", "claude-sonnet-3.5") */
  model?: string;
  /** Provider-specific configuration */
  config?: Record<string, unknown>;
}

/**
 * Complete result of prompt enhancement and routing
 */
export interface PromptEnhancementResult {
  /** Enhanced prompt data */
  prompt: EnhancedPrompt;
  /** Routing decision */
  route: APIRoute;
  /** Timestamp of enhancement */
  timestamp: string;
  /** Processing time in ms */
  processingTime: number;
}

/**
 * Use case detection result
 */
export interface UseCaseDetection {
  /** Detected use case */
  useCase: UseCase;
  /** Confidence score (0-1) */
  confidence: number;
  /** Keywords that influenced detection */
  keywords: string[];
  /** Whether multiple use cases were detected */
  ambiguous: boolean;
  /** Alternative use cases if ambiguous */
  alternatives?: Array<{
    useCase: UseCase;
    confidence: number;
  }>;
}

/**
 * API provider capabilities
 */
export interface ProviderCapabilities {
  /** Provider name */
  provider: APIProvider;
  /** Supported use cases */
  supportedUseCases: UseCase[];
  /** Maximum tokens supported */
  maxTokens: number;
  /** Supports streaming */
  supportsStreaming: boolean;
  /** Supports function calling */
  supportsFunctionCalling: boolean;
  /** Supports vision/image input */
  supportsVision: boolean;
  /** Cost per 1K tokens (input) */
  costPerKInput: number;
  /** Cost per 1K tokens (output) */
  costPerKOutput: number;
  /** Average latency in ms */
  avgLatency: number;
  /** Quality score (0-1) */
  qualityScore: number;
}

/**
 * Prompt enhancement configuration
 */
export interface PromptEnhancementConfig {
  /** Enable automatic prompt enhancement */
  enabled: boolean;
  /** Minimum confidence threshold for use case detection */
  confidenceThreshold: number;
  /** Prefer local models (Ollama) when possible */
  preferLocal: boolean;
  /** Maximum cost per request in USD */
  maxCostPerRequest?: number;
  /** Maximum latency in ms */
  maxLatency?: number;
  /** Custom provider preferences */
  providerPreferences?: Record<UseCase, APIProvider[]>;
}

/**
 * Prompt Enhancement Types
 *
 * Types for AI-powered prompt optimization and intelligent API routing.
 * These types document the data structures used by the Rust backend.
 *
 * **NOTE**: These TypeScript types are for REFERENCE AND DOCUMENTATION ONLY.
 * The actual prompt enhancement implementation lives in the Rust backend
 * (apps/desktop/src-tauri/src/). These types are not currently used in the
 * TypeScript/JavaScript codebase.
 *
 * @module prompt-enhancement
 * @packageDocumentation
 *
 * @remarks
 * If you need to modify these types, ensure the corresponding Rust structs
 * are also updated to maintain consistency.
 *
 * @example Using prompt enhancement (conceptual):
 * ```typescript
 * const result: PromptEnhancementResult = await enhance({
 *   prompt: 'create a button',
 *   userContext: { language: 'typescript', framework: 'react' }
 * });
 *
 * console.log('Enhanced:', result.prompt.enhanced);
 * console.log('Suggested provider:', result.route.provider);
 * ```
 */

/**
 * Complexity level of a prompt or task.
 *
 * Used to estimate required model capabilities and routing decisions.
 *
 * - `Simple`: Basic queries, simple code generation
 * - `Moderate`: Multi-step tasks, medium complexity code
 * - `Complex`: Advanced reasoning, large-scale generation
 */
export type Complexity = 'Simple' | 'Moderate' | 'Complex';

/**
 * Use case categories for intelligent routing and prompt enhancement.
 *
 * Each use case may benefit from different LLM providers or models.
 *
 * @example
 * ```typescript
 * const useCase = UseCase.Coding;
 * // System might route to specialized coding models
 * ```
 */
export enum UseCase {
  /** Workflow automation and scripting tasks */
  Automation = 'Automation',
  /** Code generation, debugging, and refactoring */
  Coding = 'Coding',
  /** Document creation and editing (Word, Excel, PDF) */
  DocumentCreation = 'DocumentCreation',
  /** Web search and information retrieval */
  Search = 'Search',
  /** Image generation (DALL-E, Stable Diffusion, etc.) */
  ImageGen = 'ImageGen',
  /** Video generation (Veo3, etc.) */
  VideoGen = 'VideoGen',
  /** General question answering and chat */
  GeneralQA = 'GeneralQA',
}

/**
 * Supported API providers for LLM operations.
 *
 * The system can intelligently route requests to the most appropriate
 * provider based on the use case, cost, and performance requirements.
 *
 * @example
 * ```typescript
 * const provider = APIProvider.Claude;
 * // Might be preferred for coding tasks
 * ```
 */
export enum APIProvider {
  /** Anthropic Claude models */
  Claude = 'Claude',
  /** OpenAI GPT models */
  GPT = 'GPT',
  /** Google Gemini models */
  Gemini = 'Gemini',
  /** Perplexity for search-augmented tasks */
  Perplexity = 'Perplexity',
  /** Local Ollama models */
  Ollama = 'Ollama',
  /** Google Veo for video generation */
  Veo3 = 'Veo3',
  /** OpenAI DALL-E for image generation */
  DALLE = 'DALLE',
  /** Stable Diffusion for image generation */
  StableDiffusion = 'StableDiffusion',
  /** Midjourney for high-quality image generation */
  Midjourney = 'Midjourney',
}

/**
 * Result of prompt enhancement with contextual information.
 *
 * The enhancement process transforms user prompts into more effective
 * instructions for LLMs while detecting the use case and suggesting
 * appropriate routing.
 *
 * @example
 * ```typescript
 * const enhanced: EnhancedPrompt = {
 *   original: 'make a button',
 *   enhanced: 'Create a reusable React button component in TypeScript with...',
 *   useCase: UseCase.Coding,
 *   confidence: 0.95,
 *   suggestedProvider: APIProvider.Claude,
 *   context: {
 *     language: 'typescript',
 *     framework: 'react',
 *     complexity: 'Moderate'
 *   },
 *   metadata: {
 *     tokensAdded: 45,
 *     enhancementReason: 'Added technical context and best practices'
 *   }
 * };
 * ```
 */
export interface EnhancedPrompt {
  /** The original user prompt */
  original: string;

  /** Enhanced version with additional context and clarity */
  enhanced: string;

  /** Detected use case category */
  useCase: UseCase;

  /** Confidence score (0-1) for the use case detection */
  confidence: number;

  /** Recommended API provider for this prompt */
  suggestedProvider: APIProvider;

  /** Optional contextual information extracted or inferred */
  context?: {
    /** Programming language if coding task */
    language?: string;
    /** Framework or library if applicable */
    framework?: string;
    /** Domain or subject area */
    domain?: string;
    /** Estimated complexity level */
    complexity?: Complexity;
  };

  /** Additional metadata about the enhancement */
  metadata?: {
    /** Number of tokens added during enhancement */
    tokensAdded?: number;
    /** Explanation of why the prompt was enhanced this way */
    enhancementReason?: string;
    /** Alternative providers that could also work */
    alternativeProviders?: APIProvider[];
  };
}

/**
 * Routing decision with provider selection and configuration.
 *
 * Describes how a request should be routed to an API provider,
 * including fallback options and cost estimates.
 *
 * @example
 * ```typescript
 * const route: APIRoute = {
 *   provider: APIProvider.Claude,
 *   rationale: 'Claude excels at code generation tasks',
 *   estimatedCost: 0.015,
 *   estimatedLatency: 2500,
 *   fallbacks: [APIProvider.GPT, APIProvider.Gemini],
 *   model: 'claude-sonnet-4-5',
 *   config: {
 *     temperature: 0.7,
 *     maxTokens: 4096
 *   }
 * };
 * ```
 */
export interface APIRoute {
  /** Selected API provider */
  provider: APIProvider;

  /** Explanation for why this provider was chosen */
  rationale: string;

  /** Estimated cost in USD for the request */
  estimatedCost?: number;

  /** Estimated latency in milliseconds */
  estimatedLatency?: number;

  /** Fallback providers if the primary fails */
  fallbacks: APIProvider[];

  /** Specific model to use (if provider supports multiple models) */
  model?: string;

  /** Provider-specific configuration */
  config?: Record<string, unknown>;
}

/**
 * Complete result of prompt enhancement and routing.
 *
 * Combines the enhanced prompt, routing decision, and performance metadata.
 *
 * @example
 * ```typescript
 * const result: PromptEnhancementResult = {
 *   prompt: enhancedPrompt,
 *   route: selectedRoute,
 *   timestamp: '2026-01-15T12:00:00Z',
 *   processingTime: 125
 * };
 * ```
 */
export interface PromptEnhancementResult {
  /** The enhanced prompt with context */
  prompt: EnhancedPrompt;

  /** Recommended API routing */
  route: APIRoute;

  /** ISO 8601 timestamp of when enhancement was performed */
  timestamp: string;

  /** Time taken for enhancement in milliseconds */
  processingTime: number;
}

/**
 * Result of use case detection analysis.
 *
 * Provides detailed information about the detected use case,
 * including confidence, keywords, and alternatives.
 *
 * @example
 * ```typescript
 * const detection: UseCaseDetection = {
 *   useCase: UseCase.Coding,
 *   confidence: 0.92,
 *   keywords: ['function', 'typescript', 'component'],
 *   ambiguous: false,
 *   alternatives: [
 *     { useCase: UseCase.GeneralQA, confidence: 0.08 }
 *   ]
 * };
 * ```
 */
export interface UseCaseDetection {
  /** Primary detected use case */
  useCase: UseCase;

  /** Confidence score (0-1) for the primary use case */
  confidence: number;

  /** Keywords that influenced the detection */
  keywords: string[];

  /** Whether the prompt is ambiguous (multiple possible use cases) */
  ambiguous: boolean;

  /** Alternative use cases with their confidence scores */
  alternatives?: Array<{
    /** Alternative use case */
    useCase: UseCase;
    /** Confidence score for this alternative */
    confidence: number;
  }>;
}

/**
 * Provider capabilities and performance characteristics.
 *
 * Describes what a provider can do and its performance/cost profile.
 *
 * @example
 * ```typescript
 * const capabilities: ProviderCapabilities = {
 *   provider: APIProvider.Claude,
 *   supportedUseCases: [UseCase.Coding, UseCase.GeneralQA, UseCase.DocumentCreation],
 *   maxTokens: 200000,
 *   supportsStreaming: true,
 *   supportsFunctionCalling: true,
 *   supportsVision: true,
 *   costPerKInput: 0.003,
 *   costPerKOutput: 0.015,
 *   avgLatency: 2000,
 *   qualityScore: 0.95
 * };
 * ```
 */
export interface ProviderCapabilities {
  /** The API provider */
  provider: APIProvider;

  /** Use cases this provider is good at */
  supportedUseCases: UseCase[];

  /** Maximum context window size in tokens */
  maxTokens: number;

  /** Whether the provider supports streaming responses */
  supportsStreaming: boolean;

  /** Whether the provider supports function/tool calling */
  supportsFunctionCalling: boolean;

  /** Whether the provider supports image inputs */
  supportsVision: boolean;

  /** Cost per 1000 input tokens in USD */
  costPerKInput: number;

  /** Cost per 1000 output tokens in USD */
  costPerKOutput: number;

  /** Average latency in milliseconds */
  avgLatency: number;

  /** Quality score (0-1) based on benchmarks */
  qualityScore: number;
}

/**
 * Configuration for prompt enhancement behavior.
 *
 * Controls how the enhancement system operates, including
 * when to enhance, cost limits, and provider preferences.
 *
 * @example
 * ```typescript
 * const config: PromptEnhancementConfig = {
 *   enabled: true,
 *   confidenceThreshold: 0.8,
 *   preferLocal: false,
 *   maxCostPerRequest: 0.50,
 *   maxLatency: 5000,
 *   providerPreferences: {
 *     [UseCase.Coding]: [APIProvider.Claude, APIProvider.GPT],
 *     [UseCase.ImageGen]: [APIProvider.DALLE, APIProvider.StableDiffusion]
 *   }
 * };
 * ```
 */
export interface PromptEnhancementConfig {
  /** Whether prompt enhancement is enabled globally */
  enabled: boolean;

  /** Minimum confidence score (0-1) to apply enhancement */
  confidenceThreshold: number;

  /** Prefer local/Ollama models over cloud providers when possible */
  preferLocal: boolean;

  /** Maximum cost per request in USD (requests exceeding this are rejected) */
  maxCostPerRequest?: number;

  /** Maximum acceptable latency in milliseconds */
  maxLatency?: number;

  /**
   * Provider preferences by use case.
   * Providers are tried in the order specified.
   *
   * @example
   * ```typescript
   * providerPreferences: {
   *   [UseCase.Coding]: [APIProvider.Claude, APIProvider.GPT],
   *   [UseCase.Search]: [APIProvider.Perplexity, APIProvider.Gemini]
   * }
   * ```
   */
  providerPreferences?: Record<UseCase, APIProvider[]>;
}

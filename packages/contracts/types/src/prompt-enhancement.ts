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
  Automation = 'Automation',
  Coding = 'Coding',
  DocumentCreation = 'DocumentCreation',
  Search = 'Search',
  ImageGen = 'ImageGen',
  VideoGen = 'VideoGen',
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
  Claude = 'Claude',
  GPT = 'GPT',
  Gemini = 'Gemini',
  Perplexity = 'Perplexity',
  Ollama = 'Ollama',
  Veo3 = 'Veo3',
  GPTImage = 'GPTImage',
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
  original: string;

  enhanced: string;

  useCase: UseCase;

  confidence: number;

  suggestedProvider: APIProvider;

  context?: {
    language?: string;
    framework?: string;
    domain?: string;
    complexity?: Complexity;
  };

  metadata?: {
    tokensAdded?: number;
    enhancementReason?: string;
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
 *   model: selectedModel.id,
 *   config: {
 *     temperature: 0.7,
 *     maxTokens: 4096
 *   }
 * };
 * ```
 */
export interface APIRoute {
  provider: APIProvider;

  rationale: string;

  estimatedCost?: number;

  estimatedLatency?: number;

  fallbacks: APIProvider[];

  model?: string;

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
  prompt: EnhancedPrompt;

  route: APIRoute;

  timestamp: string;

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
  useCase: UseCase;

  confidence: number;

  keywords: string[];

  ambiguous: boolean;

  alternatives?: Array<{
    useCase: UseCase;
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
  provider: APIProvider;

  supportedUseCases: UseCase[];

  maxTokens: number;

  supportsStreaming: boolean;

  supportsFunctionCalling: boolean;

  supportsVision: boolean;

  costPerKInput: number;

  costPerKOutput: number;

  avgLatency: number;

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
 *     [UseCase.ImageGen]: [APIProvider.GPTImage]
 *   }
 * };
 * ```
 */
export interface PromptEnhancementConfig {
  enabled: boolean;

  confidenceThreshold: number;

  preferLocal: boolean;

  maxCostPerRequest?: number;

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

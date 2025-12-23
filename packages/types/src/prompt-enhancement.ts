export enum UseCase {
  Automation = 'Automation',
  Coding = 'Coding',
  DocumentCreation = 'DocumentCreation',
  Search = 'Search',
  ImageGen = 'ImageGen',
  VideoGen = 'VideoGen',
  GeneralQA = 'GeneralQA',
}

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
    complexity?: 'simple' | 'moderate' | 'complex';
  };

  metadata?: {
    tokensAdded?: number;
    enhancementReason?: string;
    alternativeProviders?: APIProvider[];
  };
}

export interface APIRoute {
  provider: APIProvider;

  rationale: string;

  estimatedCost?: number;

  estimatedLatency?: number;

  fallbacks: APIProvider[];

  model?: string;

  config?: Record<string, unknown>;
}

export interface PromptEnhancementResult {
  prompt: EnhancedPrompt;

  route: APIRoute;

  timestamp: string;

  processingTime: number;
}

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

export interface PromptEnhancementConfig {
  enabled: boolean;

  confidenceThreshold: number;

  preferLocal: boolean;

  maxCostPerRequest?: number;

  maxLatency?: number;

  providerPreferences?: Record<UseCase, APIProvider[]>;
}

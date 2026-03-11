/**
 * Multi-Modal Model Router (January 2026)
 *
 * This module handles routing for non-chat models:
 * - Image generation models (DALL-E 3, GPT Image, Imagen 4, Flux, Ideogram)
 * - Video generation models (Sora 2, Veo 3)
 * - Text-to-speech models (TTS-1, TTS-1-HD)
 * - Speech-to-text models (Whisper-1)
 * - Music generation models (Suno, Udio)
 * - Search models (Sonar, Sonar Pro, Deep Research)
 *
 * Architecture:
 * 1. Each modality has its own model pool organized by tier
 * 2. Router selects the best model based on user's subscription tier
 * 3. Integrates with IntentClassifier for automatic routing
 */

import type { IntentType } from './intentClassifier';

// ============================================
// TYPES
// ============================================

export type ModalityType = 'image' | 'video' | 'tts' | 'stt' | 'music' | 'search';

export type SubscriptionTier = 'hobby' | 'pro' | 'max' | 'enterprise';

export interface ModalityModel {
  id: string;
  name: string;
  provider: string;
  tier: SubscriptionTier; // Minimum tier required
  costPerUnit: number; // Cost per generation (image, minute of video, etc.)
  quality: 'standard' | 'hd' | 'ultra';
  speed: 'fast' | 'normal' | 'slow';
  capabilities: {
    maxResolution?: string; // For image/video
    maxDuration?: number; // For video/audio (seconds)
    styles?: string[]; // Supported styles
    voices?: string[]; // For TTS
    languages?: string[]; // Supported languages
  };
}

export interface MultiModalRoutingResult {
  selectedModel: string;
  modality: ModalityType;
  reason: string;
  estimatedCost?: number;
  alternativeModels?: string[];
}

// ============================================
// MODEL DEFINITIONS BY MODALITY
// ============================================

/**
 * Image Generation Models (January 2026)
 *
 * Based on public opinion research:
 * - Midjourney v7: Best for artistic/creative (most artistic versatility)
 * - Ideogram 3: Best for text rendering (logos, typography)
 * - DALL-E 3: Good all-rounder, best OpenAI integration
 * - Imagen 4: Best for Google ecosystem users
 */
export const IMAGE_MODELS: ModalityModel[] = [
  // === BUDGET TIER (Hobby) ===
  {
    id: 'dall-e-3',
    name: 'DALL-E 3',
    provider: 'openai',
    tier: 'hobby',
    costPerUnit: 0.04, // $0.04 per image (standard)
    quality: 'standard',
    speed: 'normal',
    capabilities: {
      maxResolution: '1024x1024',
      styles: ['natural', 'vivid'],
    },
  },
  // === PRO TIER ===
  {
    id: 'ideogram-3',
    name: 'Ideogram 3',
    provider: 'ideogram',
    tier: 'pro',
    costPerUnit: 0.08,
    quality: 'hd',
    speed: 'normal',
    capabilities: {
      maxResolution: '1024x1024',
      styles: ['natural', 'typography', 'artistic', 'logo'],
    },
  },
  {
    id: 'imagen-4.0-generate-001',
    name: 'Imagen 4',
    provider: 'google',
    tier: 'pro',
    costPerUnit: 0.04,
    quality: 'hd',
    speed: 'fast',
    capabilities: {
      maxResolution: '1024x1024',
      styles: ['natural', 'artistic'],
    },
  },
  {
    id: 'gpt-image-1',
    name: 'GPT Image 1',
    provider: 'openai',
    tier: 'pro',
    costPerUnit: 0.04,
    quality: 'hd',
    speed: 'normal',
    capabilities: {
      maxResolution: '1024x1024',
      styles: ['natural', 'vivid', 'artistic'],
    },
  },
  // === MAX/ENTERPRISE TIER ===
  {
    id: 'midjourney-v7',
    name: 'Midjourney v7',
    provider: 'midjourney',
    tier: 'max',
    costPerUnit: 0.1, // Premium artistic model
    quality: 'ultra',
    speed: 'slow',
    capabilities: {
      maxResolution: '2048x2048',
      styles: ['artistic', 'cinematic', 'fantasy', 'portrait', 'concept-art'],
    },
  },
  {
    id: 'gpt-image-1.5',
    name: 'GPT Image 1.5',
    provider: 'openai',
    tier: 'max',
    costPerUnit: 0.08,
    quality: 'ultra',
    speed: 'slow',
    capabilities: {
      maxResolution: '2048x2048',
      styles: ['natural', 'vivid', 'artistic', 'photorealistic'],
    },
  },
  {
    id: 'imagen-4.0-ultra-generate-001',
    name: 'Imagen 4 Ultra',
    provider: 'google',
    tier: 'max',
    costPerUnit: 0.08,
    quality: 'ultra',
    speed: 'normal',
    capabilities: {
      maxResolution: '2048x2048',
      styles: ['natural', 'artistic', 'photorealistic'],
    },
  },
];

/**
 * Video Generation Models (January 2026)
 *
 * Based on public opinion research:
 * - Veo 3.1: Best for 4K quality (Google's flagship, highest resolution)
 * - Sora 2: Best for photorealistic human motion and faces
 * - Runway Gen-4: Best for professional workflows (editor integration)
 * - Kling 2: Best for budget video generation
 */
export const VIDEO_MODELS: ModalityModel[] = [
  // === PRO TIER ===
  {
    id: 'runway-gen-4',
    name: 'Runway Gen-4',
    provider: 'runway',
    tier: 'pro',
    costPerUnit: 0.05, // Per second of video
    quality: 'hd',
    speed: 'normal',
    capabilities: {
      maxResolution: '1920x1080',
      maxDuration: 30,
      styles: ['cinematic', 'commercial', 'artistic'],
    },
  },
  {
    id: 'kling-2',
    name: 'Kling 2',
    provider: 'kuaishou',
    tier: 'pro',
    costPerUnit: 0.03, // Budget option
    quality: 'hd',
    speed: 'fast',
    capabilities: {
      maxResolution: '1080x1920', // Portrait-first
      maxDuration: 60,
      styles: ['cinematic', 'animated', 'social'],
    },
  },
  // === MAX/ENTERPRISE TIER ===
  {
    id: 'veo-3.1-generate-preview',
    name: 'Veo 3.1',
    provider: 'google',
    tier: 'max',
    costPerUnit: 0.08, // Per second of video
    quality: 'ultra',
    speed: 'slow',
    capabilities: {
      maxResolution: '4K',
      maxDuration: 120,
      styles: ['cinematic', 'animated', 'documentary', 'photorealistic'],
    },
  },
  {
    id: 'sora-2',
    name: 'Sora 2',
    provider: 'openai',
    tier: 'max',
    costPerUnit: 0.1, // Per second of video
    quality: 'ultra',
    speed: 'slow',
    capabilities: {
      maxResolution: '1920x1080',
      maxDuration: 60,
      styles: ['cinematic', 'animated', 'realistic', 'human-motion'],
    },
  },
  {
    id: 'runway-gen-4-ultra',
    name: 'Runway Gen-4 Ultra',
    provider: 'runway',
    tier: 'max',
    costPerUnit: 0.12,
    quality: 'ultra',
    speed: 'slow',
    capabilities: {
      maxResolution: '4K',
      maxDuration: 60,
      styles: ['cinematic', 'commercial', 'artistic', 'vfx'],
    },
  },
];

/**
 * Text-to-Speech Models (January 2026)
 */
export const TTS_MODELS: ModalityModel[] = [
  {
    id: 'tts-1',
    name: 'TTS-1',
    provider: 'openai',
    tier: 'hobby',
    costPerUnit: 0.015, // Per 1K characters
    quality: 'standard',
    speed: 'fast',
    capabilities: {
      voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
      languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'pl', 'ru', 'ja', 'ko', 'zh'],
    },
  },
  {
    id: 'tts-1-hd',
    name: 'TTS-1 HD',
    provider: 'openai',
    tier: 'pro',
    costPerUnit: 0.03,
    quality: 'hd',
    speed: 'normal',
    capabilities: {
      voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
      languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'pl', 'ru', 'ja', 'ko', 'zh'],
    },
  },
];

/**
 * Speech-to-Text Models (January 2026)
 */
export const STT_MODELS: ModalityModel[] = [
  {
    id: 'whisper-1',
    name: 'Whisper-1',
    provider: 'openai',
    tier: 'hobby',
    costPerUnit: 0.006, // Per minute of audio
    quality: 'hd',
    speed: 'fast',
    capabilities: {
      languages: [
        'en',
        'es',
        'fr',
        'de',
        'it',
        'pt',
        'pl',
        'ru',
        'ja',
        'ko',
        'zh',
        'ar',
        'hi',
        'tr',
        'vi',
      ],
    },
  },
];

/**
 * Music Generation Models (January 2026)
 */
export const MUSIC_MODELS: ModalityModel[] = [];

/**
 * Search/Research Models (January 2026)
 *
 * Based on public opinion research:
 * - Perplexity: Best for citations and accuracy (public #1 for research)
 * - Grok: Best for real-time X/Twitter data and speed
 * - Gemini: Best for Google ecosystem integration
 * - ChatGPT Search: Best for complex multi-step analysis
 */
export const SEARCH_MODELS: ModalityModel[] = [
  // === HOBBY TIER ===
  {
    id: 'sonar',
    name: 'Sonar',
    provider: 'perplexity',
    tier: 'hobby',
    costPerUnit: 0.005, // Per search + $1/1M tokens
    quality: 'standard',
    speed: 'fast',
    capabilities: {
      languages: ['en', 'es', 'fr', 'de', 'zh', 'ja'],
    },
  },
  {
    id: 'grok-search',
    name: 'Grok Search',
    provider: 'xai',
    tier: 'hobby',
    costPerUnit: 0.005,
    quality: 'standard',
    speed: 'fast',
    capabilities: {
      languages: ['en', 'es', 'fr', 'de', 'zh', 'ja'],
    },
  },
  // === PRO TIER ===
  {
    id: 'sonar-pro',
    name: 'Sonar Pro',
    provider: 'perplexity',
    tier: 'pro',
    costPerUnit: 0.005,
    quality: 'hd',
    speed: 'normal',
    capabilities: {
      languages: ['en', 'es', 'fr', 'de', 'zh', 'ja'],
    },
  },
  {
    id: 'sonar-reasoning',
    name: 'Sonar Reasoning',
    provider: 'perplexity',
    tier: 'pro',
    costPerUnit: 0.005,
    quality: 'hd',
    speed: 'normal',
    capabilities: {
      languages: ['en', 'es', 'fr', 'de', 'zh', 'ja'],
    },
  },
  {
    id: 'sonar-deep-research',
    name: 'Sonar Deep Research',
    provider: 'perplexity',
    tier: 'pro',
    costPerUnit: 0.005,
    quality: 'ultra',
    speed: 'slow',
    capabilities: {
      languages: ['en', 'es', 'fr', 'de', 'zh', 'ja'],
    },
  },
  {
    id: 'gemini-search',
    name: 'Gemini Search',
    provider: 'google',
    tier: 'pro',
    costPerUnit: 0.005,
    quality: 'hd',
    speed: 'fast',
    capabilities: {
      languages: ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ko', 'ar', 'hi'],
    },
  },
  // === MAX/ENTERPRISE TIER ===
  {
    id: 'sonar-reasoning-pro',
    name: 'Sonar Reasoning Pro',
    provider: 'perplexity',
    tier: 'max',
    costPerUnit: 0.005,
    quality: 'ultra',
    speed: 'normal',
    capabilities: {
      languages: ['en', 'es', 'fr', 'de', 'zh', 'ja'],
    },
  },
  {
    id: 'chatgpt-search',
    name: 'ChatGPT Search',
    provider: 'openai',
    tier: 'max',
    costPerUnit: 0.01,
    quality: 'ultra',
    speed: 'normal',
    capabilities: {
      languages: ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ko', 'pt', 'ru'],
    },
  },
];

// ============================================
// MODEL POOLS BY MODALITY
// ============================================

/**
 * All models grouped by modality for easy lookup
 */
export const MODALITY_MODELS: Record<ModalityType, ModalityModel[]> = {
  image: IMAGE_MODELS,
  video: VIDEO_MODELS,
  tts: TTS_MODELS,
  stt: STT_MODELS,
  music: MUSIC_MODELS,
  search: SEARCH_MODELS,
};

// ============================================
// TIER HIERARCHY
// ============================================

const TIER_ORDER: Record<SubscriptionTier, number> = {
  hobby: 0,
  pro: 1,
  max: 2,
  enterprise: 3,
};

/**
 * Check if a user's tier can access a model
 */
function canAccessModel(userTier: SubscriptionTier, modelTier: SubscriptionTier): boolean {
  return TIER_ORDER[userTier] >= TIER_ORDER[modelTier];
}

// ============================================
// ROUTING FUNCTIONS
// ============================================

/**
 * Get available models for a modality based on user's tier
 */
export function getAvailableModels(
  modality: ModalityType,
  userTier: SubscriptionTier,
): ModalityModel[] {
  const models = MODALITY_MODELS[modality] || [];
  return models.filter((model) => canAccessModel(userTier, model.tier));
}

/**
 * Select the best model for a modality based on tier and preferences
 */
export function selectModalityModel(
  modality: ModalityType,
  userTier: SubscriptionTier,
  preferences?: {
    preferQuality?: boolean; // Prefer quality over speed
    preferSpeed?: boolean; // Prefer speed over quality
    preferCost?: boolean; // Prefer cheapest option
    preferredProvider?: string; // Prefer specific provider
  },
): MultiModalRoutingResult {
  const availableModels = getAvailableModels(modality, userTier);

  if (availableModels.length === 0) {
    // No models available for this tier
    const allModels = MODALITY_MODELS[modality] || [];
    const cheapestModel = allModels[0];

    return {
      selectedModel: cheapestModel?.id || 'unavailable',
      modality,
      reason: `No ${modality} models available for ${userTier} tier. Upgrade to ${cheapestModel?.tier || 'pro'} for access.`,
    };
  }

  // Score models based on preferences
  const scoredModels = availableModels.map((model) => {
    let score = 0;

    // Quality scoring
    if (preferences?.preferQuality) {
      if (model.quality === 'ultra') score += 3;
      else if (model.quality === 'hd') score += 2;
      else score += 1;
    }

    // Speed scoring
    if (preferences?.preferSpeed) {
      if (model.speed === 'fast') score += 3;
      else if (model.speed === 'normal') score += 2;
      else score += 1;
    }

    // Cost scoring (inverted - lower cost = higher score)
    if (preferences?.preferCost) {
      score += (1 / model.costPerUnit) * 0.1;
    }

    // Provider preference
    if (preferences?.preferredProvider && model.provider === preferences.preferredProvider) {
      score += 2;
    }

    // Default: balance of quality and cost
    if (!preferences?.preferQuality && !preferences?.preferSpeed && !preferences?.preferCost) {
      const qualityScore = model.quality === 'ultra' ? 3 : model.quality === 'hd' ? 2 : 1;
      const costScore = (1 / model.costPerUnit) * 0.05;
      score = qualityScore + costScore;
    }

    return { model, score };
  });

  // Sort by score (highest first)
  scoredModels.sort((a, b) => b.score - a.score);

  const selected = scoredModels[0]!;
  const alternatives = scoredModels.slice(1, 4).map((m) => m.model.id);

  return {
    selectedModel: selected.model.id,
    modality,
    reason: `${selected.model.name} - ${selected.model.quality} quality, ${selected.model.speed} speed, $${selected.model.costPerUnit.toFixed(3)}/unit`,
    estimatedCost: selected.model.costPerUnit,
    alternativeModels: alternatives,
  };
}

/**
 * Route an intent to the appropriate modality model
 */
export function routeToModalityModel(
  intent: IntentType,
  userTier: SubscriptionTier,
  preferences?: {
    preferQuality?: boolean;
    preferSpeed?: boolean;
    preferCost?: boolean;
    preferredProvider?: string;
  },
): MultiModalRoutingResult | null {
  // Map intent to modality
  let modality: ModalityType | null = null;

  switch (intent) {
    case 'image-gen':
      modality = 'image';
      break;
    case 'video-gen':
      modality = 'video';
      break;
    case 'tts':
      modality = 'tts';
      break;
    case 'stt':
      modality = 'stt';
      break;
    case 'music':
      modality = 'music';
      break;
    case 'search':
    case 'deep-research':
      modality = 'search';
      break;
    default:
      return null; // Not a modality intent, use chat models
  }

  // Special handling for deep research
  if (intent === 'deep-research') {
    // Force deep research model if available
    const searchModels = getAvailableModels('search', userTier);
    const deepResearchModel = searchModels.find((m) => m.id === 'sonar-deep-research');
    if (deepResearchModel) {
      return {
        selectedModel: 'sonar-deep-research',
        modality: 'search',
        reason:
          'Deep research intent detected - using Sonar Deep Research for comprehensive analysis',
        estimatedCost: deepResearchModel.costPerUnit,
      };
    }
  }

  return selectModalityModel(modality, userTier, preferences);
}

/**
 * Get model details by ID
 */
export function getModalityModelById(modelId: string): ModalityModel | undefined {
  for (const models of Object.values(MODALITY_MODELS)) {
    const found = models.find((m) => m.id === modelId);
    if (found) return found;
  }
  return undefined;
}

/**
 * Check if a model ID is a modality model (not a chat model)
 */
export function isModalityModel(modelId: string): boolean {
  return getModalityModelById(modelId) !== undefined;
}

/**
 * Get the modality type for a model ID
 */
export function getModelModality(modelId: string): ModalityType | null {
  for (const [modality, models] of Object.entries(MODALITY_MODELS)) {
    if (models.find((m) => m.id === modelId)) {
      return modality as ModalityType;
    }
  }
  return null;
}

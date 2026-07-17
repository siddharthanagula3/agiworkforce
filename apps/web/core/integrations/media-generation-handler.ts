/**
 * Media Generation Service
 * Integrates catalog-selected image and video generation models.
 */

import { googleImagenService } from './google-imagen-service';
import {
  googleVeoService,
  type VeoGenerationRequest as GoogleVeoRequest,
} from './google-veo-service';
import {
  getModelMetadataById,
  getRoutingSlotModel,
  isModelLive,
  type ModelMetadata,
} from '@agiworkforce/types';

const VIDEO_GENERATION_MODEL_ID = getRoutingSlotModel('video_generation');
const IMAGE_GENERATION_MODEL_ID = getRoutingSlotModel('image_generation');
const VEO_API_MODEL_ID =
  getModelMetadataById(VIDEO_GENERATION_MODEL_ID)?.apiModelId ?? VIDEO_GENERATION_MODEL_ID;

type ImageRouteProvider = 'google' | 'openai' | 'stability';

function resolveImageModel(requestedModelId?: string): ModelMetadata {
  const model = getModelMetadataById(requestedModelId ?? IMAGE_GENERATION_MODEL_ID);
  if (!model || model.modelType !== 'image' || !isModelLive(model)) {
    throw new Error(`Unknown or unavailable image model: ${requestedModelId ?? 'catalog default'}`);
  }
  return model;
}

function resolveImageRouteProvider(model: ModelMetadata): ImageRouteProvider {
  if (model.imageApi === 'openai') return 'openai';
  if (model.imageApi === 'gemini' || model.imageApi === 'imagen') return 'google';
  if (model.imageApi === 'stability') return 'stability';
  throw new Error(`Image model ${model.id} has no executable imageApi adapter`);
}

export interface ImageGenerationRequest {
  prompt: string;
  style?: 'realistic' | 'artistic' | 'cartoon' | 'anime' | 'photographic';
  size?: '1024x1024' | '1024x1792' | '1792x1024' | '512x512' | '256x256';
  quality?: 'standard' | 'hd';
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  negativePrompt?: string;
  seed?: number;
  steps?: number;
  guidance?: number;
  numberOfImages?: number;
  /** Canonical or provider API model id resolved through the shared catalog. */
  model?: string;
}

export interface VideoGenerationRequest {
  prompt: string;
  duration?: number; // in seconds
  resolution?: '720p' | '1080p' | '4k';
  style?: 'realistic' | 'artistic' | 'cinematic' | 'documentary';
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:3';
  fps?: number;
  seed?: number;
  /**
   * Wire-protocol model id; defaults to the catalog-selected video slot apiModelId.
   * Accepts any string so apiModelId shifts don't require a type bump.
   */
  model?: string;
}

export interface MediaGenerationResult {
  id: string;
  type: 'image' | 'video';
  url: string;
  thumbnailUrl?: string;
  prompt: string;
  metadata: {
    size?: string;
    duration?: number;
    resolution?: string;
    style?: string;
    seed?: number;
    steps?: number;
    guidance?: number;
    fps?: number;
    aspectRatio?: string;
    model?: string;
    hasAudio?: boolean;
  };
  cost: number;
  tokensUsed: number;
  createdAt: Date;
  status: 'generating' | 'completed' | 'failed' | 'processing';
  progress?: number;
  images?: Array<{ url: string; mimeType: string }>;
}

export interface MediaGenerationStats {
  totalGenerations: number;
  totalCost: number;
  imagesGenerated: number;
  videosGenerated: number;
  averageCostPerGeneration: number;
  mostUsedStyle: string;
  averageGenerationTime: number | undefined;
}

export class MediaGenerationService {
  private static instance: MediaGenerationService;
  private generationHistory: MediaGenerationResult[] = [];

  static getInstance(): MediaGenerationService {
    if (!MediaGenerationService.instance) {
      MediaGenerationService.instance = new MediaGenerationService();
    }
    return MediaGenerationService.instance;
  }

  /** Generate images through the unified Next.js API. */
  async generateImage(request: ImageGenerationRequest): Promise<MediaGenerationResult> {
    try {
      const selectedModel = resolveImageModel(request.model);
      const routeProvider = resolveImageRouteProvider(selectedModel);
      const response = await fetch('/api/media/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: request.prompt,
          provider: routeProvider,
          model: selectedModel.id,
          size: request.size || '1024x1024',
          style: request.style,
          n: request.numberOfImages ?? 1,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(
          err.error?.message || `Image generation failed with status ${response.status}`,
        );
      }

      const data = (await response.json()) as {
        success: boolean;
        images?: Array<{ url?: string; b64_json?: string }>;
        model?: string;
        cost_estimate?: number;
      };

      if (!data.success || !data.images || data.images.length === 0) {
        throw new Error('Image generation returned no results');
      }

      const firstImage = data.images[0];
      const imageUrl =
        firstImage?.url ||
        (firstImage?.b64_json ? `data:image/png;base64,${firstImage.b64_json}` : '');
      if (!imageUrl) {
        throw new Error('Image generation returned empty image data');
      }

      // Convert to MediaGenerationResult
      const result: MediaGenerationResult = {
        id: crypto.randomUUID(),
        type: 'image',
        url: imageUrl,
        prompt: request.prompt,
        metadata: {
          size: request.size || '1024x1024',
          model: data.model ?? selectedModel.id,
          style: request.style,
        },
        cost: data.cost_estimate || 0,
        tokensUsed: 0,
        createdAt: new Date(),
        status: 'completed',
        images: [
          {
            url: imageUrl,
            mimeType: 'image/png',
          },
        ],
      };

      this.generationHistory.push(result);
      return result;
    } catch (error) {
      throw new Error(
        `Image generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Generate video using Google Veo 3.1 API
   */
  async generateVideo(
    request: VideoGenerationRequest,
    onProgress?: (progress: number, status: string) => void,
  ): Promise<MediaGenerationResult> {
    if (!googleVeoService.isAvailable()) {
      throw new Error(
        'Google Veo service not configured. ' +
          'Get a key at https://aistudio.google.com/app/apikey and set NEXT_PUBLIC_GOOGLE_API_KEY in .env.local',
      );
    }

    try {
      // Prepare Veo request
      const veoRequest: GoogleVeoRequest = {
        prompt: request.prompt,
        model: request.model || VEO_API_MODEL_ID,
        resolution: request.resolution === '4k' ? '1080p' : request.resolution, // Veo 3.1 doesn't support 4k yet
        duration: request.duration || 8,
        aspectRatio: (request.aspectRatio === '4:3' ? '16:9' : request.aspectRatio) || '16:9',
        fps: request.fps || 24,
        seed: request.seed,
      };

      // Enhance prompt through authenticated proxy
      // SECURITY: API key is handled server-side by the proxy
      veoRequest.prompt = await googleVeoService.enhancePrompt(request.prompt);

      // Generate video with progress callback
      const veoResponse = await googleVeoService.generateVideo(veoRequest, onProgress);

      // Convert to MediaGenerationResult
      const result: MediaGenerationResult = {
        id: veoResponse.id,
        type: 'video',
        url: veoResponse.video?.url || '',
        thumbnailUrl: veoResponse.thumbnail?.url,
        prompt: veoResponse.prompt,
        metadata: {
          resolution: veoResponse.metadata.resolution,
          duration: veoResponse.metadata.duration,
          fps: veoResponse.metadata.fps,
          aspectRatio: veoResponse.metadata.aspectRatio,
          seed: veoResponse.metadata.seed,
          hasAudio: veoResponse.metadata.hasAudio,
          model: veoResponse.model,
        },
        cost: veoResponse.cost,
        tokensUsed: veoResponse.tokensUsed,
        createdAt: veoResponse.createdAt,
        status: veoResponse.status,
        progress: veoResponse.progress,
      };

      this.generationHistory.push(result);
      return result;
    } catch (error) {
      throw new Error(
        `Video generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get generation history
   */
  getGenerationHistory(): MediaGenerationResult[] {
    return [...this.generationHistory];
  }

  /**
   * Get generation statistics
   */
  getGenerationStats(): MediaGenerationStats {
    const totalGenerations = this.generationHistory.length;
    const totalCost = this.generationHistory.reduce((sum, gen) => sum + gen.cost, 0);
    const imagesGenerated = this.generationHistory.filter((gen) => gen.type === 'image').length;
    const videosGenerated = this.generationHistory.filter((gen) => gen.type === 'video').length;

    const styleCounts: Record<string, number> = {};
    this.generationHistory.forEach((gen) => {
      const style = gen.metadata.style || 'unknown';
      styleCounts[style] = (styleCounts[style] || 0) + 1;
    });

    const styleKeys = Object.keys(styleCounts);
    const mostUsedStyle =
      styleKeys.length > 0
        ? styleKeys.reduce((a, b) => (styleCounts[a]! > styleCounts[b]! ? a : b))
        : 'unknown';

    return {
      totalGenerations,
      totalCost,
      imagesGenerated,
      videosGenerated,
      averageCostPerGeneration: totalGenerations > 0 ? totalCost / totalGenerations : 0,
      mostUsedStyle,
      // Not yet implemented — no start/end timestamps stored per generation
      averageGenerationTime: undefined,
    };
  }

  /**
   * Get generation by ID
   */
  getGenerationById(id: string): MediaGenerationResult | undefined {
    return this.generationHistory.find((gen) => gen.id === id);
  }

  /**
   * Delete generation
   */
  deleteGeneration(id: string): boolean {
    const index = this.generationHistory.findIndex((gen) => gen.id === id);
    if (index !== -1) {
      this.generationHistory.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Clear generation history
   */
  clearHistory(): void {
    this.generationHistory = [];
  }

  /**
   * Check if service is available
   * SECURITY: Services are available through authenticated proxies
   */
  isServiceAvailable(): {
    imagen: boolean;
    veo: boolean;
    gemini: boolean;
  } {
    return {
      imagen: googleImagenService.isAvailable(),
      veo: googleVeoService.isAvailable(),
      gemini: true, // Always available through proxy or demo mode
    };
  }

  /**
   * Get available styles for image generation
   */
  getImageStyles(): string[] {
    return ['realistic', 'artistic', 'cartoon', 'anime', 'photographic'];
  }

  /**
   * Get available styles for video generation
   */
  getVideoStyles(): string[] {
    return ['realistic', 'artistic', 'cinematic', 'documentary'];
  }

  /**
   * Get available sizes for image generation
   */
  getImageSizes(): string[] {
    return ['1024x1024', '1024x1792', '1792x1024', '512x512', '256x256'];
  }

  /**
   * Get available resolutions for video generation
   */
  getVideoResolutions(): string[] {
    return ['720p', '1080p', '4k'];
  }
}

// Export singleton instance
export const mediaGenerationService = MediaGenerationService.getInstance();

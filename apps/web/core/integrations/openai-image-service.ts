/**
 * OpenAI GPT Image Generation Service
 * Implements real image generation using OpenAI's current image API through secure proxy
 *
 * SECURITY: All API calls are routed through Netlify proxy functions
 * to keep API keys secure on the server side. Never expose API keys client-side.
 */

import { getAuthToken } from '@shared/lib/get-auth-token';
import { logger } from '@shared/lib/logger';

export interface OpenAIImageGenerationRequest {
  prompt: string;
  size?:
    | '1024x1024'
    | '1024x1536'
    | '1536x1024'
    | '1024x1792'
    | '1792x1024'
    | '512x512'
    | '256x256'
    | 'auto';
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  n?: number;
  model?: 'gpt-image-2';
}

export interface OpenAIImageGenerationResponse {
  id: string;
  created: number;
  data: Array<{
    url: string;
    revised_prompt?: string;
  }>;
}

export interface ImageGenerationResult {
  id: string;
  url: string;
  prompt: string;
  revisedPrompt?: string;
  size: string;
  quality: string;
  style?: string;
  model: string;
  createdAt: Date;
}

/**
 * GPT Image Generation Service
 * SECURITY: Routes through Netlify proxy to keep API keys secure
 */
export class OpenAIImageService {
  private static instance: OpenAIImageService;
  // SECURITY: API keys are managed by Netlify proxy functions
  private readonly proxyUrl = '/.netlify/functions/media-proxies/openai-image-proxy';

  private constructor() {
    // SECURITY: API keys removed from client-side code
    // All calls go through authenticated Netlify proxy
  }

  static getInstance(): OpenAIImageService {
    if (!OpenAIImageService.instance) {
      OpenAIImageService.instance = new OpenAIImageService();
    }
    return OpenAIImageService.instance;
  }

  /** Generate images using GPT Image 2 through secure proxy. */
  async generateImage(request: OpenAIImageGenerationRequest): Promise<ImageGenerationResult[]> {
    const {
      prompt,
      size = '1024x1024',
      quality = 'standard',
      style = 'vivid',
      n = 1,
      model = 'gpt-image-2',
    } = request;
    const apiSize = normalizeImageSize(size);
    const apiQuality = quality === 'hd' ? 'high' : 'medium';

    // Validate request
    if (!prompt || prompt.trim().length === 0) {
      throw new Error('Image generation prompt is required');
    }

    // SECURITY: Get auth token for authenticated proxy calls
    const authToken = await getAuthToken();
    if (!authToken) {
      throw new Error('User not authenticated. Please log in to generate images.');
    }

    try {
      const response = await fetch(this.proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          model,
          prompt: prompt.trim(),
          size: apiSize,
          quality: apiQuality,
          n,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.error?.message ||
          errorData.error ||
          `API error: ${response.status} ${response.statusText}`;
        throw new Error(errorMessage);
      }

      const data: OpenAIImageGenerationResponse = await response.json();

      // Map to our format
      return data.data.map((image, index) => ({
        id: `${data.created}-${index}`,
        url: image.url,
        prompt,
        revisedPrompt: image.revised_prompt,
        size: apiSize,
        quality: apiQuality,
        style,
        model,
        createdAt: new Date(data.created * 1000),
      }));
    } catch (error) {
      logger.error('[GPTImageService] Generation failed:', error);
      throw error instanceof Error ? error : new Error('Unknown error during image generation');
    }
  }

  /**
   * Estimate cost for image generation
   * Estimate user-facing cost for GPT Image 2. OpenAI bills image generation
   * by tokenized text/image input and generated image output; these estimates
   * intentionally round up to avoid under-reporting demo usage.
   */
  estimateCost(request: OpenAIImageGenerationRequest): number {
    const { quality = 'standard', size = '1024x1024' } = request;
    const normalizedSize = normalizeImageSize(size);
    const base = quality === 'hd' ? 0.211 : 0.053;
    const wideOrTall = normalizedSize === '1024x1536' || normalizedSize === '1536x1024';
    return wideOrTall ? Number((base * 1.5).toFixed(3)) : base;
  }
}

export const openAIImageService = OpenAIImageService.getInstance();

function normalizeImageSize(size: NonNullable<OpenAIImageGenerationRequest['size']>): string {
  if (size === '1024x1792' || size === '1024x1536') return '1024x1536';
  if (size === '1792x1024' || size === '1536x1024') return '1536x1024';
  if (size === '512x512' || size === '256x256') return '1024x1024';
  return size;
}

/**
 * Image Generation Service
 *
 * Handles image generation requests to the API gateway.
 * Supports multiple models (DALL-E 3, GPT Image 1, Stable Diffusion XL).
 */

import { api } from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImageGenRequest {
  prompt: string;
  model?: string;
  size?: '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792';
  quality?: 'standard' | 'hd';
  style?: 'natural' | 'vivid';
  n?: number;
}

export interface ImageGenResponse {
  id: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  images: Array<{ url: string; revisedPrompt?: string }>;
  error?: string;
}

export interface ImageGenProgress {
  id: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  progress: number;
  estimatedTimeRemaining?: number;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

/**
 * Submit an image generation request.
 * Returns immediately with an ID for polling.
 * @throws {Error} On network or server errors
 */
export async function generateImage(request: ImageGenRequest): Promise<ImageGenResponse> {
  if (!request.prompt.trim()) {
    throw new Error('Image generation requires a non-empty prompt');
  }
  return api.post<ImageGenResponse>('/api/imagegen/generate', request);
}

/**
 * Poll the status/progress of an in-flight image generation.
 * @throws {Error} On network or server errors
 */
export async function getImageStatus(id: string): Promise<ImageGenProgress> {
  if (!id) {
    throw new Error('Image generation ID is required');
  }
  return api.get<ImageGenProgress>(`/api/imagegen/status/${encodeURIComponent(id)}`);
}

/**
 * List all generated images for a conversation.
 * Returns empty array if the endpoint is unavailable.
 */
export async function listGeneratedImages(conversationId: string): Promise<ImageGenResponse[]> {
  if (!conversationId) return [];
  try {
    return await api.get<ImageGenResponse[]>(
      `/api/imagegen/list?conversationId=${encodeURIComponent(conversationId)}`,
    );
  } catch {
    return [];
  }
}

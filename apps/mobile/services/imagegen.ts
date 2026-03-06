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
  model?: string; // e.g., 'gpt-image-1', 'dall-e-3', 'stable-diffusion-xl'
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
  progress: number; // 0-100
  estimatedTimeRemaining?: number; // seconds
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

/**
 * Submit an image generation request.
 * Returns immediately with an ID for polling.
 */
export async function generateImage(request: ImageGenRequest): Promise<ImageGenResponse> {
  return api.post<ImageGenResponse>('/api/imagegen/generate', request);
}

/**
 * Poll the status/progress of an in-flight image generation.
 */
export async function getImageStatus(id: string): Promise<ImageGenProgress> {
  return api.get<ImageGenProgress>(`/api/imagegen/status/${id}`);
}

/**
 * List all generated images for a conversation.
 */
export async function listGeneratedImages(conversationId: string): Promise<ImageGenResponse[]> {
  return api.get<ImageGenResponse[]>(
    `/api/imagegen/list?conversationId=${encodeURIComponent(conversationId)}`,
  );
}

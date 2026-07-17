/**
 * Image Generation Service
 *
 * Handles image generation requests to the API gateway. The set of supported
 * image models is owned by the gateway and the canonical model catalog
 * (`packages/contracts/types/src/models.json`); this client does not pin model IDs so it
 * cannot drift from the catalog. `request.model` is an optional override the
 * gateway validates server-side.
 */

import { api } from '@/services/api';
import { FEATURES } from '@/lib/v1FeatureFlags';
import type { ManagedMediaImageGenerationRequest } from '@agiworkforce/cloud-contracts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Canonical Web/Mobile/Desktop managed-media request; never redeclare it per surface. */
export type ImageGenRequest = ManagedMediaImageGenerationRequest;

export interface ImageGenResponse {
  success?: boolean;
  id?: string;
  status?: 'pending' | 'generating' | 'completed' | 'failed';
  images?: GeneratedImage[];
  provider?: string;
  model?: string;
  cost_estimate?: number;
  latency_ms?: number;
  error?: string;
}

export interface GeneratedImage {
  url?: string;
  b64_json?: string;
  revisedPrompt?: string;
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
  if (!FEATURES.imageGen) throw new Error('imagegen: image generation not available in v1');
  if (!request.prompt.trim()) {
    throw new Error('Image generation requires a non-empty prompt');
  }
  return api.post<ImageGenResponse>('/api/media/image/generate', request);
}

export function getGeneratedImageUri(image: GeneratedImage | undefined): string | null {
  if (!image) return null;
  if (image.url) return image.url;
  if (image.b64_json) return `data:image/png;base64,${image.b64_json}`;
  return null;
}

/**
 * Poll the status/progress of an in-flight image generation.
 * @throws {Error} On network or server errors
 */
export async function getImageStatus(id: string): Promise<ImageGenProgress> {
  if (!id) {
    throw new Error('Image generation ID is required');
  }
  return api.get<ImageGenProgress>(`/api/media/image/status/${encodeURIComponent(id)}`);
}

/**
 * List all generated images for a conversation.
 * Returns empty array if the endpoint is unavailable.
 */
export async function listGeneratedImages(conversationId: string): Promise<ImageGenResponse[]> {
  if (!conversationId) return [];
  try {
    return await api.get<ImageGenResponse[]>(
      `/api/media/image/list?conversationId=${encodeURIComponent(conversationId)}`,
    );
  } catch {
    return [];
  }
}

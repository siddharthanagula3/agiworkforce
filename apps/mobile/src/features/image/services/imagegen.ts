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

// STB-21: `getImageStatus()` and `listGeneratedImages()` were removed. They
// targeted `/api/media/image/status/:id` and `/api/media/image/list`, neither of
// which exists — only `/api/media/image/generate` does (the *video* pipeline has
// a status route, which is where the shape was copied from). Both had zero
// callers, and `listGeneratedImages` wrapped its 404 in `try {} catch { return
// [] }`, so a caller would have rendered "no images" rather than an error.
// `/api/media/image/generate` returns completed images inline; there is nothing
// to poll. Generated media is listed via `/api/library`.

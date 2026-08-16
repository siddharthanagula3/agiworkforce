
import * as Crypto from 'expo-crypto';

import { api } from '@/services/api';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { API_URL } from '@/lib/constants';
import { createManagedMediaIdempotencyKey } from '@agiworkforce/utils/managed-media-idempotency';
import type { ManagedMediaImageGenerationRequest } from '@agiworkforce/cloud-contracts';

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
  persisted?: boolean;
  error?: string;
}

export interface GeneratedImage {
  url?: string;
  b64_json?: string;
  revisedPrompt?: string;
}

/**
 * Submit an image generation request.
 * The current managed-media endpoint returns its completed image response
 * inline; this client does not invent a polling route.
 * @throws {Error} On network or server errors
 */
export async function generateImage(
  request: ImageGenRequest,
  options: { operationId?: string } = {},
): Promise<ImageGenResponse> {
  if (!FEATURES.imageGen) throw new Error('imagegen: image generation not available in v1');
  if (!request.prompt.trim()) {
    throw new Error('Image generation requires a non-empty prompt');
  }

  const idempotencyKey = createManagedMediaIdempotencyKey({
    surface: 'mobile',
    operation: 'image',
    operationId: options.operationId ?? Crypto.randomUUID(),
  });

  return api.post<ImageGenResponse>('/api/media/image/generate', request, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

export function getGeneratedImageUri(image: GeneratedImage | undefined): string | null {
  if (!image) return null;
  if (image.url) return image.url;
  if (image.b64_json) return `data:image/png;base64,${image.b64_json}`;
  return null;
}

const DURABLE_GENERATED_IMAGE_PATH =
  /^\/api\/files\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getDurableGeneratedImagePath(image: GeneratedImage | undefined): string | null {
  const candidate = image?.url?.trim();
  return candidate && DURABLE_GENERATED_IMAGE_PATH.test(candidate) ? candidate : null;
}

export function resolveGeneratedImageUri(path: string): string | null {
  const candidate = path.trim();
  if (!DURABLE_GENERATED_IMAGE_PATH.test(candidate)) return null;
  return `${API_URL.replace(/\/+$/, '')}${candidate}`;
}


/**
 * Image Generation Service
 *
 * Handles image generation requests to the API gateway. The set of supported
 * image models is owned by the gateway and the canonical model catalog
 * (`packages/contracts/types/src/models.json`); this client does not pin model IDs so it
 * cannot drift from the catalog. `request.model` is an optional override the
 * gateway validates server-side.
 */

import * as Crypto from 'expo-crypto';

import { api } from '@/services/api';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { API_URL } from '@/lib/constants';
// Deep subpath, NOT the '@agiworkforce/utils' barrel: the barrel re-exports
// pathContainment.ts, which imports 'node:path'. Metro has no Node stdlib, so
// importing the barrel from a mobile file fails the whole bundle
// ("You attempted to import the Node standard library module 'node:path'").
import { createManagedMediaIdempotencyKey } from '@agiworkforce/utils/managed-media-idempotency';
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
  /** True only when the response points at durable owner-scoped media storage. */
  persisted?: boolean;
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

  /**
   * `Idempotency-Key` is REQUIRED by `/api/media/image/generate` — the route
   * calls `parseManagedUsageIdempotencyKey` before it does any work, so every
   * mobile image generation failed outright with "Idempotency-Key header is
   * required for Managed Cloud chat". Web (`useMediaGeneration.ts`) and Desktop
   * (`CloudRuntime.ts`) both built the key with the shared helper; mobile sent
   * no header at all.
   *
   * The key is derived ONCE per user action. `options.operationId` lets a caller
   * reuse the same identity across transport retries so a retried request is
   * settled once rather than billed twice — which is the whole point of the
   * header, not a formality to satisfy.
   */
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

/**
 * Return the only image identity that is safe to persist and sync.
 *
 * Provider URLs and inline base64 may be displayed for the current response,
 * but they are not durable owner-scoped media and must never enter a transcript
 * or artifact record that claims it will survive a reload.
 */
export function getDurableGeneratedImagePath(image: GeneratedImage | undefined): string | null {
  const candidate = image?.url?.trim();
  return candidate && DURABLE_GENERATED_IMAGE_PATH.test(candidate) ? candidate : null;
}

/** Resolve a validated owner-scoped path through the one configured AGI Cloud origin. */
export function resolveGeneratedImageUri(path: string): string | null {
  const candidate = path.trim();
  if (!DURABLE_GENERATED_IMAGE_PATH.test(candidate)) return null;
  return `${API_URL.replace(/\/+$/, '')}${candidate}`;
}

// STB-21: `getImageStatus()` and `listGeneratedImages()` were removed. They
// targeted `/api/media/image/status/:id` and `/api/media/image/list`, neither of
// which exists — only `/api/media/image/generate` does (the *video* pipeline has
// a status route, which is where the shape was copied from). Both had zero
// callers, and `listGeneratedImages` wrapped its 404 in `try {} catch { return
// [] }`, so a caller would have rendered "no images" rather than an error.
// `/api/media/image/generate` returns completed images inline; there is nothing
// to poll. Generated media is listed via `/api/library`.

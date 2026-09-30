import * as Crypto from 'expo-crypto';

import { api } from '@/services/api';
import { ApiHttpError } from '@/services/apiErrors';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { API_URL } from '@/lib/constants';
import { createManagedMediaIdempotencyKey } from '@agiworkforce/utils/managed-media-idempotency';
import type { ManagedMediaImageGenerationRequest } from '@agiworkforce/cloud-contracts';
import { IN_FLIGHT_IMAGE_JOB_STATUSES, type ImageJobStatus } from '@agiworkforce/types';

export type ImageGenRequest = ManagedMediaImageGenerationRequest;

export interface ImageGenResponse {
  success?: boolean;
  id?: string;
  job_id?: string;
  status?: ImageJobStatus;
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

const IMAGE_JOB_POLL_MS = 2_000;
const IMAGE_JOB_MAX_WAIT_MS = 170_000;
const PENDING_JOB_STATUSES: ReadonlySet<ImageJobStatus> = new Set(IN_FLIGHT_IMAGE_JOB_STATUSES);

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Submit an image generation request as a durable job and follow it to the
 * end. A slow provider then outlives the submitting request instead of failing
 * it, and a retry of the same turn reuses the job its key already names.
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

  const operationId = options.operationId ?? Crypto.randomUUID();
  let submitted: ImageGenResponse;
  try {
    submitted = await api.post<ImageGenResponse>(
      '/api/media/image/generate',
      { ...request, async: true },
      { headers: { 'Idempotency-Key': imageIdempotencyKey(operationId) } },
    );
  } catch (error) {
    if (error instanceof ApiHttpError && error.code === 'image_job_store_unavailable') {
      return api.post<ImageGenResponse>('/api/media/image/generate', request, {
        headers: { 'Idempotency-Key': imageIdempotencyKey(`${operationId}-direct`) },
      });
    }
    throw error;
  }
  return followImageJob(submitted);
}

async function followImageJob(submitted: ImageGenResponse): Promise<ImageGenResponse> {
  let current = submitted;
  const deadline = Date.now() + IMAGE_JOB_MAX_WAIT_MS;
  while (current.job_id && current.status && PENDING_JOB_STATUSES.has(current.status)) {
    if (Date.now() > deadline) {
      throw new Error('The image is still being made. It will appear in your Library when ready.');
    }
    await wait(IMAGE_JOB_POLL_MS);
    current = await api.get<ImageGenResponse>(
      `/api/media/image/status?job_id=${encodeURIComponent(current.job_id)}`,
    );
  }
  return current;
}

function imageIdempotencyKey(operationId: string): string {
  return createManagedMediaIdempotencyKey({ surface: 'mobile', operation: 'image', operationId });
}

export async function cancelImageGeneration(operationId: string): Promise<void> {
  await api.post('/api/media/image/cancel', {
    idempotency_key: imageIdempotencyKey(operationId),
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

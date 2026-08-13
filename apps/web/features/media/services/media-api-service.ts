/**
 * Media API Service
 * Handles real API calls to /api/media/image/generate and /api/media/video/generate.
 */

import { getAuthToken } from '@shared/lib/get-auth-token';
import { createManagedMediaIdempotencyKey, type ManagedMediaOperation } from '@agiworkforce/utils';
import type {
  ManagedMediaImageAspectRatio,
  ManagedMediaVideoAspectRatio,
  ManagedMediaVideoResolution,
} from '@agiworkforce/cloud-contracts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeneratedImage {
  url?: string;
  b64_json?: string;
}

export interface ImageGenerationRequest {
  prompt: string;
  provider?: 'google' | 'openai' | 'stability';
  aspect_ratio?: ManagedMediaImageAspectRatio;
  /** Legacy Mobile/Desktop compatibility; new Web callers prefer `aspect_ratio`. */
  size?: string;
  style?: string;
  quality?: 'standard' | 'hd';
  n?: number;
  negative_prompt?: string;
}

export interface ImageGenerationResponse {
  success: boolean;
  images: GeneratedImage[];
  provider: string;
  model: string;
  latency_ms: number;
  error?: string;
}

export interface VideoGenerationRequest {
  prompt: string;
  duration_secs?: number;
  resolution?: ManagedMediaVideoResolution;
  /**
   * Landscape/portrait. The route has always read `aspect_ratio` and
   * validated it against the model's published output sizes, but this
   * contract never carried the field, so the composer had no way to send
   * anything but the route's 16:9 default.
   */
  aspect_ratio?: ManagedMediaVideoAspectRatio;
  provider?: 'runway' | 'google' | 'openrouter';
  /**
   * Catalog model id for the composer's video picker. The route validates it
   * (must be `modelType: 'video'`, live, and owned by an executable provider)
   * and falls back to the catalog's `video_generation` routing slot when
   * omitted, so sending nothing preserves the previous behavior exactly.
   */
  model?: string;
  /** Persisted Web chat owner; both ids are required together by the route. */
  conversation_id?: string;
  /** Pre-persisted assistant placeholder updated by the durable job owner. */
  assistant_message_id?: string;
}

export interface VideoGenerationResponse {
  success: boolean;
  task_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  provider: string;
  model: string;
  estimated_duration_secs: number;
  video_url?: string;
  error?: string;
}

export interface VideoStatusResponse {
  success: boolean;
  task_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'timeout';
  video_url?: string;
  thumbnail_url?: string;
  progress?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function requireAuthToken(): Promise<string> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Not authenticated. Please sign in to continue.');
  }
  return token;
}

function createWebMediaIdempotencyKey(
  operation: ManagedMediaOperation,
  operationId = crypto.randomUUID(),
): string {
  return createManagedMediaIdempotencyKey({
    surface: 'web',
    operation,
    operationId,
  });
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Generate images via /api/media/image/generate
 */
export async function generateImages(
  request: ImageGenerationRequest,
): Promise<ImageGenerationResponse> {
  const idempotencyKey = createWebMediaIdempotencyKey('image');
  const token = await requireAuthToken();

  const response = await fetch('/api/media/image/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(request),
  });

  const data = (await response.json()) as ImageGenerationResponse & {
    error?: string | { message?: string };
  };

  if (!response.ok) {
    const errMsg =
      typeof data.error === 'string'
        ? data.error
        : (data.error as { message?: string } | undefined)?.message ||
          `Image generation failed (${response.status})`;
    throw new Error(errMsg);
  }

  if (!data.success && data.error) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Image generation failed');
  }

  return data;
}

/**
 * Transport-level failure that KEEPS the API's structured error fields.
 *
 * The previous `throw new Error(data.error || ...)` stringified an error body
 * of the shape `{ error: { message, code } }` — which is exactly what the
 * video route's tier refusal returns — into the literal text
 * "[object Object]", destroying the `plan_upgrade_required` code the client's
 * paywall detection matches on. Classification stays in `useMediaGeneration`
 * (MediaGenerationApiError); this type only carries the fields there intact.
 */
export class MediaApiError extends Error {
  readonly status: number | undefined;
  readonly code: string | undefined;
  readonly type: string | undefined;
  readonly currentPlan: string | undefined;
  readonly requiredPlans: readonly string[] | undefined;
  readonly resetAt: string | undefined;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      type?: string;
      currentPlan?: string;
      requiredPlans?: readonly string[];
      resetAt?: string;
    } = {},
  ) {
    super(message);
    this.name = 'MediaApiError';
    this.status = options.status;
    this.code = options.code;
    this.type = options.type;
    this.currentPlan = options.currentPlan;
    this.requiredPlans = options.requiredPlans;
    this.resetAt = options.resetAt;
  }
}

async function readApiError(response: Response, fallback: string): Promise<MediaApiError> {
  const body = (await response.json().catch(() => ({}))) as {
    error?:
      | string
      | {
          message?: string;
          code?: string;
          type?: string;
          current_plan?: string;
          required_plans?: unknown;
          reset_at?: string;
        };
    message?: string;
  };
  const errorField = body.error;
  const nested = typeof errorField === 'object' && errorField !== null ? errorField : undefined;
  const message =
    nested?.message ||
    (typeof errorField === 'string' ? errorField : undefined) ||
    body.message ||
    fallback;
  return new MediaApiError(message, {
    status: response.status,
    ...(nested?.code !== undefined ? { code: nested.code } : {}),
    ...(nested?.type !== undefined ? { type: nested.type } : {}),
    ...(nested?.current_plan !== undefined ? { currentPlan: nested.current_plan } : {}),
    ...(Array.isArray(nested?.required_plans)
      ? {
          requiredPlans: nested.required_plans.filter(
            (plan: unknown): plan is string => typeof plan === 'string',
          ),
        }
      : {}),
    ...(nested?.reset_at !== undefined ? { resetAt: nested.reset_at } : {}),
  });
}

/**
 * Start video generation via /api/media/video/generate
 */
export async function generateVideo(
  request: VideoGenerationRequest,
): Promise<VideoGenerationResponse> {
  // The pre-persisted assistant UUID is the stable user-action identity. If a
  // POST response is lost, retrying that same placeholder replays the durable
  // job instead of creating a second paid provider task.
  const idempotencyKey = createWebMediaIdempotencyKey('video', request.assistant_message_id);
  const token = await requireAuthToken();

  const response = await fetch('/api/media/video/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw await readApiError(response, `Video generation failed (${response.status})`);
  }

  return (await response.json()) as VideoGenerationResponse;
}

/**
 * Poll video generation status via /api/media/video/status
 */
export async function getVideoStatus(taskId: string): Promise<VideoStatusResponse> {
  const token = await requireAuthToken();

  const response = await fetch(`/api/media/video/status?task_id=${encodeURIComponent(taskId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw await readApiError(response, `Failed to get video status (${response.status})`);
  }

  return (await response.json()) as VideoStatusResponse;
}

/**
 * Get a displayable URL for a generated image.
 * If the image is base64-encoded, convert to a data URI.
 */
export function getImageDisplayUrl(image: GeneratedImage): string {
  if (image.url) return image.url;
  if (image.b64_json) return `data:image/png;base64,${image.b64_json}`;
  return '';
}

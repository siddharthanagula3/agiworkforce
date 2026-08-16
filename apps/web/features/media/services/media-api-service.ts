
import { getAuthToken } from '@shared/lib/get-auth-token';
import { createManagedMediaIdempotencyKey, type ManagedMediaOperation } from '@agiworkforce/utils';
import type {
  ManagedMediaImageAspectRatio,
  ManagedMediaVideoAspectRatio,
  ManagedMediaVideoResolution,
} from '@agiworkforce/cloud-contracts';

export interface GeneratedImage {
  url?: string;
  b64_json?: string;
}

export interface ImageGenerationRequest {
  prompt: string;
  provider?: 'google' | 'openai' | 'stability';
  aspect_ratio?: ManagedMediaImageAspectRatio;
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
  aspect_ratio?: ManagedMediaVideoAspectRatio;
  provider?: 'runway' | 'google' | 'openrouter';
  model?: string;
  conversation_id?: string;
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

export async function generateVideo(
  request: VideoGenerationRequest,
): Promise<VideoGenerationResponse> {
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

export function getImageDisplayUrl(image: GeneratedImage): string {
  if (image.url) return image.url;
  if (image.b64_json) return `data:image/png;base64,${image.b64_json}`;
  return '';
}

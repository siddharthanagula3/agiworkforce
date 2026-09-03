'use client';

import { useCallback } from 'react';
import { createManagedMediaIdempotencyKey } from '@agiworkforce/utils';
import {
  classifyManagedQuotaErrorCode,
  getModelMetadataById,
  isExecutableImageModel,
  isExecutableVideoModel,
} from '@agiworkforce/types';
import type {
  ManagedMediaImageAspectRatio,
  ManagedMediaVideoAspectRatio,
  ManagedMediaVideoResolution,
} from '@agiworkforce/cloud-contracts';
import { useMediaStore } from '@shared/stores/media-store';
import {
  generateVideo as startVideoGeneration,
  getVideoStatus,
  MediaApiError,
} from '@features/media/services/media-api-service';
import { IMAGE_GENERATION_FUNCTION_LIMIT_MS } from '@/lib/deadline-policy';

async function getAuthToken(): Promise<string> {
  const { getAuthToken: getClerkToken } = await import('@shared/lib/get-auth-token');
  return (await getClerkToken()) || '';
}

export interface GenerateVideoOptions {
  durationSecs?: number;
  resolution?: ManagedMediaVideoResolution;
  aspectRatio?: ManagedMediaVideoAspectRatio;
  provider?: 'runway' | 'google' | 'openrouter';
  modelId?: string;
  conversationId?: string;
  assistantMessageId?: string;
}

export interface StartedVideoGeneration {
  taskId: string;
  provider: 'runway' | 'google' | 'openrouter';
  model: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  estimatedDurationSecs: number;
  localJobId: string;
}

export interface CompletedVideoGeneration {
  status: 'completed';
  taskId: string;
  videoUrl: string;
  thumbnailUrl?: string;
}

export interface PendingVideoGeneration {
  status: 'pending';
  taskId: string;
  taskStatus: 'queued' | 'processing';
  progress?: number;
}

export interface FailedVideoGeneration {
  status: 'failed';
  taskId: string;
  error: string;
}

export type VideoWatchResult =
  | CompletedVideoGeneration
  | PendingVideoGeneration
  | FailedVideoGeneration;

const VIDEO_POLL_INTERVAL_MS = 5_000;
const VIDEO_POLL_TIMEOUT_MS = 5 * 60_000;

export interface GenerateImageOptions {
  aspectRatio?: ManagedMediaImageAspectRatio;
  size?: '1024x1024' | '1792x1024' | '1024x1792';
  provider?: 'google' | 'openai';
  model?: string;
  conversationId?: string;
}

export interface GeneratedImageResult {
  imageUrl: string;
  provider: 'google' | 'openai';
  model: string;
}

export type MediaPaywallRecoveryAction =
  | 'upgrade'
  | 'subscribe'
  | 'manage_billing'
  | 'view_usage'
  | 'top_up';

const PAYWALL_ERROR_RECOVERY: Readonly<Record<string, MediaPaywallRecoveryAction>> = {
  insufficient_credits: 'upgrade',
  plan_upgrade_required: 'upgrade',
  subscription_required: 'subscribe',
  subscription_inactive: 'manage_billing',
};
const PAYWALL_ERROR_TYPES = new Set(['insufficient_quota', 'plan_upgrade_required']);
const MAX_MEDIA_RETRY_AFTER_SECONDS = 5 * 60;
const IMAGE_GENERATION_TIMEOUT_CODE = 'image_generation_timeout';
const IMAGE_GENERATION_TIMEOUT_MESSAGE =
  'The image did not finish in time. Try again or pick another image model.';

function retryAtFromStructuredSeconds(value: unknown): string | undefined {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_MEDIA_RETRY_AFTER_SECONDS
  ) {
    return undefined;
  }
  return new Date(Date.now() + value * 1_000).toISOString();
}

function mediaPaywallRecoveryAction(input: {
  status?: number;
  code?: string;
  type?: string;
}): MediaPaywallRecoveryAction | null {
  const codeRecovery = input.code ? PAYWALL_ERROR_RECOVERY[input.code] : undefined;
  if (codeRecovery) return codeRecovery;
  if (classifyManagedQuotaErrorCode(input.code)) return 'view_usage';
  if (input.type && PAYWALL_ERROR_TYPES.has(input.type)) return 'upgrade';
  if (input.status === 402) return 'upgrade';
  return null;
}

export class MediaGenerationApiError extends Error {
  status: number | undefined;
  code: string | undefined;
  type: string | undefined;
  currentPlan: string | undefined;
  requiredPlans: readonly string[] | undefined;
  resetAt: string | undefined;
  recoveryAction: MediaPaywallRecoveryAction | null;
  isPaywall: boolean;

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
    this.name = 'MediaGenerationApiError';
    this.status = options.status;
    this.code = options.code;
    this.type = options.type;
    this.currentPlan = options.currentPlan;
    this.requiredPlans = options.requiredPlans;
    this.resetAt = options.resetAt;
    this.recoveryAction = mediaPaywallRecoveryAction(options);
    this.isPaywall = this.recoveryAction !== null;
  }
}

function objectUrlFromBase64(b64: string | undefined): string | undefined {
  if (!b64) return undefined;
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return undefined;
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    console.warn(
      '[media] Object storage is not configured on this deployment, so the generated image was returned inline. It is shown from an in-memory blob: URL and will not survive a reload. Configure CLOUDFLARE_R2_* to persist generated media.',
    );
    return URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
  } catch {
    return undefined;
  }
}

function toMediaGenerationError(err: unknown): unknown {
  if (!(err instanceof MediaApiError)) return err;
  return new MediaGenerationApiError(err.message, {
    ...(err.status !== undefined ? { status: err.status } : {}),
    ...(err.code !== undefined ? { code: err.code } : {}),
    ...(err.type !== undefined ? { type: err.type } : {}),
    ...(err.currentPlan !== undefined ? { currentPlan: err.currentPlan } : {}),
    ...(err.requiredPlans !== undefined ? { requiredPlans: err.requiredPlans } : {}),
    ...(err.resetAt !== undefined ? { resetAt: err.resetAt } : {}),
  });
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError'
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useMediaGeneration() {
  const { addJob, updateJob } = useMediaStore();

  const generateImage = useCallback(
    async (prompt: string, options: GenerateImageOptions = {}) => {
      const jobId = crypto.randomUUID();
      const idempotencyKey = createManagedMediaIdempotencyKey({
        surface: 'web',
        operation: 'image',
        operationId: jobId,
      });
      const authToken = await getAuthToken();

      addJob({
        id: jobId,
        type: 'image',
        prompt,
        status: 'generating',
        size: options.aspectRatio ?? options.size ?? '1024x1024',
        provider: options.provider,
        createdAt: new Date().toISOString(),
      });

      const deadline = new AbortController();
      const deadlineTimer = setTimeout(() => deadline.abort(), IMAGE_GENERATION_FUNCTION_LIMIT_MS);

      try {
        const response = await fetch('/api/media/image/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            prompt,
            ...(options.conversationId ? { conversation_id: options.conversationId } : {}),
            ...(options.aspectRatio ? { aspect_ratio: options.aspectRatio } : {}),
            ...(options.size ? { size: options.size } : {}),
            ...(options.provider ? { provider: options.provider } : {}),
            ...(options.model ? { model: options.model } : {}),
          }),
          signal: deadline.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Generation failed' }));
          const errorField = err?.error;
          const message =
            (typeof errorField === 'object' && errorField?.message) ||
            (typeof errorField === 'string' ? errorField : undefined) ||
            `Request failed: ${response.status}`;
          const code = typeof errorField === 'object' ? errorField?.code : undefined;
          const type = typeof errorField === 'object' ? errorField?.type : undefined;
          const currentPlan =
            typeof errorField === 'object' && typeof errorField?.current_plan === 'string'
              ? errorField.current_plan
              : undefined;
          const requiredPlans =
            typeof errorField === 'object' && Array.isArray(errorField?.required_plans)
              ? errorField.required_plans.filter(
                  (plan: unknown): plan is string => typeof plan === 'string',
                )
              : undefined;
          const resetAt =
            typeof errorField === 'object' && typeof errorField?.reset_at === 'string'
              ? errorField.reset_at
              : response.status === 429
                ? retryAtFromStructuredSeconds(err?.retry_after_seconds)
                : undefined;
          throw new MediaGenerationApiError(message, {
            status: response.status,
            code,
            type,
            currentPlan,
            requiredPlans,
            resetAt,
          });
        }

        const data = (await response.json()) as {
          images?: Array<{ url?: string; b64_json?: string }>;
          persisted?: boolean;
          provider?: unknown;
          catalog_model?: unknown;
        };
        const first = data.images?.[0];
        const resultUrl = first?.url ?? objectUrlFromBase64(first?.b64_json);

        if (!resultUrl) throw new Error('No image URL in response');

        const catalogModel =
          typeof data.catalog_model === 'string' ? getModelMetadataById(data.catalog_model) : null;
        if (
          !isExecutableImageModel(catalogModel) ||
          (data.provider !== 'google' && data.provider !== 'openai') ||
          catalogModel.provider !== data.provider
        ) {
          throw new Error('Image response did not include valid canonical model provenance');
        }

        updateJob(jobId, {
          status: 'completed',
          resultUrl,
          completedAt: new Date().toISOString(),
        });

        return {
          imageUrl: resultUrl,
          provider: data.provider,
          model: catalogModel.id,
        } satisfies GeneratedImageResult;
      } catch (err) {
        const error = isAbortError(err)
          ? new MediaGenerationApiError(IMAGE_GENERATION_TIMEOUT_MESSAGE, {
              code: IMAGE_GENERATION_TIMEOUT_CODE,
            })
          : err;
        const message = error instanceof Error ? error.message : 'Unknown error';
        updateJob(jobId, { status: 'failed', errorMessage: message });
        throw error;
      } finally {
        clearTimeout(deadlineTimer);
      }
    },
    [addJob, updateJob],
  );

  const startVideo = useCallback(
    async (prompt: string, options: GenerateVideoOptions = {}): Promise<StartedVideoGeneration> => {
      const jobId = crypto.randomUUID();
      addJob({
        id: jobId,
        type: 'video',
        prompt,
        status: 'generating',
        ...(options.provider ? { provider: options.provider } : {}),
        createdAt: new Date().toISOString(),
      });

      try {
        const started = await startVideoGeneration({
          prompt,
          ...(options.durationSecs !== undefined ? { duration_secs: options.durationSecs } : {}),
          ...(options.resolution ? { resolution: options.resolution } : {}),
          ...(options.aspectRatio ? { aspect_ratio: options.aspectRatio } : {}),
          ...(options.provider ? { provider: options.provider } : {}),
          ...(options.modelId ? { model: options.modelId } : {}),
          ...(options.conversationId ? { conversation_id: options.conversationId } : {}),
          ...(options.assistantMessageId
            ? { assistant_message_id: options.assistantMessageId }
            : {}),
        }).catch((err: unknown) => {
          throw toMediaGenerationError(err);
        });

        const catalogModel = getModelMetadataById(started.model);
        const expectedProvider =
          catalogModel?.provider === 'open_router' ? 'openrouter' : catalogModel?.provider;
        if (
          !isExecutableVideoModel(catalogModel) ||
          (started.provider !== 'google' &&
            started.provider !== 'runway' &&
            started.provider !== 'openrouter') ||
          expectedProvider !== started.provider
        ) {
          throw new Error('Video response did not include valid canonical model provenance');
        }
        return {
          taskId: started.task_id,
          provider: started.provider,
          model: catalogModel.id,
          status: started.status,
          estimatedDurationSecs: started.estimated_duration_secs,
          localJobId: jobId,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        updateJob(jobId, { status: 'failed', errorMessage: message });
        throw err;
      }
    },
    [addJob, updateJob],
  );

  const watchVideo = useCallback(
    async (
      taskId: string,
      options: { localJobId?: string; timeoutMs?: number } = {},
    ): Promise<VideoWatchResult> => {
      const localJobId = options.localJobId ?? taskId;
      const deadline = Date.now() + (options.timeoutMs ?? VIDEO_POLL_TIMEOUT_MS);
      let lastStatus: 'queued' | 'processing' = 'queued';
      let lastProgress: number | undefined;

      for (;;) {
        await sleep(VIDEO_POLL_INTERVAL_MS);
        const status = await getVideoStatus(taskId).catch((err: unknown) => {
          throw toMediaGenerationError(err);
        });

        if (status.status === 'completed') {
          if (!status.video_url) throw new Error('Video finished with no URL');
          const result: CompletedVideoGeneration = {
            status: 'completed',
            taskId,
            videoUrl: status.video_url,
            ...(status.thumbnail_url ? { thumbnailUrl: status.thumbnail_url } : {}),
          };
          updateJob(localJobId, {
            status: 'completed',
            resultUrl: result.videoUrl,
            ...(result.thumbnailUrl ? { thumbnailUrl: result.thumbnailUrl } : {}),
            completedAt: new Date().toISOString(),
          });
          return result;
        }
        if (status.status === 'failed' || status.status === 'timeout') {
          const message = status.error || `Video generation ${status.status}`;
          updateJob(localJobId, { status: 'failed', errorMessage: message });
          return { status: 'failed', taskId, error: message };
        }
        lastStatus = status.status;
        lastProgress = status.progress;
        if (Date.now() >= deadline) {
          return {
            status: 'pending',
            taskId,
            taskStatus: lastStatus,
            ...(lastProgress === undefined ? {} : { progress: lastProgress }),
          };
        }
      }
    },
    [updateJob],
  );

  const generateVideo = useCallback(
    async (prompt: string, options: GenerateVideoOptions = {}): Promise<VideoWatchResult> => {
      const started = await startVideo(prompt, options);
      return watchVideo(started.taskId, { localJobId: started.localJobId });
    },
    [startVideo, watchVideo],
  );

  return {
    generateImage,
    generateVideo,
    startVideoGeneration: startVideo,
    watchVideoGeneration: watchVideo,
  };
}

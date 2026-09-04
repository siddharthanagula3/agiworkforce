import * as Crypto from 'expo-crypto';

import { api } from '@/services/api';
import { resolveGeneratedVideoUri } from './videoUri';
import { createManagedMediaIdempotencyKey } from '@agiworkforce/utils/managed-media-idempotency';
import type { ManagedMediaVideoGenerationRequest } from '@agiworkforce/cloud-contracts';

export type VideoGenRequest = ManagedMediaVideoGenerationRequest;

export interface VideoGenStartResponse {
  success?: boolean;
  task_id: string;
  status: 'queued' | 'processing';
  provider?: string;
  model?: string;
  estimated_duration_secs?: number;
}

export interface VideoGenStatusResponse {
  success?: boolean;
  task_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'timeout';
  video_url?: string;
  thumbnail_url?: string;
  progress?: number;
  error?: string;
}

export interface GeneratedVideo {
  videoUrl: string;
  thumbnailUrl?: string;
}

export const VIDEO_POLL_INTERVAL_MS = 5_000;
export const VIDEO_POLL_TIMEOUT_MS = 5 * 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a video generation task.
 *
 * `Idempotency-Key` is REQUIRED by `/api/media/video/generate`, the route calls
 * `parseManagedUsageIdempotencyKey` before doing any work. The key is derived
 * ONCE per user action so a transport retry settles the same task rather than
 * billing a second generation.
 *
 * @throws {Error} On network or server errors.
 */
export async function startVideoGeneration(
  request: VideoGenRequest,
  options: { operationId?: string } = {},
): Promise<VideoGenStartResponse> {
  if (!request.prompt.trim()) {
    throw new Error('Video generation requires a non-empty prompt');
  }

  const idempotencyKey = createManagedMediaIdempotencyKey({
    surface: 'mobile',
    operation: 'video',
    operationId: options.operationId ?? Crypto.randomUUID(),
  });

  return api.post<VideoGenStartResponse>('/api/media/video/generate', request, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

export async function getVideoStatus(taskId: string): Promise<VideoGenStatusResponse> {
  return api.get<VideoGenStatusResponse>(
    `/api/media/video/status?task_id=${encodeURIComponent(taskId)}`,
  );
}

export interface VideoGenCancelResponse {
  success?: boolean;
  task_id: string;
  status: VideoGenStatusResponse['status'];
  cancel_requested?: boolean;
  provider_cancellation?: string;
  message?: string;
}

export async function cancelVideoGeneration(taskId: string): Promise<VideoGenCancelResponse> {
  return api.post<VideoGenCancelResponse>('/api/media/video/cancel', { task_id: taskId });
}

export interface GenerateVideoOptions {
  operationId?: string;
  onTaskCreated?: (taskId: string) => void;
  onProgress?: (progress: number | undefined, status: VideoGenStatusResponse['status']) => void;
  shouldCancel?: () => boolean;
}

export async function generateVideo(
  request: VideoGenRequest,
  options: GenerateVideoOptions = {},
): Promise<GeneratedVideo> {
  const started = await startVideoGeneration(
    request,
    options.operationId ? { operationId: options.operationId } : {},
  );
  options.onTaskCreated?.(started.task_id);

  const deadline = Date.now() + VIDEO_POLL_TIMEOUT_MS;
  for (;;) {
    if (options.shouldCancel?.()) {
      throw new Error('Video generation was cancelled');
    }
    await sleep(VIDEO_POLL_INTERVAL_MS);

    const status = await getVideoStatus(started.task_id);
    options.onProgress?.(status.progress, status.status);

    if (status.status === 'completed') {
      if (!status.video_url) throw new Error('Video finished with no URL');
      const videoUrl = resolveGeneratedVideoUri(status.video_url);
      if (!videoUrl) throw new Error('Video finished with an address this app cannot open');
      return {
        videoUrl,
        ...(status.thumbnail_url ? { thumbnailUrl: status.thumbnail_url } : {}),
      };
    }
    if (status.status === 'failed' || status.status === 'timeout') {
      throw new Error(status.error || `Video generation ${status.status}`);
    }
    if (Date.now() >= deadline) {
      throw new Error('Video generation timed out. The task may still finish; try again.');
    }
  }
}

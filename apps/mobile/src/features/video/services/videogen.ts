/**
 * Video Generation Service
 *
 * Video generation is ASYNCHRONOUS, unlike image generation: the POST creates a
 * provider task and returns a `task_id`, and the caller polls
 * `GET /api/media/video/status` until the provider finishes. This mirrors
 * `apps/web/lib/hooks/useMediaGeneration.ts`, which is the reference
 * implementation for the same two routes.
 *
 * The set of supported video models is owned by the canonical model catalog
 * (`packages/contracts/types/src/models.json`) and resolved server-side;
 * `request.model` is an optional catalog id the route validates. No model id is
 * pinned here.
 */

import * as Crypto from 'expo-crypto';

import { api } from '@/services/api';
// Deep subpath, NOT the '@agiworkforce/utils' barrel — see the same note in
// imagegen.ts. The barrel pulls in 'node:path' via pathContainment.ts and
// breaks the Metro bundle.
import { createManagedMediaIdempotencyKey } from '@agiworkforce/utils/managed-media-idempotency';
import type { ManagedMediaVideoGenerationRequest } from '@agiworkforce/cloud-contracts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Canonical Web/Mobile/Desktop managed-media request; never redeclare it per surface. */
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

/**
 * Poll cadence for `/api/media/video/status`. The route's own doc comment
 * specifies "every 3–5 seconds … maximum poll window: 5 minutes"; these are that
 * contract, not invented numbers.
 */
export const VIDEO_POLL_INTERVAL_MS = 5_000;
export const VIDEO_POLL_TIMEOUT_MS = 5 * 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

/**
 * Create a video generation task.
 *
 * `Idempotency-Key` is REQUIRED by `/api/media/video/generate` — the route calls
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

/** Read the current state of a video task. */
export async function getVideoStatus(taskId: string): Promise<VideoGenStatusResponse> {
  return api.get<VideoGenStatusResponse>(
    `/api/media/video/status?task_id=${encodeURIComponent(taskId)}`,
  );
}

export interface GenerateVideoOptions {
  operationId?: string;
  /** Progress callback for the in-flight UI, 0..100 when the provider reports it. */
  onProgress?: (progress: number | undefined, status: VideoGenStatusResponse['status']) => void;
  /** Aborts polling when it returns true — e.g. the user left the conversation. */
  shouldCancel?: () => boolean;
}

/**
 * Start a video task and resolve only once a URL exists (or it fails/times out).
 *
 * The promise deliberately stays pending for the whole provider wait so the
 * caller can hold its message in an in-flight state for the duration, which is
 * what drives the generating placeholder in the transcript.
 */
export async function generateVideo(
  request: VideoGenRequest,
  options: GenerateVideoOptions = {},
): Promise<GeneratedVideo> {
  const started = await startVideoGeneration(
    request,
    options.operationId ? { operationId: options.operationId } : {},
  );

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
      return {
        videoUrl: status.video_url,
        ...(status.thumbnail_url ? { thumbnailUrl: status.thumbnail_url } : {}),
      };
    }
    if (status.status === 'failed' || status.status === 'timeout') {
      throw new Error(status.error || `Video generation ${status.status}`);
    }
    // The deadline check comes AFTER the terminal checks so a task that finished
    // on the very last poll is returned rather than reported as a timeout.
    if (Date.now() >= deadline) {
      throw new Error('Video generation timed out. The task may still finish; try again.');
    }
  }
}

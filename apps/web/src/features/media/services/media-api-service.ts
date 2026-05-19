/**
 * Media API Service
 * Handles real API calls to /api/media/image/generate and /api/media/video/generate.
 */

import { createClient } from '@/utils/supabase/client';

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
  cost_estimate: number;
  latency_ms: number;
  error?: string;
}

export interface VideoGenerationRequest {
  prompt: string;
  duration_secs?: number;
  resolution?: '720p' | '1080p' | '4k';
  provider?: 'runway' | 'google';
}

export interface VideoGenerationResponse {
  success: boolean;
  task_id: string;
  status: 'queued' | 'processing';
  provider: string;
  estimated_duration_secs: number;
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

async function getAuthToken(): Promise<string> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated. Please sign in to continue.');
  }
  return session.access_token;
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
  const token = await getAuthToken();

  const response = await fetch('/api/media/image/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
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
 * Start video generation via /api/media/video/generate
 */
export async function generateVideo(
  request: VideoGenerationRequest,
): Promise<VideoGenerationResponse> {
  const token = await getAuthToken();

  const response = await fetch('/api/media/video/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(data.error || data.message || `Video generation failed (${response.status})`);
  }

  return (await response.json()) as VideoGenerationResponse;
}

/**
 * Poll video generation status via /api/media/video/status
 */
export async function getVideoStatus(taskId: string): Promise<VideoStatusResponse> {
  const token = await getAuthToken();

  const response = await fetch(`/api/media/video/status?task_id=${encodeURIComponent(taskId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(
      data.error || data.message || `Failed to get video status (${response.status})`,
    );
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

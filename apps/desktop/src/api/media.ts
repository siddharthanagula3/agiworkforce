import { invoke } from '@tauri-apps/api/core';
import type {
  GeneratedImageResult,
  ImageGenerationPayload,
  VideoGenerationPayload,
  VideoGenerationResult,
} from '../types/media';

interface BackendImage {
  url?: string;
  b64_json?: string;
}

interface BackendImageResponse {
  images: BackendImage[];
  provider: string;
  model?: string;
  created_at: number;
  revised_prompt?: string;
  cost_estimate?: number;
  latency_ms: number;
}

interface BackendVideoResponse {
  id: string;
  status: string;
  video_url?: string;
  thumbnail_url?: string;
  duration_secs?: number;
  cost_estimate?: number;
  latency_ms: number;
}

function toDataUrl(base64: string) {
  if (base64.startsWith('data:')) return base64;
  return `data:image/png;base64,${base64}`;
}

export async function generateImage(
  payload: ImageGenerationPayload,
): Promise<GeneratedImageResult[]> {
  const response = await invoke<BackendImageResponse>('media_generate_image', {
    request: {
      prompt: payload.prompt,
      negativePrompt: payload.negativePrompt,
      provider: payload.provider,
      model: payload.model,
      size: payload.size,
      quality: payload.quality,
      style: payload.style,
      n: payload.count,
    },
  });

  return (response.images || []).map((img) => ({
    id: crypto.randomUUID(),
    url: img.url,
    base64: img.b64_json ? toDataUrl(img.b64_json) : undefined,
    provider: response.provider,
    model: response.model,
    createdAt: response.created_at,
    revisedPrompt: response.revised_prompt,
    costEstimate: response.cost_estimate,
    latencyMs: response.latency_ms,
  }));
}

export async function generateVideo(
  payload: VideoGenerationPayload,
): Promise<VideoGenerationResult> {
  const response = await invoke<BackendVideoResponse>('media_generate_video', {
    request: {
      prompt: payload.prompt,
      negativePrompt: payload.negativePrompt,
      durationSecs: payload.durationSecs,
      resolution: payload.resolution,
      style: payload.style,
      model: payload.model,
      plan: payload.plan,
    },
  });

  return {
    id: response.id,
    status: response.status,
    videoUrl: response.video_url,
    thumbnailUrl: response.thumbnail_url,
    durationSecs: response.duration_secs,
    costEstimate: response.cost_estimate,
    latencyMs: response.latency_ms,
    provider: 'veo-3.1',
    model: payload.model,
  };
}

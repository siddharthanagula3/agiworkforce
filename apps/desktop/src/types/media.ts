export type ImageProviderId =
  | 'google_imagen'
  | 'google_imagen_lite'
  | 'dalle'
  | 'stable_diffusion'
  | 'midjourney';

export type ImageSizeId = 'small' | 'medium' | 'large' | 'wide' | 'portrait';
export type ImageQualityId = 'standard' | 'hd' | 'premium';

export interface ImageGenerationPayload {
  prompt: string;
  negativePrompt?: string;
  style?: string;
  size?: ImageSizeId;
  quality?: ImageQualityId;
  provider: ImageProviderId;
  model?: string;
  count?: number;
}

export interface GeneratedImageResult {
  id: string;
  url?: string;
  base64?: string;
  provider: string;
  model?: string;
  createdAt: number;
  revisedPrompt?: string;
  costEstimate?: number;
  latencyMs?: number;
}

export type VideoResolutionId = '720p' | '1080p' | '4k';

export interface VideoGenerationPayload {
  prompt: string;
  negativePrompt?: string;
  durationSecs?: number;
  resolution?: VideoResolutionId;
  style?: string;
  model?: string;
  plan?: string;
}

export interface VideoGenerationResult {
  id: string;
  status: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  durationSecs?: number;
  costEstimate?: number;
  latencyMs?: number;
  provider: string;
  model?: string;
}

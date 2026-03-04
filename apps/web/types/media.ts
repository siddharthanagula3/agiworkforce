/**
 * Media generation types for the web app
 * Types for image and video generation providers and options
 */

export type ImageProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'stability'
  | 'replicate'
  | 'fal'
  | 'ideogram'
  | 'black-forest-labs';

export type ImageQualityId = 'standard' | 'hd' | 'ultra';

export type ImageSizeId =
  | '256x256'
  | '512x512'
  | '1024x1024'
  | '1024x1792'
  | '1792x1024'
  | '1280x720'
  | '1920x1080';

export type VideoResolutionId = '480p' | '720p' | '1080p' | '4k';

export interface ImageGenerationRequest {
  prompt: string;
  provider: ImageProviderId;
  model?: string;
  quality?: ImageQualityId;
  size?: ImageSizeId;
  negativePrompt?: string;
  numImages?: number;
  seed?: number;
}

export interface VideoGenerationRequest {
  prompt: string;
  provider: string;
  model?: string;
  resolution?: VideoResolutionId;
  duration?: number;
  fps?: number;
  negativePrompt?: string;
}

export interface GeneratedMedia {
  id: string;
  type: 'image' | 'video';
  url: string;
  thumbnailUrl?: string;
  prompt: string;
  provider: string;
  model?: string;
  width?: number;
  height?: number;
  size?: number;
  mimeType?: string;
  createdAt: Date;
}

export interface MediaGenerationError {
  code: string;
  message: string;
  provider?: string;
}

export const _stub = true;
export default {};

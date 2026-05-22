/**
 * apps/web/features/media - public API barrel
 *
 * Media generation API service: image generation (Google/OpenAI/Stability),
 * video generation (Runway/Google), and video status polling.
 * Calls /api/media/image/generate and /api/media/video/* endpoints.
 *
 * Canonical Web media feature.
 */

export {
  generateImages,
  generateVideo,
  getVideoStatus,
  getImageDisplayUrl,
} from './services/media-api-service';
export type {
  GeneratedImage,
  ImageGenerationRequest,
  ImageGenerationResponse,
  VideoGenerationRequest,
  VideoGenerationResponse,
  VideoStatusResponse,
} from './services/media-api-service';

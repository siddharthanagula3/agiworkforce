/**
 * @deprecated Barrel re-export — file moved to src/features/media/services/media-api-service.ts
 * This file exists to preserve the public import path during Phase 5 migration.
 * Do not add new code here. Import from src/features/media/ directly for new code.
 */
export {
  generateImages,
  generateVideo,
  getVideoStatus,
  getImageDisplayUrl,
} from '../../../src/features/media/services/media-api-service';
export type {
  GeneratedImage,
  ImageGenerationRequest,
  ImageGenerationResponse,
  VideoGenerationRequest,
  VideoGenerationResponse,
  VideoStatusResponse,
} from '../../../src/features/media/services/media-api-service';

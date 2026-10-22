import {
  MANAGED_MEDIA_IMAGE_REF_MAX_BYTES,
  managedMediaVideoInputImageLimit,
  type ManagedMediaModelAdmission,
} from '@agiworkforce/cloud-contracts';
import { getModelMetadataById } from '@agiworkforce/types';
import type { VideoInputImages } from '@features/media/services/media-api-service';
import {
  readImageFileAsBase64,
  readReferenceImageAsBase64,
} from '../../lib/imageGenerationOptions';

export type VideoInputKind = 'first_frame' | 'reference';

const VIDEO_INPUT_IMAGE_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

export function isVideoInputImage(file: Pick<File, 'type'>): boolean {
  return VIDEO_INPUT_IMAGE_TYPES.has(file.type);
}

export function videoInputImageLimit(
  admission: Pick<ManagedMediaModelAdmission, 'state' | 'provider'> | undefined,
  modelId: string,
): number {
  if (admission?.state !== 'enabled') return 0;
  return managedMediaVideoInputImageLimit(admission.provider, getModelMetadataById(modelId));
}

export function videoInputKindFor(count: number, preferred: VideoInputKind): VideoInputKind {
  return count > 1 ? 'reference' : preferred;
}

export async function readVideoInputImages(
  files: readonly File[],
  kind: VideoInputKind,
): Promise<VideoInputImages> {
  if (kind === 'first_frame') {
    const [file] = files;
    if (!file) throw new Error('No image to use as the first frame.');
    const imageBase64 =
      file.size <= MANAGED_MEDIA_IMAGE_REF_MAX_BYTES
        ? await readImageFileAsBase64(file)
        : await readReferenceImageAsBase64(file);
    return { kind, imageBase64 };
  }
  return { kind, imagesBase64: await Promise.all(files.map(readReferenceImageAsBase64)) };
}

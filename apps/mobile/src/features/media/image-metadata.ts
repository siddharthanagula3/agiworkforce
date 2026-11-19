import type * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import { stripImageMetadata, type ImageMetadataFormat } from '@agiworkforce/utils';

export const PICTURE_METADATA_RECOVERY_MESSAGE =
  'This photo’s location data couldn’t be removed, so save a copy from Photos and attach that.';

const FORMAT_EXTENSION: Readonly<Record<ImageMetadataFormat, string>> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  gif: 'gif',
};

export class PictureMetadataError extends Error {
  constructor(fileName: string) {
    super(
      `"${fileName}" wasn’t attached because its location data couldn’t be removed; save a copy from Photos instead.`,
    );
    this.name = 'PictureMetadataError';
  }
}

/**
 * The picker's own copy can still carry the camera's GPS and model: Android
 * writes them back after compressing. What is uploaded is a stripped copy.
 */
export async function withoutPictureMetadata(
  asset: ImagePicker.ImagePickerAsset,
  index: number,
): Promise<ImagePicker.ImagePickerAsset> {
  const name = asset.fileName?.trim() || 'photo';
  let source: Uint8Array;
  try {
    source = await new File(asset.uri).bytes();
  } catch {
    throw new PictureMetadataError(name);
  }

  const result = stripImageMetadata(source);
  if (result.status !== 'stripped') throw new PictureMetadataError(name);

  const copy = new File(
    Paths.cache,
    `attachment-${Date.now()}-${index}.${FORMAT_EXTENSION[result.format]}`,
  );
  copy.create({ overwrite: true });
  copy.write(result.bytes);
  return { ...asset, uri: copy.uri, fileSize: result.bytes.length, exif: null };
}

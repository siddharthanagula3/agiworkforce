import type * as ImagePicker from 'expo-image-picker';
import {
  EncodingType,
  cacheDirectory,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import { stripImageMetadata, type ImageMetadataFormat } from '@agiworkforce/utils';

const BASE64_CHUNK = 0x2000;

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

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    const chunk = bytes.subarray(offset, offset + BASE64_CHUNK);
    binary += String.fromCharCode(...Array.from(chunk));
  }
  return btoa(binary);
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
  let source: string;
  try {
    source = await readAsStringAsync(asset.uri, { encoding: EncodingType.Base64 });
  } catch {
    throw new PictureMetadataError(name);
  }

  const result = stripImageMetadata(base64ToBytes(source));
  if (result.status !== 'stripped' || !cacheDirectory) throw new PictureMetadataError(name);

  const uri = `${cacheDirectory}attachment-${Date.now()}-${index}.${FORMAT_EXTENSION[result.format]}`;
  await writeAsStringAsync(uri, bytesToBase64(result.bytes), { encoding: EncodingType.Base64 });
  return { ...asset, uri, fileSize: result.bytes.length, exif: null };
}

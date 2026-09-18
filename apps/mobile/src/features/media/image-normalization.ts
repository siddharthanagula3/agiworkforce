import type * as ImagePicker from 'expo-image-picker';

export const IMAGE_CAPTURE_QUALITY = 0.85;

export const HEIC_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

const EXTENSION_MIME_TYPE: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
};

const MIME_TYPE_EXTENSION: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/avif': 'avif',
};

const DEFAULT_IMAGE_MIME_TYPE = 'image/jpeg';

export interface PickedImageAsset {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  width?: number;
  height?: number;
  fileSize?: number;
}

// `compatible` makes the iOS picker hand back a transcoded JPEG rather than the
// library's HEIC, which the upload route refuses for chat attachments.
export const COMPATIBLE_ASSET_REPRESENTATION =
  'compatible' as ImagePicker.UIImagePickerPreferredAssetRepresentationMode;

export const SAFE_IMAGE_PICKER_OPTIONS = {
  quality: IMAGE_CAPTURE_QUALITY,
  exif: false,
  preferredAssetRepresentationMode: COMPATIBLE_ASSET_REPRESENTATION,
} as const;

export function extensionOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const withoutQuery = value.split(/[?#]/)[0] ?? '';
  const match = /\.([A-Za-z0-9]+)$/.exec(withoutQuery);
  return match?.[1]?.toLowerCase() ?? null;
}

export function isHeicImage(
  mimeType: string | null | undefined,
  fileName?: string | null,
): boolean {
  if (mimeType && HEIC_MIME_TYPES.has(mimeType.toLowerCase())) return true;
  const extension = extensionOf(fileName);
  return extension === 'heic' || extension === 'heif';
}

export function imageMimeTypeFor(asset: PickedImageAsset): string {
  const declared = asset.mimeType?.toLowerCase().trim();
  if (declared && declared.startsWith('image/')) return declared;
  const extension = extensionOf(asset.fileName) ?? extensionOf(asset.uri);
  if (extension && EXTENSION_MIME_TYPE[extension]) return EXTENSION_MIME_TYPE[extension];
  return DEFAULT_IMAGE_MIME_TYPE;
}

export function imageFileNameFor(asset: PickedImageAsset, fallbackStem: string): string {
  const named = asset.fileName?.trim();
  if (named) return named;
  const mimeType = imageMimeTypeFor(asset);
  const extension =
    extensionOf(asset.uri) ??
    MIME_TYPE_EXTENSION[mimeType] ??
    MIME_TYPE_EXTENSION[DEFAULT_IMAGE_MIME_TYPE]!;
  return `${fallbackStem}.${extension}`;
}

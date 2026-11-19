import 'server-only';

import sharp, { type FormatEnum } from 'sharp';

export const LIBRARY_THUMBNAIL_CONTENT_TYPE = 'image/webp';
const LIBRARY_THUMBNAIL_EDGE_PIXELS = 640;
const LIBRARY_THUMBNAIL_QUALITY = 80;
export const LIBRARY_THUMBNAIL_SOURCE_MAX_BYTES = 30 * 1024 * 1024;
export const LIBRARY_THUMBNAIL_SOURCE_MAX_PIXELS = 8192 * 8192;

const THUMBNAIL_SOURCE_FORMATS: ReadonlySet<keyof FormatEnum> = new Set([
  'jpeg',
  'png',
  'webp',
  'gif',
]);

const THUMBNAIL_SOURCE_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export function hasLibraryThumbnail(asset: {
  mimeType: string;
  byteSize: number | null;
  deletedAt: string | null;
}): boolean {
  return (
    asset.deletedAt === null &&
    THUMBNAIL_SOURCE_TYPES.has(asset.mimeType.toLowerCase()) &&
    asset.byteSize !== null &&
    asset.byteSize > 0 &&
    asset.byteSize <= LIBRARY_THUMBNAIL_SOURCE_MAX_BYTES
  );
}

export function libraryThumbnailPath(assetId: string): string {
  return `/api/files/${assetId}/thumbnail`;
}

export class LibraryThumbnailSourceError extends Error {
  constructor(format: string) {
    super(`Library thumbnail source is not a supported picture (${format})`);
    this.name = 'LibraryThumbnailSourceError';
  }
}

export async function renderLibraryThumbnail(source: Buffer): Promise<Buffer> {
  const input = {
    animated: false,
    autoOrient: true,
    limitInputPixels: LIBRARY_THUMBNAIL_SOURCE_MAX_PIXELS,
  } as const;
  const { format } = await sharp(source, input).metadata();
  if (!THUMBNAIL_SOURCE_FORMATS.has(format)) throw new LibraryThumbnailSourceError(format);
  return sharp(source, input)
    .resize({
      width: LIBRARY_THUMBNAIL_EDGE_PIXELS,
      height: LIBRARY_THUMBNAIL_EDGE_PIXELS,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: LIBRARY_THUMBNAIL_QUALITY })
    .toBuffer();
}

import { z } from 'zod';

const LIBRARY_THUMBNAIL_ASSET_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const LibraryThumbnailPathParamsSchema = z.object({
  id: z.string().regex(LIBRARY_THUMBNAIL_ASSET_ID_PATTERN),
});
export type LibraryThumbnailPathParams = z.infer<typeof LibraryThumbnailPathParamsSchema>;

export function libraryThumbnailPath(assetId: string): string {
  return `/api/files/${encodeURIComponent(assetId)}/thumbnail`;
}

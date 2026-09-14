import {
  LIBRARY_DEFAULT_PAGE_SIZE,
  LibraryListResponseSchema,
  type LibraryItem,
} from '@agiworkforce/cloud-contracts';
import { api } from '@/services/api';

export type LibraryAssetKind = 'image' | 'video' | 'document';

export interface LibraryAsset {
  id: string;
  kind: LibraryAssetKind;
  fileName: string;
  mimeType: string;
  uri: string;
  byteCount: number | null;
  prompt: string | null;
  createdAt: string;
  sourceLabel: string;
}

export interface LibraryPage {
  assets: LibraryAsset[];
  hasMore: boolean;
  nextOffset: number | null;
}

export const LIBRARY_PAGE_SIZE = LIBRARY_DEFAULT_PAGE_SIZE;

export function libraryAssetKind(item: LibraryItem): LibraryAssetKind {
  const mimeType = item.mime_type.toLowerCase();
  if (item.kind === 'image' || mimeType.startsWith('image/')) return 'image';
  if (item.kind === 'video' || mimeType.startsWith('video/')) return 'video';
  return 'document';
}

export function mapLibraryItem(item: LibraryItem): LibraryAsset {
  return {
    id: item.id,
    kind: libraryAssetKind(item),
    fileName: item.file_name,
    mimeType: item.mime_type,
    uri: item.uri,
    byteCount: item.byte_count,
    prompt: item.prompt,
    createdAt: item.created_at,
    sourceLabel:
      item.model ?? item.source_surface ?? (item.origin === 'uploaded' ? 'Upload' : 'Generated'),
  };
}

export function libraryListPath(input: {
  offset?: number;
  limit?: number;
  search?: string;
}): string {
  const params = new URLSearchParams();
  if (input.search?.trim()) params.set('q', input.search.trim());
  params.set('limit', String(input.limit ?? LIBRARY_PAGE_SIZE));
  params.set('offset', String(input.offset ?? 0));
  params.set('sort', 'modified');
  return `/api/library?${params.toString()}`;
}

export async function fetchLibraryPage(input: {
  offset?: number;
  limit?: number;
  search?: string;
}): Promise<LibraryPage> {
  const body = await api.get<unknown>(libraryListPath(input));
  const parsed = LibraryListResponseSchema.safeParse(body);
  if (!parsed.success) throw new Error('The Library returned an unreadable response.');
  return {
    assets: parsed.data.items.map(mapLibraryItem),
    hasMore: parsed.data.has_more,
    nextOffset: parsed.data.next_offset,
  };
}

export async function deleteLibraryAsset(id: string): Promise<void> {
  await api.delete<unknown>(`/api/media?id=${encodeURIComponent(id)}`);
}

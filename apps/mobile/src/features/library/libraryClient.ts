import {
  LIBRARY_DEFAULT_PAGE_SIZE,
  LIBRARY_DEFAULT_SORT,
  LibraryListResponseSchema,
  LibraryMediaDeleteResponseSchema,
  MediaJobListResponseSchema,
  type LibraryItem,
  type LibraryKind,
  type LibraryOrigin,
  type LibrarySort,
  type MediaJobEntry,
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
  eraseAfter: string | null;
  model: string | null;
  conversationId: string | null;
}

export interface LibraryPage {
  assets: LibraryAsset[];
  hasMore: boolean;
  nextOffset: number | null;
  storageUsedBytes?: number;
  storageLimitBytes?: number;
}

export interface LibraryScope {
  origin?: LibraryOrigin;
  kind?: LibraryKind;
  deleted?: boolean;
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
    eraseAfter: item.erase_after ?? null,
    model: item.model ?? null,
    conversationId: item.conversation_id ?? null,
  };
}

export function libraryListPath(
  input: {
    offset?: number;
    limit?: number;
    search?: string;
    sort?: LibrarySort;
  } & LibraryScope,
): string {
  const params = new URLSearchParams();
  if (input.search?.trim()) params.set('q', input.search.trim());
  if (input.origin) params.set('origin', input.origin);
  if (input.kind) params.set('kind', input.kind);
  if (input.deleted) params.set('deleted', 'true');
  params.set('limit', String(input.limit ?? LIBRARY_PAGE_SIZE));
  params.set('offset', String(input.offset ?? 0));
  params.set('sort', input.sort ?? LIBRARY_DEFAULT_SORT);
  return `/api/library?${params.toString()}`;
}

export async function fetchLibraryPage(
  input: {
    offset?: number;
    limit?: number;
    search?: string;
    sort?: LibrarySort;
  } & LibraryScope,
): Promise<LibraryPage> {
  const body = await api.get<unknown>(libraryListPath(input));
  const parsed = LibraryListResponseSchema.safeParse(body);
  if (!parsed.success) throw new Error('The Library returned an unreadable response.');
  if (
    parsed.data.has_more &&
    (parsed.data.next_offset === null || parsed.data.next_offset <= (input.offset ?? 0))
  )
    throw new Error('The Library returned an unreadable response.');
  return {
    assets: parsed.data.items.map(mapLibraryItem),
    hasMore: parsed.data.has_more,
    nextOffset: parsed.data.next_offset,
    ...(parsed.data.storage_used_bytes === undefined
      ? {}
      : { storageUsedBytes: parsed.data.storage_used_bytes }),
    ...(parsed.data.storage_limit_bytes === undefined
      ? {}
      : { storageLimitBytes: parsed.data.storage_limit_bytes }),
  };
}

export async function deleteLibraryAsset(id: string): Promise<void> {
  const response = LibraryMediaDeleteResponseSchema.safeParse(
    await api.delete<unknown>(`/api/media?id=${encodeURIComponent(id)}`),
  );
  if (!response.success || !response.data.success)
    throw new Error('The file could not be deleted. Try again.');
}

export async function restoreLibraryAsset(id: string): Promise<void> {
  const response = LibraryMediaDeleteResponseSchema.safeParse(
    await api.post<unknown>(`/api/media?id=${encodeURIComponent(id)}`, {}),
  );
  if (!response.success || !response.data.success)
    throw new Error('The file could not be restored. Try again.');
}

export async function permanentlyDeleteLibraryAsset(id: string): Promise<void> {
  const response = LibraryMediaDeleteResponseSchema.safeParse(
    await api.delete<unknown>(`/api/media?id=${encodeURIComponent(id)}&permanent=true`),
  );
  if (!response.success || !response.data.success)
    throw new Error('The file could not be deleted. Try again.');
}

export async function listMediaJobs(signal?: AbortSignal): Promise<MediaJobEntry[]> {
  const parsed = MediaJobListResponseSchema.safeParse(
    await api.get<unknown>('/api/media/jobs', signal ? { signal } : undefined),
  );
  if (!parsed.success) throw new Error('Your generations could not be loaded.');
  return parsed.data.jobs;
}

export async function cancelMediaJob(job: MediaJobEntry): Promise<void> {
  if (job.kind === 'video') await api.post('/api/media/video/cancel', { task_id: job.id });
  else await api.post('/api/media/image/cancel', { job_id: job.id });
}

export async function retryMediaJob(job: MediaJobEntry): Promise<void> {
  await api.post('/api/media/image/retry', { job_id: job.id });
}

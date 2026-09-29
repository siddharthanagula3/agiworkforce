import { z } from 'zod';
import { MEDIA_JOB_STATUSES, bareMediaType, documentClassFor } from '@agiworkforce/types';
import { GENERATED_FILE_SURFACES } from './generated-files';

export const LIBRARY_ORIGINS = ['generated', 'uploaded'] as const;
export type LibraryOrigin = (typeof LIBRARY_ORIGINS)[number];

export const LIBRARY_KINDS = ['image', 'video', 'file'] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

/**
 * What a Library row is, as a reader thinks of it. `kind` says how the bytes
 * are stored; a spreadsheet and a slide deck are both stored as `file` and are
 * not the same thing to anybody browsing.
 */
export const LIBRARY_RESOURCE_TYPES = [
  'document',
  'pdf',
  'spreadsheet',
  'presentation',
  'image',
  'video',
  'audio',
  'generated_file',
  'artifact',
  'other',
] as const;
export type LibraryResourceType = (typeof LIBRARY_RESOURCE_TYPES)[number];

const RESOURCE_TYPE_BY_DOCUMENT_FAMILY = {
  document: 'document',
  structured_data: 'spreadsheet',
  presentation: 'presentation',
} as const satisfies Readonly<Record<string, LibraryResourceType>>;

export interface LibraryResourceTypeInput {
  mime_type: string;
  file_name: string;
  origin?: LibraryOrigin;
  surface?: string;
}

/**
 * One classifier, so the filter, the icon and the empty state agree. An
 * artifact wins over its bytes; otherwise the declared document class does.
 */
export function libraryResourceTypeFor(item: LibraryResourceTypeInput): LibraryResourceType {
  if (item.surface === 'artifact') return 'artifact';
  const documentClass = documentClassFor(item.file_name, item.mime_type);
  if (documentClass) {
    return documentClass.id === 'pdf'
      ? 'pdf'
      : RESOURCE_TYPE_BY_DOCUMENT_FAMILY[documentClass.family];
  }
  const bare = bareMediaType(item.mime_type);
  if (bare.startsWith('image/')) return 'image';
  if (bare.startsWith('video/')) return 'video';
  if (bare.startsWith('audio/')) return 'audio';
  return item.origin === 'generated' ? 'generated_file' : 'other';
}

export const LibraryItemSchema = z.object({
  id: z.string().min(1),
  file_name: z.string().min(1),
  mime_type: z.string(),
  kind: z.string(),
  byte_count: z.number().nonnegative().nullable(),
  uri: z.string().min(1),
  surface: z.enum(GENERATED_FILE_SURFACES).default('file').catch('file'),
  previewable: z.boolean().default(false).catch(false),
  origin: z.enum(LIBRARY_ORIGINS).default('generated').catch('generated'),
  source_surface: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  prompt: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string().optional(),
  conversation_id: z.string().nullable().optional(),
  erase_after: z.string().optional(),
});
export type LibraryItem = z.infer<typeof LibraryItemSchema>;

export const LIBRARY_DEFAULT_PAGE_SIZE = 24;
export const LIBRARY_MAX_PAGE_SIZE = 100;

export const LIBRARY_SORTS = ['modified', 'oldest', 'type', 'name', 'size'] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];
export const LIBRARY_DEFAULT_SORT: LibrarySort = 'modified';

const LibraryKindListSchema = z
  .string()
  .transform((value) => value.split(',').map((entry) => entry.trim()))
  .pipe(z.array(z.enum(LIBRARY_KINDS)).min(1));

const LibraryResourceTypeListSchema = z
  .string()
  .transform((value) => value.split(',').map((entry) => entry.trim()))
  .pipe(z.array(z.enum(LIBRARY_RESOURCE_TYPES)).min(1));

export const LibraryListQuerySchema = z.object({
  kind: LibraryKindListSchema.optional(),
  resource_type: LibraryResourceTypeListSchema.optional(),
  sort: z.enum(LIBRARY_SORTS).default(LIBRARY_DEFAULT_SORT),
  surface: z.enum(GENERATED_FILE_SURFACES).optional(),
  origin: z.enum(LIBRARY_ORIGINS).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(LIBRARY_MAX_PAGE_SIZE)
    .default(LIBRARY_DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
});
export type LibraryListQuery = z.infer<typeof LibraryListQuerySchema>;

export const LibraryListResponseSchema = z.object({
  items: z.array(LibraryItemSchema),
  has_more: z.boolean(),
  next_offset: z.number().int().nonnegative().nullable(),
  storage_used_bytes: z.number().nonnegative().optional(),
  storage_limit_bytes: z.number().nonnegative().optional(),
});
export type LibraryListResponse = z.infer<typeof LibraryListResponseSchema>;

export const FILE_TEXT_PREVIEW_KINDS = ['table', 'text'] as const;

export const FileTextPreviewSchema = z.object({
  kind: z.enum(FILE_TEXT_PREVIEW_KINDS),
  text: z.string(),
  truncated: z.boolean(),
  fileName: z.string().optional(),
});
export type FileTextPreview = z.infer<typeof FileTextPreviewSchema>;

export { MEDIA_JOB_STATUSES };
export const MEDIA_JOB_KINDS = ['image', 'video'] as const;
export const MEDIA_JOB_HISTORY_MAX = 50;

export const MediaJobEntrySchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(MEDIA_JOB_KINDS),
  status: z.enum(MEDIA_JOB_STATUSES),
  prompt: z.string(),
  model: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  error: z.string().nullable(),
  retryable: z.boolean(),
  cancellable: z.boolean(),
  progress: z.number().int().min(0).max(100).nullable(),
  result_urls: z.array(z.string()),
  conversation_id: z.string().uuid().nullable(),
});
export type MediaJobEntry = z.infer<typeof MediaJobEntrySchema>;

export const MediaJobListResponseSchema = z.object({
  jobs: z.array(MediaJobEntrySchema).max(MEDIA_JOB_HISTORY_MAX),
});
export type MediaJobListResponse = z.infer<typeof MediaJobListResponseSchema>;

export const LibraryMediaDeleteResponseSchema = z.object({
  success: z.boolean(),
});

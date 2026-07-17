/**
 * Cloud contract — the `GET /api/library` listing response: the user-scoped
 * Library catalog over `media_assets` (generated images, code-interpreter
 * outputs, CSV/PDF/DOCX deliverables) that the web `/library` page browses.
 *
 * Wire conventions (match `generated-files.ts`):
 *   - snake_case field names.
 *   - `uri` is the RELATIVE same-origin authed serve route `/api/files/{id}`.
 *     Same-origin web consumes it with session cookies; desktop/mobile cloud
 *     resolve it via `resolveGeneratedFileUri` + Bearer token.
 *   - `surface`/`previewable` mirror the persisted `media_assets.metadata`
 *     classification written by `generated-file-persist.ts`. LEGACY rows
 *     (e.g. image-generation rows created before Wave A) lack them — the
 *     server maps missing surface to 'file' and missing previewable to
 *     mime-derived (image/* → true), and the schema `.catch`es keep unknown
 *     future values from dropping items.
 *   - `origin` is the coarse provenance bucket derived from
 *     `metadata.origin`: 'uploaded' when the row was cataloged by an upload
 *     flow, 'generated' otherwise. Every current writer is a generation
 *     pipeline ('e2b-execution', 'e2b-execution-result', 'code-execution',
 *     image generation) so 'uploaded' is empty today — kept in the contract
 *     so the filter UI stays honest when upload cataloging ships.
 *
 * Consumers: web `/library` page today; desktop cloud inherits via UI parity.
 */

import { z } from 'zod';
import { GENERATED_FILE_SURFACES } from './generated-files';

export const LIBRARY_ORIGINS = ['generated', 'uploaded'] as const;
export type LibraryOrigin = (typeof LIBRARY_ORIGINS)[number];

/** `media_assets.kind` values a client may filter by. */
export const LIBRARY_KINDS = ['image', 'video', 'file'] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

export const LibraryItemSchema = z.object({
  /** media_assets.id (uuid). */
  id: z.string().min(1),
  /** metadata.filename, or a server-derived fallback for legacy rows. */
  file_name: z.string().min(1),
  mime_type: z.string(),
  /** Coarse icon taxonomy: media_assets.kind ('image' | 'video' | 'file'). */
  kind: z.string(),
  byte_count: z.number().nonnegative().nullable(),
  /** Same-origin authed serve route `/api/files/{id}`. */
  uri: z.string().min(1),
  /** UI-ownership classification; legacy rows fold to 'file'. */
  surface: z.enum(GENERATED_FILE_SURFACES).default('file').catch('file'),
  previewable: z.boolean().default(false).catch(false),
  origin: z.enum(LIBRARY_ORIGINS).default('generated').catch('generated'),
  /** Provenance surface ('web' | 'desktop' | 'mobile'); null on legacy rows. */
  source_surface: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  /** Generation prompt when recorded (image generation rows). */
  prompt: z.string().nullable(),
  created_at: z.string(),
});
export type LibraryItem = z.infer<typeof LibraryItemSchema>;

export const LIBRARY_DEFAULT_PAGE_SIZE = 24;
export const LIBRARY_MAX_PAGE_SIZE = 100;

/**
 * Query parameters accepted by `GET /api/library`. Offset pagination —
 * matches the sibling `/api/chat/conversations` convention (limit+1 probe,
 * `has_more` in the response).
 */
export const LibraryListQuerySchema = z.object({
  kind: z.enum(LIBRARY_KINDS).optional(),
  surface: z.enum(GENERATED_FILE_SURFACES).optional(),
  origin: z.enum(LIBRARY_ORIGINS).optional(),
  /** Filename/prompt substring search (ILIKE — FTS is a later wave). */
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
  /** Offset for the next page; null when `has_more` is false. */
  next_offset: z.number().int().nonnegative().nullable(),
});
export type LibraryListResponse = z.infer<typeof LibraryListResponseSchema>;

/**
 * Cloud contract — the `x_generated_files` SSE delta emitted by the web tool
 * loop (`apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts`) once per
 * turn, before `[DONE]`, describing files the model created in the E2B
 * sandbox and that were persisted to the user's media library.
 *
 * Wire conventions (server contract, see
 * `apps/web/lib/server/generated-file-persist.ts` `GeneratedFileWire`):
 *   - snake_case field names.
 *   - `uri` is the durable download URL. When the file was cataloged it is
 *     the RELATIVE same-origin authed route `/api/files/{id}` — same-origin
 *     web consumes it directly with session cookies; desktop (Tauri) and
 *     mobile MUST resolve it against their cloud API base URL and attach the
 *     Bearer token when fetching (the route returns 401 unauthenticated).
 *   - `checksum_sha256` is emitted by the server but optional here so older
 *     stream shapes without it still parse.
 *
 * Consumers: mobile `chatExecutionStore` (cloud turn finalization) and
 * desktop `WebRuntime` (stream delta parsing). Both validate the delta with
 * `parseGeneratedFilesDelta` instead of hand-declaring the shape.
 */

import { z } from 'zod';
import { stripTrailingSlashes } from '@agiworkforce/types';

/**
 * Which UI surface owns a generated output. Derived DETERMINISTICALLY on the
 * server at persistence time (`apps/web/lib/server/generated-file-persist.ts`
 * `classifyGeneratedFile`) from mime + extension — clients must never
 * re-derive it.
 *
 *   - 'artifact': source-text output that renders/edits in a panel surface
 *     (html, svg, markdown, mermaid, json, code/plain text).
 *   - 'file': downloadable deliverable (xlsx, docx, pptx, pdf, csv, archives,
 *     binaries). Raster images/charts (PNG matplotlib output etc.) are
 *     'file' + `previewable: true`: like ChatGPT container-file citations and
 *     Claude file outputs they are byte deliverables the client may render
 *     inline, not editable-source artifacts — there is no source text for an
 *     artifact panel to show.
 *
 * Relationship to `kind`: `kind` is the coarse ICON taxonomy (what badge/icon
 * a card shows); `surface` is the OWNERSHIP taxonomy (which UI opens it) and
 * `previewable` the inline-render affordance. They are derived side by side
 * by the same server module and intentionally not merged — e.g. an `.svg` has
 * kind 'image' (icon) but surface 'artifact' (editable source).
 */
export const GENERATED_FILE_SURFACES = ['artifact', 'file'] as const;
export type GeneratedFileSurface = (typeof GENERATED_FILE_SURFACES)[number];

export const GeneratedFileWireSchema = z.object({
  id: z.string().min(1),
  file_name: z.string().min(1),
  mime_type: z.string(),
  /** Durable download URL. Same-origin `/api/files/{id}` when cataloged. */
  uri: z.string().min(1),
  byte_count: z.number().nonnegative(),
  /** Coarse kind for client icons: pdf | docx | xlsx | pptx | csv | json | markdown | html | image | archive | other */
  kind: z.string(),
  /** SHA-256 of the stored bytes (hash in == hash out verification). */
  checksum_sha256: z.string().optional(),
  /**
   * UI ownership classification (see `GeneratedFileSurface`). Optional with
   * default so pre-classification persisted payloads and older servers still
   * parse; `.catch` folds a future unknown surface value to the safe
   * 'file' rendering instead of dropping the whole descriptor.
   */
  surface: z.enum(GENERATED_FILE_SURFACES).default('file').catch('file'),
  /**
   * Whether the client may inline-render the bytes (raster images/charts,
   * pdf, docx/xlsx/pptx/csv with shared renderers, and all artifacts).
   * Optional-with-default for the same backward compatibility as `surface`.
   */
  previewable: z.boolean().default(false).catch(false),
});
export type GeneratedFileWire = z.infer<typeof GeneratedFileWireSchema>;

export const GeneratedFilesDeltaSchema = z.object({
  files: z.array(z.unknown()).optional(),
});

/**
 * Parse a `delta.x_generated_files` payload. Salvages per-file: invalid
 * entries are dropped (never thrown) so one malformed descriptor cannot hide
 * the rest of the turn's files. Returns `[]` for absent/malformed payloads.
 */
export function parseGeneratedFilesDelta(payload: unknown): GeneratedFileWire[] {
  const delta = GeneratedFilesDeltaSchema.safeParse(payload);
  if (!delta.success || !delta.data.files) return [];
  const out: GeneratedFileWire[] = [];
  for (const entry of delta.data.files) {
    const parsed = GeneratedFileWireSchema.safeParse(entry);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/**
 * Resolve a generated-file `uri` for a non-same-origin surface.
 *
 * - Absolute `http(s)` URIs pass through unchanged.
 * - Relative `/api/files/{id}` URIs are joined onto `apiBaseUrl`
 *   (e.g. `https://agiworkforce.com`). Trailing slash on the base and the
 *   leading slash on the uri are normalized.
 * - When `apiBaseUrl` is empty (same-origin web build) the uri is returned
 *   as-is so the browser resolves it against the current origin.
 *
 * Pure and DOM-free so mobile (React Native) and desktop share it.
 */
export function resolveGeneratedFileUri(uri: string, apiBaseUrl: string): string {
  if (/^https?:\/\//i.test(uri)) return uri;
  const base = stripTrailingSlashes(apiBaseUrl);
  if (!base) return uri;
  return uri.startsWith('/') ? `${base}${uri}` : `${base}/${uri}`;
}

/**
 * One ingestion pipeline for every surface.
 *
 * Reading text out of a file was decided twice: `apps/web/lib/server/office-
 * document-text.ts` for the web and a Rust document reader on the desktop,
 * which is why a `.pptx` a phone uploaded parsed and the same `.pptx` opened on
 * the desktop did not. The routing, the caps and the parse-status transitions
 * are the parts that must agree, so they live here; the extractors themselves
 * stay on the surface that has the decoder, and register against a route.
 */

import {
  isTextLikeFileMediaType,
  type FileParseStatus,
  type ManagedFile,
} from '@agiworkforce/types';

export const INGESTION_ROUTES = ['text', 'office', 'pdf', 'opaque'] as const;
export type IngestionRoute = (typeof INGESTION_ROUTES)[number];

const OFFICE_MEDIA_TYPES: ReadonlySet<string> = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const OFFICE_EXTENSIONS: ReadonlySet<string> = new Set(['docx', 'xlsx', 'pptx']);

/** A parsed document past this is truncated, never rejected: half a file reads. */
export const MAX_INGESTED_TEXT_CHARS = 200_000;

function bareMediaType(mediaType: string): string {
  return (mediaType.split(';')[0] ?? '').trim().toLowerCase();
}

export function ingestionRouteFor(fileName: string, mediaType: string): IngestionRoute {
  const bare = bareMediaType(mediaType);
  const extension = fileName.toLowerCase().split('.').pop() ?? '';
  if (OFFICE_MEDIA_TYPES.has(bare) || OFFICE_EXTENSIONS.has(extension)) return 'office';
  if (bare === 'application/pdf' || extension === 'pdf') return 'pdf';
  if (isTextLikeFileMediaType(bare)) return 'text';
  return 'opaque';
}

export function isIngestibleFile(file: ManagedFile): boolean {
  return ingestionRouteFor(file.name, file.mediaType) !== 'opaque';
}

export type IngestionExtractor = (file: ManagedFile) => Promise<string>;

export type IngestionExtractors = Partial<Record<IngestionRoute, IngestionExtractor>>;

export interface IngestionResult {
  file: ManagedFile;
  route: IngestionRoute;
  text: string | null;
  truncated: boolean;
  error: string | null;
}

export function truncateIngestedText(text: string): { text: string; truncated: boolean } {
  return text.length <= MAX_INGESTED_TEXT_CHARS
    ? { text, truncated: false }
    : { text: text.slice(0, MAX_INGESTED_TEXT_CHARS), truncated: true };
}

function withParseStatus(file: ManagedFile, parseStatus: FileParseStatus): ManagedFile {
  return file.parseStatus === parseStatus ? file : { ...file, parseStatus };
}

/**
 * Runs the extractor registered for the file's route and reports the outcome on
 * the file itself. A route with no extractor on this surface is `pending`, not
 * `failed`: the bytes are still parseable, just not here.
 */
export async function ingestFile(
  file: ManagedFile,
  extractors: IngestionExtractors,
): Promise<IngestionResult> {
  const route = ingestionRouteFor(file.name, file.mediaType);
  if (route === 'opaque') {
    return {
      file: withParseStatus(file, 'not_applicable'),
      route,
      text: null,
      truncated: false,
      error: null,
    };
  }

  const extractor = extractors[route];
  if (!extractor) {
    return {
      file: withParseStatus(file, 'pending'),
      route,
      text: null,
      truncated: false,
      error: null,
    };
  }

  try {
    const extracted = await extractor(file);
    const { text, truncated } = truncateIngestedText(extracted);
    return { file: withParseStatus(file, 'parsed'), route, text, truncated, error: null };
  } catch (error) {
    return {
      file: withParseStatus(file, 'failed'),
      route,
      text: null,
      truncated: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface IngestionPipeline {
  ingest: (file: ManagedFile) => Promise<IngestionResult>;
  routeFor: (fileName: string, mediaType: string) => IngestionRoute;
}

export function createIngestionPipeline(extractors: IngestionExtractors): IngestionPipeline {
  return {
    ingest: (file) => ingestFile(file, extractors),
    routeFor: ingestionRouteFor,
  };
}

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
  documentClassFor,
  DOCUMENT_EXTRACTORS,
  MAX_FILE_TEXT_CHARS,
  type FileParseStatus,
  type ManagedFile,
} from '@agiworkforce/types';

/** The decoder families, plus the one for bytes no declared class covers. */
export const INGESTION_ROUTES = [...DOCUMENT_EXTRACTORS, 'opaque'] as const;
export type IngestionRoute = (typeof INGESTION_ROUTES)[number];

/** A parsed document past this is truncated, never rejected: half a file reads. */
export const MAX_INGESTED_TEXT_CHARS = MAX_FILE_TEXT_CHARS;

/** Bytes an extractor is allowed to open, so one file cannot exhaust a worker. */
export const MAX_INGESTED_BYTES = 200 * 1024 * 1024;

/** Wall clock an extractor gets before the file is failed rather than hung on. */
export const INGESTION_TIMEOUT_MS = 60_000;

/**
 * Where a file is in ingestion. `pending` is the only state a file can leave;
 * the other three are terminal, so a file settles in exactly one of them.
 */
export const TERMINAL_PARSE_STATUSES = ['not_applicable', 'parsed', 'failed'] as const;

export function isTerminalParseStatus(status: FileParseStatus): boolean {
  return (TERMINAL_PARSE_STATUSES as readonly FileParseStatus[]).includes(status);
}

/**
 * Why a file could not be read. A reason is chosen by the pipeline, never
 * copied from a decoder, so a parser stack trace never reaches a reader.
 */
export const INGESTION_FAILURE_REASONS = [
  'corrupt',
  'encrypted',
  'too_large',
  'archive_bomb',
  'macro_present',
  'unsupported',
  'timeout',
] as const;
export type IngestionFailureReason = (typeof INGESTION_FAILURE_REASONS)[number];

const FAILURE_MESSAGES: Readonly<Record<IngestionFailureReason, string>> = {
  corrupt: 'This file could not be read. It may be damaged or incomplete.',
  encrypted: 'This file is password protected. Remove the password and upload it again.',
  too_large: 'This file is too large to read. Split it into smaller files and try again.',
  archive_bomb: 'This file expands to far more data than it declares, so it was not opened.',
  macro_present: 'This file contains macros, which are not read. Save it without macros.',
  unsupported: 'This file type cannot be read as text.',
  timeout: 'This file took too long to read and was stopped.',
};

export function ingestionFailureMessage(reason: IngestionFailureReason): string {
  return FAILURE_MESSAGES[reason];
}

/** The only error shape an extractor may use to name why it stopped. */
export class IngestionFailure extends Error {
  override readonly name = 'IngestionFailure';
  constructor(readonly reason: IngestionFailureReason) {
    super(FAILURE_MESSAGES[reason]);
  }
}

export function ingestionRouteFor(fileName: string, mediaType: string): IngestionRoute {
  return documentClassFor(fileName, mediaType)?.extractor ?? 'opaque';
}

export function isIngestibleFile(file: ManagedFile): boolean {
  return ingestionRouteFor(file.name, file.mediaType) !== 'opaque';
}

export type IngestionExtractor = (file: ManagedFile) => Promise<string>;

export type IngestionExtractors = Partial<Record<IngestionRoute, IngestionExtractor>>;

export interface IngestionFailureDetail {
  reason: IngestionFailureReason;
  message: string;
}

export interface IngestionResult {
  file: ManagedFile;
  route: IngestionRoute;
  text: string | null;
  truncated: boolean;
  failure: IngestionFailureDetail | null;
}

export interface IngestionOptions {
  maxBytes?: number;
  timeoutMs?: number;
}

export function truncateIngestedText(text: string): { text: string; truncated: boolean } {
  return text.length <= MAX_INGESTED_TEXT_CHARS
    ? { text, truncated: false }
    : { text: text.slice(0, MAX_INGESTED_TEXT_CHARS), truncated: true };
}

function withParseStatus(file: ManagedFile, parseStatus: FileParseStatus): ManagedFile {
  return file.parseStatus === parseStatus ? file : { ...file, parseStatus };
}

function failed(file: ManagedFile, route: IngestionRoute, reason: IngestionFailureReason) {
  return {
    file: withParseStatus(file, 'failed'),
    route,
    text: null,
    truncated: false,
    failure: { reason, message: FAILURE_MESSAGES[reason] },
  } satisfies IngestionResult;
}

async function runBounded(
  extractor: IngestionExtractor,
  file: ManagedFile,
  timeoutMs: number,
): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      extractor(file),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new IngestionFailure('timeout')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Runs the extractor registered for the file's route and reports the outcome on
 * the file itself. A route with no extractor on this surface is `pending`, not
 * `failed`: the bytes are still parseable, just not here.
 */
export async function ingestFile(
  file: ManagedFile,
  extractors: IngestionExtractors,
  options: IngestionOptions = {},
): Promise<IngestionResult> {
  const route = ingestionRouteFor(file.name, file.mediaType);
  if (route === 'opaque') {
    return {
      file: withParseStatus(file, 'not_applicable'),
      route,
      text: null,
      truncated: false,
      failure: null,
    };
  }

  const maxBytes = options.maxBytes ?? MAX_INGESTED_BYTES;
  if (file.byteCount > maxBytes) return failed(file, route, 'too_large');

  const extractor = extractors[route];
  if (!extractor) {
    return {
      file: withParseStatus(file, 'pending'),
      route,
      text: null,
      truncated: false,
      failure: null,
    };
  }

  try {
    const extracted = await runBounded(extractor, file, options.timeoutMs ?? INGESTION_TIMEOUT_MS);
    const { text, truncated } = truncateIngestedText(extracted);
    return { file: withParseStatus(file, 'parsed'), route, text, truncated, failure: null };
  } catch (error) {
    return failed(file, route, error instanceof IngestionFailure ? error.reason : 'corrupt');
  }
}

export interface IngestionPipeline {
  ingest: (file: ManagedFile) => Promise<IngestionResult>;
  routeFor: (fileName: string, mediaType: string) => IngestionRoute;
}

export function createIngestionPipeline(
  extractors: IngestionExtractors,
  options: IngestionOptions = {},
): IngestionPipeline {
  return {
    ingest: (file) => ingestFile(file, extractors, options),
    routeFor: ingestionRouteFor,
  };
}

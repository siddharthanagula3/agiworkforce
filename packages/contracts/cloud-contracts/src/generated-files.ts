import { z } from 'zod';
import {
  createFileReference,
  stripTrailingSlashes,
  type FileReference,
  type SourceSurface,
} from '@agiworkforce/types';

export const GENERATED_FILE_SURFACES = ['artifact', 'file'] as const;
export type GeneratedFileSurface = (typeof GENERATED_FILE_SURFACES)[number];

export const GeneratedFileWireSchema = z.object({
  id: z.string().min(1),
  file_name: z.string().min(1),
  mime_type: z.string(),
  uri: z.string().min(1),
  byte_count: z.number().nonnegative(),
  kind: z.string(),
  checksum_sha256: z.string().optional(),
  surface: z.enum(GENERATED_FILE_SURFACES).default('file').catch('file'),
  previewable: z.boolean().default(false).catch(false),
});
export type GeneratedFileWire = z.infer<typeof GeneratedFileWireSchema>;

export const GeneratedFilesDeltaSchema = z.object({
  files: z.array(z.unknown()).optional(),
});

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

export function resolveGeneratedFileUri(uri: string, apiBaseUrl: string): string {
  if (/^https?:\/\//i.test(uri)) return uri;
  const base = stripTrailingSlashes(apiBaseUrl);
  if (!base) return uri;
  return uri.startsWith('/') ? `${base}${uri}` : `${base}/${uri}`;
}

/**
 * The canonical reference to a file the model produced. A generated file is
 * never parsed back into text by the platform, so its parse status is not
 * applicable rather than pending.
 */
export function generatedFileReference(
  file: GeneratedFileWire,
  options: { apiBaseUrl?: string; sourceSurface?: SourceSurface | null } = {},
): FileReference {
  return createFileReference({
    id: file.id,
    name: file.file_name,
    mediaType: file.mime_type,
    byteCount: file.byte_count,
    uri: options.apiBaseUrl ? resolveGeneratedFileUri(file.uri, options.apiBaseUrl) : file.uri,
    origin: 'generated',
    checksumSha256: file.checksum_sha256 ?? null,
    sourceSurface: options.sourceSurface ?? null,
  });
}

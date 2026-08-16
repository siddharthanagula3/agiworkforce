
import { z } from 'zod';
import { stripTrailingSlashes } from '@agiworkforce/types';

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

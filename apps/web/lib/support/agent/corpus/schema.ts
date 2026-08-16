
import { z } from 'zod';

export const corpusChunkSchema = z
  .object({
    id: z.string().min(1),
    ordinal: z.number().int().nonnegative(),
    heading: z.string().min(1).nullable(),
    headingPath: z.string().min(1),
    text: z.string().min(1),
  })
  .strict();

export const corpusDocumentSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    title: z.string().min(1),
    path: z.string().regex(/^\/[a-z0-9/-]*$/),
    category: z.string().min(1),
    tags: z.array(z.string().min(1)).min(1),
    updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    source: z.string().min(1),
    chunks: z.array(corpusChunkSchema).min(1),
  })
  .strict();

export const corpusArtifactSchema = z
  .object({
    version: z.literal(1),
    generatedBy: z.string().min(1),
    documentCount: z.number().int().positive(),
    chunkCount: z.number().int().positive(),
    documents: z.array(corpusDocumentSchema).min(1),
  })
  .strict();

export type CorpusArtifact = z.infer<typeof corpusArtifactSchema>;

export const NON_PUBLIC_PATH_PREFIXES = [
  '/settings',
  '/admin',
  '/api',
  '/dev',
  '/debug',
  '/user',
  '/auth',
] as const;

export function isPublicCorpusPath(path: string): boolean {
  if (!path.startsWith('/')) return false;
  if (path.includes('..')) return false;
  return !NON_PUBLIC_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

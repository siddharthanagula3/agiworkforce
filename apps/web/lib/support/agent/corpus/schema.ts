import { z } from 'zod';

import {
  ALL_DOC_PLATFORMS,
  DOC_PLATFORM_LABELS,
  type DocPlatform,
} from '@/lib/support/doc-metadata';

const OPERATING_SYSTEM_LABELS = Object.freeze({
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
  ios: 'iOS',
  android: 'Android',
});

export type SupportPlatform = DocPlatform | keyof typeof OPERATING_SYSTEM_LABELS;

export const SUPPORT_PLATFORM_LABELS: Readonly<Record<SupportPlatform, string>> = Object.freeze({
  ...DOC_PLATFORM_LABELS,
  ...OPERATING_SYSTEM_LABELS,
});

export const SUPPORT_PLATFORMS = Object.freeze([
  ...ALL_DOC_PLATFORMS,
  ...(Object.keys(OPERATING_SYSTEM_LABELS) as (keyof typeof OPERATING_SYSTEM_LABELS)[]),
]) as readonly SupportPlatform[];

export function isSupportPlatform(value: string): value is SupportPlatform {
  return (SUPPORT_PLATFORMS as readonly string[]).includes(value);
}

export const supportPlatformSchema = z.string().refine(isSupportPlatform, {
  message: `platform must be one of: ${SUPPORT_PLATFORMS.join(', ')}`,
});

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
    platforms: z.array(supportPlatformSchema).min(1).optional(),
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

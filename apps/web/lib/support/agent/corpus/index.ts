
import { MARKETING, POSITIONING } from '@/lib/marketing-constants';
import type { CorpusChunk } from '../types';
import { buildStaticDataChunks } from './static-data-source';
import { corpusArtifactSchema, isPublicCorpusPath } from './schema';
import rawCorpus from '../corpus.generated.json';

const FACT_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  'MARKETING.providers.display': MARKETING.providers.display,
  'MARKETING.providers.count': String(MARKETING.providers.count),
  'MARKETING.models.display': MARKETING.models.display,
  'MARKETING.models.count': String(MARKETING.models.count),
  'MARKETING.surfaces.display': MARKETING.surfaces.display,
  'POSITIONING.trustBoundary': POSITIONING.trustBoundary,
  'POSITIONING.wedge': POSITIONING.wedge,
});

const TOKEN_PATTERN = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;

export class CorpusUnavailableError extends Error {
  constructor(reason: string) {
    super(`Support corpus unavailable: ${reason}`);
    this.name = 'CorpusUnavailableError';
  }
}

export function interpolateFacts(text: string, source: string): string {
  return text.replace(TOKEN_PATTERN, (_match, token: string) => {
    const value = FACT_TOKENS[token];
    if (value === undefined) {
      throw new CorpusUnavailableError(`unknown fact token "${token}" in ${source}`);
    }
    return value;
  });
}

function buildMarkdownChunks(): CorpusChunk[] {
  const parsed = corpusArtifactSchema.safeParse(rawCorpus);
  if (!parsed.success) {
    throw new CorpusUnavailableError(
      `corpus.generated.json failed validation: ${parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    );
  }

  const chunks: CorpusChunk[] = [];
  for (const document of parsed.data.documents) {
    if (!isPublicCorpusPath(document.path)) {
      throw new CorpusUnavailableError(
        `document "${document.id}" declares a non-public path "${document.path}"`,
      );
    }
    for (const chunk of document.chunks) {
      chunks.push({
        id: chunk.id,
        docId: document.id,
        docTitle: document.title,
        path: document.path,
        category: document.category,
        tags: Object.freeze([...document.tags]),
        heading: chunk.heading,
        headingPath: interpolateFacts(chunk.headingPath, document.id),
        text: interpolateFacts(chunk.text, document.id),
        origin: 'markdown',
      });
    }
  }
  return chunks;
}

export interface SupportCorpus {
  available: true;
  chunks: readonly CorpusChunk[];
  byId: ReadonlyMap<string, CorpusChunk>;
}

export interface UnavailableCorpus {
  available: false;
  reason: string;
}

export type CorpusLoadResult = SupportCorpus | UnavailableCorpus;

let cached: CorpusLoadResult | null = null;

function load(): CorpusLoadResult {
  try {
    const merged = [...buildMarkdownChunks(), ...buildStaticDataChunks()];

    const byId = new Map<string, CorpusChunk>();
    for (const chunk of merged) {
      if (byId.has(chunk.id)) {
        return { available: false, reason: `duplicate chunk id "${chunk.id}"` };
      }
      if (!isPublicCorpusPath(chunk.path)) {
        return { available: false, reason: `chunk "${chunk.id}" has non-public path` };
      }
      byId.set(chunk.id, Object.freeze(chunk));
    }
    if (byId.size === 0) return { available: false, reason: 'corpus is empty' };

    return { available: true, chunks: Object.freeze(merged), byId };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : 'unknown corpus load failure',
    };
  }
}

export function getSupportCorpus(): CorpusLoadResult {
  cached ??= load();
  return cached;
}

export function __resetSupportCorpusForTests(): void {
  cached = null;
}

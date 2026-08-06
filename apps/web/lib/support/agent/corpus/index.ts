/**
 * The merged, frozen support corpus.
 *
 * Two sources, both static:
 *   A. `corpus.generated.json` — built from `content/support/*.md` by
 *      `scripts/build-support-corpus.mjs` and committed, so the entire indexed
 *      surface is reviewable in one diff.
 *   B. `lib/support/static-data.ts` — the existing published FAQs and articles.
 *
 * THE INDEX CONTAINS PRODUCT DOCUMENTATION ONLY. There is no database import
 * anywhere in `lib/support/agent/**`, which makes cross-account leakage
 * structurally impossible rather than merely policed — `corpus-hygiene.test.ts`
 * asserts the absent dependency by scanning the subtree's imports.
 *
 * Load is fail-closed: a schema violation or a non-public path yields an
 * unavailable corpus, which the answer engine turns into an abstention. It never
 * degrades into answering from model priors.
 */

import { MARKETING, POSITIONING } from '@/lib/marketing-constants';
import type { CorpusChunk } from '../types';
import { buildStaticDataChunks } from './static-data-source';
import { corpusArtifactSchema, isPublicCorpusPath } from './schema';
import rawCorpus from '../corpus.generated.json';

/**
 * Facts a corpus document may interpolate with `{{TOKEN}}`. Restating counts in
 * prose is how an agent ends up citing a stale "10+ providers" long after the
 * catalogue moved; interpolating the same constants the marketing pages render
 * keeps the two in step. The map is a closed allowlist — an unknown token is a
 * load-time failure, not a silently empty string.
 */
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

/** Substitute `{{TOKEN}}` against the allowlist. Unknown token => throw. */
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

/** Memoized at module scope. Safe to call on every request. */
export function getSupportCorpus(): CorpusLoadResult {
  cached ??= load();
  return cached;
}

/** Test-only: drop the memo so a test can observe a fresh load. */
export function __resetSupportCorpusForTests(): void {
  cached = null;
}

/**
 * Retrieval over the merged support corpus.
 *
 * Exported for the escalation builder's "what the agent already tried"
 * transcript as well as for the answer engine itself.
 */

import { SITE_URL } from '@/lib/seo/site';
import type { RetrievalResult, RetrievedChunk, SupportCitation, CorpusChunk } from '../types';
import { getSupportCorpus } from '../corpus';
import { evaluateRelevanceFloor } from '../policy/relevance-floor';
import { buildBm25Index, scoreBm25, type Bm25Index } from './bm25';
import { tokenize } from './tokenize';

const DEFAULT_LIMIT = 6;
const MAX_PER_DOCUMENT = 2;
const SNIPPET_CHARS = 320;

let cachedIndex: { index: Bm25Index; chunks: readonly CorpusChunk[] } | null = null;

function getIndex(): { index: Bm25Index; chunks: readonly CorpusChunk[] } | null {
  const corpus = getSupportCorpus();
  if (!corpus.available) return null;
  if (cachedIndex && cachedIndex.chunks === corpus.chunks) return cachedIndex;

  const index = buildBm25Index(
    corpus.chunks.map((chunk) => ({
      id: chunk.id,
      text: chunk.text,
      boosted: `${chunk.headingPath} ${chunk.tags.join(' ')} ${chunk.category}`,
    })),
  );
  cachedIndex = { index, chunks: corpus.chunks };
  return cachedIndex;
}

export function __resetRetrievalIndexForTests(): void {
  cachedIndex = null;
}

export function buildCitation(chunk: CorpusChunk): SupportCitation {
  const snippet = chunk.text.replace(/\s+/g, ' ').trim();
  return {
    title: chunk.heading ? `${chunk.docTitle} — ${chunk.heading}` : chunk.docTitle,
    url: `${SITE_URL}${chunk.path}`,
    snippet: snippet.length > SNIPPET_CHARS ? `${snippet.slice(0, SNIPPET_CHARS - 1)}…` : snippet,
    docId: chunk.docId,
    chunkId: chunk.id,
  };
}

export function retrieveSupportChunks(
  query: string,
  opts: { limit?: number } = {},
): RetrievalResult {
  const queryTerms = [...new Set(tokenize(query))];
  const empty: RetrievalResult = {
    chunks: [],
    topScore: 0,
    coverage: 0,
    matchedTermCount: 0,
    queryTermCount: queryTerms.length,
    passedFloor: false,
    floorReason: 'empty_query',
  };

  const loaded = getIndex();
  if (!loaded) return { ...empty, floorReason: 'corpus_unavailable' };
  if (queryTerms.length === 0) return empty;

  const corpus = getSupportCorpus();
  if (!corpus.available) return { ...empty, floorReason: 'corpus_unavailable' };

  const hits = scoreBm25(loaded.index, query);
  if (hits.length === 0) {
    return { ...empty, floorReason: 'below_score' };
  }

  const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIMIT, 12));
  const perDocument = new Map<string, number>();
  const selected: RetrievedChunk[] = [];

  for (const hit of hits) {
    if (selected.length >= limit) break;
    const chunk = corpus.byId.get(hit.id);
    if (!chunk) continue;
    const used = perDocument.get(chunk.docId) ?? 0;
    if (used >= MAX_PER_DOCUMENT) continue;
    perDocument.set(chunk.docId, used + 1);
    selected.push({ chunk, score: hit.score, citation: buildCitation(chunk) });
  }

  const top = hits[0];
  const verdict = evaluateRelevanceFloor({
    topScore: top?.score ?? 0,
    matchedTermCount: top?.matchedTerms.length ?? 0,
    queryTermCount: queryTerms.length,
  });

  return {
    chunks: selected,
    topScore: top?.score ?? 0,
    coverage: verdict.coverage,
    matchedTermCount: top?.matchedTerms.length ?? 0,
    queryTermCount: queryTerms.length,
    passedFloor: verdict.passed && selected.length > 0,
    floorReason: verdict.reason,
  };
}

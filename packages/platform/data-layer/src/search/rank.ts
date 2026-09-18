import type { RerankOptions, RerankProvider, SearchCandidate, SearchHit } from './types';

export type { RerankOptions } from './types';

export const RECIPROCAL_RANK_CONSTANT = 60;

const TERM_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}\p{M}_'-]*/gu;
const NEAR_DUPLICATE_JACCARD = 0.85;

const WEIGHTS = {
  fused: 0.55,
  coverage: 0.25,
  phrase: 0.1,
  title: 0.1,
} as const;

export function searchTerms(text: string): string[] {
  const terms = (text.toLowerCase().match(TERM_PATTERN) ?? []).filter(
    (term) => term.length > 1 || /[^\p{Script=Latin}\p{N}]/u.test(term),
  );
  return Array.from(new Set(terms));
}

export function reciprocalRankScore(
  candidate: Pick<SearchCandidate, 'lexicalRank' | 'semanticRank'>,
  k: number = RECIPROCAL_RANK_CONSTANT,
): number {
  let score = 0;
  if (candidate.lexicalRank !== null) score += 1 / (k + candidate.lexicalRank);
  if (candidate.semanticRank !== null) score += 1 / (k + candidate.semanticRank);
  return score;
}

function normalizedPhrase(text: string): string {
  return (text.toLowerCase().match(TERM_PATTERN) ?? []).join(' ');
}

function jaccard(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 && right.size === 0) return 1;
  let shared = 0;
  for (const term of left) if (right.has(term)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/**
 * Re-scores fused candidates against the query (coverage, phrase, title), then
 * drops near-duplicate passages and caps hits per source.
 */
export function rerankCandidates(
  query: string,
  candidates: readonly SearchCandidate[],
  options: RerankOptions,
): SearchHit[] {
  const terms = searchTerms(query);
  const phrase = terms.length > 1 ? normalizedPhrase(query) : '';
  const bestFused = 2 / (RECIPROCAL_RANK_CONSTANT + 1);

  const scored = candidates.map((candidate) => {
    const body = candidate.text.toLowerCase();
    const title = candidate.title.toLowerCase();
    const matchedTerms = terms.filter((term) => body.includes(term) || title.includes(term));
    const coverage = terms.length === 0 ? 0 : matchedTerms.length / terms.length;
    const titleCoverage =
      terms.length === 0 ? 0 : terms.filter((term) => title.includes(term)).length / terms.length;
    const phraseHit = phrase && normalizedPhrase(candidate.text).includes(phrase) ? 1 : 0;
    const score =
      WEIGHTS.fused * (reciprocalRankScore(candidate) / bestFused) +
      WEIGHTS.coverage * coverage +
      WEIGHTS.phrase * phraseHit +
      WEIGHTS.title * titleCoverage;
    return { ...candidate, score, matchedTerms };
  });

  scored.sort(
    (left, right) => right.score - left.score || left.chunkId.localeCompare(right.chunkId),
  );

  const kept: SearchHit[] = [];
  const keptTerms: Array<ReadonlySet<string>> = [];
  const perSource = new Map<string, number>();
  for (const hit of scored) {
    if (kept.length >= options.limit) break;
    const sourceKey = `${hit.sourceKind}:${hit.sourceId}`;
    const taken = perSource.get(sourceKey) ?? 0;
    if (options.maxPerSource !== undefined && taken >= options.maxPerSource) continue;
    const termSet = new Set(searchTerms(hit.text));
    if (keptTerms.some((existing) => jaccard(existing, termSet) >= NEAR_DUPLICATE_JACCARD)) {
      continue;
    }
    kept.push(hit);
    keptTerms.push(termSet);
    perSource.set(sourceKey, taken + 1);
  }
  return kept;
}

export const HYBRID_RERANK_PROVIDER_ID = 'hybrid-lexical-semantic';

export const hybridRerankProvider: RerankProvider = {
  id: HYBRID_RERANK_PROVIDER_ID,
  rerank: rerankCandidates,
};

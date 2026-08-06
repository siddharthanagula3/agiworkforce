/**
 * The relevance floor: two gates, BOTH must pass before a model is ever called.
 *
 * Failing either gate produces an abstention and the provider is never touched,
 * so an unknown question costs nothing AND cannot be answered from model priors
 * — there is no code path from a failed floor to a provider request.
 *
 * Gate 2 carries the real weight. BM25 absolute scores drift as a corpus grows,
 * so an absolute threshold alone rots; term coverage directly encodes "the
 * documentation actually talks about the thing you asked". The absolute gate is
 * kept as a cheap floor against single-weak-term matches.
 *
 * MAINTENANCE OBLIGATION: `MIN_ABSOLUTE_SCORE` is corpus-dependent. It is pinned
 * by `retrieval.test.ts` against the real corpus today and must be re-calibrated
 * whenever the corpus grows materially. The correct fix for a low answer rate is
 * writing more documentation, never loosening this number.
 */

/** Minimum BM25 score of the top hit. */
export const MIN_ABSOLUTE_SCORE = 1.5;

/** Fraction of distinct query content terms that must appear in the top hit. */
export const MIN_TERM_COVERAGE = 0.34;

/**
 * Minimum absolute number of matched content terms, applied only when the query
 * has at least this many content terms. A one-word query ("byok") is allowed to
 * match on its single term; a ten-word query must match more than one.
 */
export const MIN_MATCHED_TERMS = 2;

export interface FloorInput {
  topScore: number;
  matchedTermCount: number;
  queryTermCount: number;
}

export type FloorReason = 'ok' | 'empty_query' | 'below_score' | 'below_coverage';

export interface FloorVerdict {
  passed: boolean;
  reason: FloorReason;
  coverage: number;
}

export function evaluateRelevanceFloor(input: FloorInput): FloorVerdict {
  if (input.queryTermCount === 0) return { passed: false, reason: 'empty_query', coverage: 0 };

  const coverage = input.matchedTermCount / input.queryTermCount;

  if (input.topScore < MIN_ABSOLUTE_SCORE) {
    return { passed: false, reason: 'below_score', coverage };
  }
  if (coverage < MIN_TERM_COVERAGE) {
    return { passed: false, reason: 'below_coverage', coverage };
  }
  if (input.queryTermCount >= MIN_MATCHED_TERMS && input.matchedTermCount < MIN_MATCHED_TERMS) {
    return { passed: false, reason: 'below_coverage', coverage };
  }
  return { passed: true, reason: 'ok', coverage };
}

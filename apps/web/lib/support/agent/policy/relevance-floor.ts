
export const MIN_ABSOLUTE_SCORE = 1.5;

export const MIN_TERM_COVERAGE = 0.34;

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

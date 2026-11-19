export const OCCURRENCE_WINDOW = 800;

export interface OccurrenceContext {
  before: string;
  after: string;
}

export function lettersOnly(value: string): string {
  return value.replace(/[^\p{L}\p{N}]+/gu, '');
}

function sharedSuffix(a: string, b: string): number {
  let length = 0;
  while (
    length < a.length &&
    length < b.length &&
    a[a.length - 1 - length] === b[b.length - 1 - length]
  ) {
    length += 1;
  }
  return length;
}

function sharedPrefix(a: string, b: string): number {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) length += 1;
  return length;
}

export function bestOccurrence(
  candidates: readonly OccurrenceContext[],
  expected: OccurrenceContext,
): number | null {
  if (candidates.length === 1) return 0;
  const before = lettersOnly(expected.before);
  const after = lettersOnly(expected.after);
  let best = -1;
  let bestScore = 0;
  let tied = false;
  candidates.forEach((candidate, index) => {
    const score =
      sharedSuffix(lettersOnly(candidate.before), before) +
      sharedPrefix(lettersOnly(candidate.after), after);
    if (score > bestScore) {
      best = index;
      bestScore = score;
      tied = false;
    } else if (score === bestScore && score > 0) {
      tied = true;
    }
  });
  return best >= 0 && !tied ? best : null;
}

export function windowAround(
  text: string,
  start: number,
  end: number,
  size = OCCURRENCE_WINDOW,
): OccurrenceContext {
  return {
    before: text.slice(Math.max(0, start - size), start),
    after: text.slice(end, end + size),
  };
}

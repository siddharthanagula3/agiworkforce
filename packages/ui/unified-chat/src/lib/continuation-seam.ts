const MAX_OVERLAP = 240;

const MIN_OVERLAP = 8;

export const SEAM_INSPECTION_WINDOW = 96;

const BLOCK_START = /^ {0,3}(?:[-*+]\s|\d{1,3}[.)]\s|#{1,6}\s|>\s?|\||```|~~~|\${2}|\\\[)/;

function trailingFenceIsOpen(text: string): boolean {
  let open = false;
  for (const line of text.split('\n')) {
    if (/^\s{0,3}(`{3,}|~{3,})/.test(line)) open = !open;
  }
  return open;
}

function inInlineCode(text: string): boolean {
  const lastLine = text.slice(text.lastIndexOf('\n') + 1);
  let ticks = 0;
  for (const char of lastLine) if (char === '`') ticks += 1;
  return ticks % 2 === 1;
}

function overlapLength(seed: string, continuation: string): number {
  const window = seed.slice(-MAX_OVERLAP);
  const limit = Math.min(window.length, continuation.length);
  for (let length = limit; length >= MIN_OVERLAP; length--) {
    if (window.slice(window.length - length) === continuation.slice(0, length)) return length;
  }
  return 0;
}

/**
 * Continuations arrive as a fresh completion, so the model decides on its own
 * whether it is resuming a word or starting a sentence. Two of its choices are
 * wrong in ways the reader sees: repeating the tail it was given, and running a
 * new sentence into the previous word.
 *
 * Only the unambiguous cases are repaired. A lowercase-to-uppercase boundary is
 * never a resumed word in prose - but it is routinely one in code, so a seam
 * inside a fence or inline span is always left exactly as it arrived.
 *
 * A cut that lands right before a block - a list item, heading, table row,
 * fence, or display equation - is not a word boundary at all, and the single
 * space below reads as a run-on ("= 5, 2. Verify..."). That case gets a
 * paragraph break instead, and only when the seed does not already end on a
 * newline and the continuation has not already supplied one of its own -
 * whatever whitespace the model sent stays exactly as sent.
 */
export function repairContinuationSeam(seed: string, continuation: string): string {
  if (!seed || !continuation) return continuation;

  const overlap = overlapLength(seed, continuation);
  const deduplicated = overlap > 0 ? continuation.slice(overlap) : continuation;
  if (!deduplicated) return deduplicated;

  if (trailingFenceIsOpen(seed) || inInlineCode(seed)) return deduplicated;

  if (!seed.endsWith('\n') && BLOCK_START.test(deduplicated)) {
    return `\n\n${deduplicated}`;
  }

  const seedEnd = seed.slice(-1);
  const continuationStart = deduplicated.slice(0, 1);
  if (/\s/.test(seedEnd) || /\s/.test(continuationStart)) return deduplicated;

  const endsWord = /[\p{Ll}\p{Nd}]/u.test(seedEnd);
  const endsSentence = /[.!?]/.test(seedEnd);
  const startsSentence = /\p{Lu}/u.test(continuationStart);

  if (startsSentence && (endsWord || endsSentence)) return ` ${deduplicated}`;

  return deduplicated;
}

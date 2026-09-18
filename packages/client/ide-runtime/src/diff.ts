import { offsetAt, rangeFromOffsets, type CodeRange } from './session';

export type PatchConfidence = 'high' | 'medium' | 'low';

/** One SEARCH/REPLACE hunk, as plain text: no document handle, no editor range. */
export interface PatchBlock {
  filePath: string;
  search: string;
  replace: string;
}

export type PatchMatchStrategy = 'insert' | 'exact' | 'fuzzy' | 'aggressive';

export interface PatchMatch {
  range: CodeRange;
  matchedText: string;
  expectedText: string;
  fuzzy: boolean;
  confidence: PatchConfidence;
  whitespaceDiffPercent: number;
  strategy: PatchMatchStrategy;
}

export type PatchRefusal =
  | { kind: 'no-match' }
  | { kind: 'too-short'; strippedLength: number; minimum: number }
  | { kind: 'ambiguous'; strippedLength: number };

export type PatchOutcome =
  { matched: true; match: PatchMatch } | { matched: false; refusal: PatchRefusal };

export const AGGRESSIVE_FUZZY_MIN_LEN = 24;

const ENVELOPE = /```patch:([^\n]+)\n([\s\S]*?)```/g;
const HUNK = /<<<<<<< SEARCH\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> REPLACE/g;

function trimTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text.slice(0, -1) : text;
}

export function parsePatchBlocks(text: string): PatchBlock[] {
  const blocks: PatchBlock[] = [];
  const envelopes = new RegExp(ENVELOPE.source, ENVELOPE.flags);
  let envelope: RegExpExecArray | null;

  while ((envelope = envelopes.exec(text)) !== null) {
    const filePath = envelope[1]?.trim();
    if (!filePath) continue;

    const hunks = new RegExp(HUNK.source, HUNK.flags);
    const body = envelope[2] ?? '';
    let hunk: RegExpExecArray | null;

    while ((hunk = hunks.exec(body)) !== null) {
      blocks.push({
        filePath,
        search: trimTrailingNewline(hunk[1] ?? ''),
        replace: trimTrailingNewline(hunk[2] ?? ''),
      });
    }
  }

  return blocks;
}

export function whitespaceDiffPercent(original: string, matched: string): number {
  if (original === matched) return 0;

  const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();
  const originalNorm = normalize(original);
  const matchedNorm = normalize(matched);

  if (originalNorm === matchedNorm) {
    const originalWs = (original.match(/\s/g) ?? []).length;
    const matchedWs = (matched.match(/\s/g) ?? []).length;
    const totalChars = Math.max(original.length, matched.length, 1);
    return (Math.abs(originalWs - matchedWs) / totalChars) * 100;
  }

  const maxLength = Math.max(originalNorm.length, matchedNorm.length, 1);
  let differing = 0;
  for (let index = 0; index < maxLength; index += 1) {
    if (originalNorm[index] !== matchedNorm[index]) differing += 1;
  }
  return (differing / maxLength) * 100;
}

function confidenceFor(fuzzy: boolean, diffPercent: number): PatchConfidence {
  if (!fuzzy) return 'high';
  return diffPercent < 5 ? 'medium' : 'low';
}

function fuzzyLineMatch(text: string, search: string): CodeRange | undefined {
  const normalizeLine = (line: string): string => line.replace(/\s+/g, ' ').trimEnd();

  const textLines = text.split('\n');
  const searchLines = search.split('\n');
  if (searchLines.length === 0) return undefined;

  const normalizedText = textLines.map(normalizeLine);
  const normalizedSearch = searchLines.map(normalizeLine);
  const starts: number[] = [];

  for (let index = 0; index <= normalizedText.length - normalizedSearch.length; index += 1) {
    let matched = true;
    for (let offset = 0; offset < normalizedSearch.length; offset += 1) {
      if (normalizedText[index + offset] !== normalizedSearch[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) starts.push(index);
  }

  if (starts.length !== 1) return undefined;

  const startLine = starts[0]!;
  const endLine = startLine + searchLines.length - 1;
  return {
    start: { line: startLine, character: 0 },
    end: { line: endLine, character: textLines[endLine]?.length ?? 0 },
  };
}

/**
 * Whitespace-insensitive match of last resort. It refuses a search too short to
 * identify a region, or one occurring twice: a wrong region is worse than none.
 */
export function matchAggressively(
  text: string,
  search: string,
): { range: CodeRange; matchedText: string; whitespaceDiffPercent: number } | PatchRefusal {
  const strip = (value: string): string => value.replace(/\s+/g, '').toLowerCase();

  const strippedText = strip(text);
  const strippedSearch = strip(search);

  if (strippedSearch.length === 0) return { kind: 'no-match' };
  if (strippedSearch.length < AGGRESSIVE_FUZZY_MIN_LEN) {
    return {
      kind: 'too-short',
      strippedLength: strippedSearch.length,
      minimum: AGGRESSIVE_FUZZY_MIN_LEN,
    };
  }

  const index = strippedText.indexOf(strippedSearch);
  if (index === -1) return { kind: 'no-match' };
  if (strippedText.indexOf(strippedSearch, index + 1) !== -1) {
    return { kind: 'ambiguous', strippedLength: strippedSearch.length };
  }

  let start = -1;
  let end = -1;
  let strippedIndex = 0;

  for (let cursor = 0; cursor < text.length && end === -1; cursor += 1) {
    if (/\s/.test(text[cursor]!)) continue;
    if (strippedIndex === index && start === -1) start = cursor;
    if (strippedIndex === index + strippedSearch.length - 1) end = cursor + 1;
    strippedIndex += 1;
  }

  if (start === -1 || end === -1) return { kind: 'no-match' };

  const matchedText = text.substring(start, end);
  return {
    range: rangeFromOffsets(text, start, end),
    matchedText,
    whitespaceDiffPercent: whitespaceDiffPercent(search, matchedText),
  };
}

export function matchPatchBlock(text: string, block: PatchBlock): PatchOutcome {
  if (block.search === '') {
    const origin = { line: 0, character: 0 };
    return {
      matched: true,
      match: {
        range: { start: origin, end: origin },
        matchedText: '',
        expectedText: '',
        fuzzy: false,
        confidence: 'medium',
        whitespaceDiffPercent: 0,
        strategy: 'insert',
      },
    };
  }

  const exact = text.indexOf(block.search);
  if (exact !== -1) {
    return {
      matched: true,
      match: {
        range: rangeFromOffsets(text, exact, exact + block.search.length),
        matchedText: text.substring(exact, exact + block.search.length),
        expectedText: block.search,
        fuzzy: false,
        confidence: 'high',
        whitespaceDiffPercent: 0,
        strategy: 'exact',
      },
    };
  }

  const fuzzy = fuzzyLineMatch(text, block.search);
  if (fuzzy !== undefined) {
    const matchedText = text.substring(offsetAt(text, fuzzy.start), offsetAt(text, fuzzy.end));
    const diffPercent = whitespaceDiffPercent(block.search, matchedText);
    return {
      matched: true,
      match: {
        range: fuzzy,
        matchedText,
        expectedText: block.search,
        fuzzy: true,
        confidence: confidenceFor(true, diffPercent),
        whitespaceDiffPercent: diffPercent,
        strategy: 'fuzzy',
      },
    };
  }

  return { matched: false, refusal: { kind: 'no-match' } };
}

export function matchPatchBlockAggressive(text: string, block: PatchBlock): PatchOutcome {
  const direct = matchPatchBlock(text, block);
  if (direct.matched) return direct;

  const aggressive = matchAggressively(text, block.search);
  if ('kind' in aggressive) return { matched: false, refusal: aggressive };

  return {
    matched: true,
    match: {
      range: aggressive.range,
      matchedText: aggressive.matchedText,
      expectedText: block.search,
      fuzzy: true,
      confidence: 'low',
      whitespaceDiffPercent: aggressive.whitespaceDiffPercent,
      strategy: 'aggressive',
    },
  };
}

export function describePatchMatch(block: PatchBlock, match: PatchMatch): string {
  switch (match.strategy) {
    case 'insert':
      return 'Insert at beginning (empty search), confidence: medium';
    case 'exact':
      return `Exact match at line ${match.range.start.line}, confidence: high`;
    case 'fuzzy':
      return (
        `Fuzzy match at line ${match.range.start.line}, ` +
        `ws diff: ${match.whitespaceDiffPercent.toFixed(1)}%, confidence: ${match.confidence}`
      );
    case 'aggressive':
      return `Aggressive match succeeded for ${block.filePath}, ws diff: ${match.whitespaceDiffPercent.toFixed(1)}%`;
  }
}

export function describePatchRefusal(refusal: PatchRefusal, filePath: string): string {
  switch (refusal.kind) {
    case 'too-short':
      return `Aggressive fuzzy refused: stripped search length ${refusal.strippedLength} < ${refusal.minimum} chars`;
    case 'ambiguous':
      return `Aggressive fuzzy refused: ${refusal.strippedLength}-char search appears more than once`;
    case 'no-match':
      return `No match found for ${filePath}`;
  }
}

/** The message a reader sees when no region of the file could be identified. */
export function patchFailureMessage(block: PatchBlock): string {
  return (
    `Could not locate the target code block in ${block.filePath}. ` +
    'The file may have changed since the patch was generated.'
  );
}

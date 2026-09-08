/**
 * @file Which parts of a project file reach the model.
 *
 * Ranking and selection used to disagree. `scoreKnowledgeFile` scored the whole
 * `extractedText`, so a term anywhere in a document raised its rank; selection
 * then took `content.slice(0, limit)`. A question about material in the back
 * half of a long file retrieved exactly the right file and answered from the
 * wrong part of it. The prompt did carry an `excerptOf` notice, so the model
 * usually said the file was truncated rather than inventing an answer, an
 * honest abstention rather than a fabrication, but the answer was not there.
 *
 * This selects passages instead. It is not a RAG stack and does not need to be:
 * the BM25 retriever the support agent already uses is general over any
 * `{id, text}` list, so the only new thing here is cutting a document into
 * windows and putting them through it. No index is stored, nothing is embedded,
 * and a document is windowed at request time and thrown away.
 *
 * The whole document still wins when it fits. Retrieval that discards context
 * it had room for is a regression, not an improvement.
 */

import { buildBm25Index, scoreBm25 } from '@/lib/support/agent/retrieval/bm25';
import { tokenize } from '@/lib/support/agent/retrieval/tokenize';

/**
 * Window size, in characters.
 *
 * Large enough to hold a whole idea, a few paragraphs or a table with its
 * heading, so a passage answers rather than teases. Small enough that several
 * fit in one file's budget, which is what lets an answer draw on two distant
 * parts of the same document.
 */
export const PASSAGE_WINDOW_CHARS = 1_400;

/**
 * Overlap between consecutive windows.
 *
 * A sentence that straddles a boundary is otherwise split across two passages
 * and matches neither well. One paragraph of overlap costs a tenth of the
 * budget and removes the class of miss entirely.
 */
export const PASSAGE_OVERLAP_CHARS = 200;

/** A window shorter than this is a fragment; it is folded into its neighbour. */
const MIN_WINDOW_CHARS = 200;

/** How far past a window's end to look for a paragraph or sentence break. */
const BOUNDARY_SEARCH_CHARS = 300;

export interface KnowledgePassage {
  /** Character offset of the passage in the extracted text, for provenance. */
  start: number;
  end: number;
  text: string;
}

export type PassageStrategy =
  /** Short enough to send whole; nothing was selected away. */
  | 'whole'
  /** Query-relevant windows, in document order. */
  | 'passages'
  /** No usable query, so the head is the only defensible choice. */
  | 'head';

export interface PassageSelection {
  passages: KnowledgePassage[];
  strategy: PassageStrategy;
  /** Characters in the source document, so the prompt can say what was left. */
  totalChars: number;
}

function findBoundary(text: string, from: number, limit: number): number {
  const window = text.slice(from, Math.min(text.length, from + BOUNDARY_SEARCH_CHARS));
  const paragraph = window.indexOf('\n\n');
  if (paragraph >= 0) return from + paragraph + 2;
  const sentence = window.search(/[.!?]\s/);
  if (sentence >= 0) return from + sentence + 2;
  const space = window.indexOf(' ');
  if (space >= 0) return from + space + 1;
  return Math.min(limit, from);
}

/**
 * Cut the document into overlapping windows, preferring paragraph and sentence
 * breaks so a passage does not open mid-word.
 */
export function windowDocument(content: string): KnowledgePassage[] {
  const windows: KnowledgePassage[] = [];
  let cursor = 0;
  while (cursor < content.length) {
    const target = cursor + PASSAGE_WINDOW_CHARS;
    const end = target >= content.length ? content.length : findBoundary(content, target, target);
    const text = content.slice(cursor, end);
    if (text.trim()) windows.push({ start: cursor, end, text });
    if (end >= content.length) break;
    cursor = Math.max(end - PASSAGE_OVERLAP_CHARS, cursor + MIN_WINDOW_CHARS);
  }
  return windows;
}

/**
 * The parts of one file worth sending for this question.
 *
 * @param budgetChars characters this file may spend. Passages are added in
 * score order until the next one would not fit, then re-sorted into document
 * order so the model reads them the way the document reads.
 */
export function selectKnowledgePassages(input: {
  content: string;
  query: string;
  budgetChars: number;
}): PassageSelection {
  const content = input.content;
  const totalChars = content.length;
  const budget = Math.max(0, Math.trunc(input.budgetChars));
  if (budget <= 0) return { passages: [], strategy: 'passages', totalChars };

  if (totalChars <= budget) {
    return {
      passages: [{ start: 0, end: totalChars, text: content }],
      strategy: 'whole',
      totalChars,
    };
  }

  // Nothing to rank against. The head is not a good answer, but it is the only
  // one that does not pretend to have chosen.
  if (tokenize(input.query).length === 0) {
    return {
      passages: [{ start: 0, end: budget, text: content.slice(0, budget) }],
      strategy: 'head',
      totalChars,
    };
  }

  const windows = windowDocument(content);
  if (windows.length === 0) return { passages: [], strategy: 'passages', totalChars };

  const byId = new Map(windows.map((window, index) => [String(index), window]));
  const index = buildBm25Index(
    windows.map((window, position) => ({
      id: String(position),
      text: window.text,
      boosted: '',
    })),
  );
  const hits = scoreBm25(index, input.query);

  const chosen: KnowledgePassage[] = [];
  let spent = 0;
  for (const hit of hits) {
    const window = byId.get(hit.id);
    if (!window) continue;
    if (spent + window.text.length > budget) continue;
    chosen.push(window);
    spent += window.text.length;
  }

  // Every window scored zero, which BM25 reports by returning none. Falling
  // back to the head keeps the old behaviour for a question the document has
  // nothing to say about, rather than sending nothing at all.
  if (chosen.length === 0) {
    return {
      passages: [{ start: 0, end: budget, text: content.slice(0, budget) }],
      strategy: 'head',
      totalChars,
    };
  }

  chosen.sort((left, right) => left.start - right.start);
  return { passages: chosen, strategy: 'passages', totalChars };
}

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

import { DEFAULT_TEXT_WINDOW, windowText } from '@agiworkforce/data-layer/search';

import { buildBm25Index, scoreBm25 } from '@/lib/support/agent/retrieval/bm25';
import { tokenize } from '@/lib/support/agent/retrieval/tokenize';

export const PASSAGE_WINDOW_CHARS = DEFAULT_TEXT_WINDOW.windowChars;
export const PASSAGE_OVERLAP_CHARS = DEFAULT_TEXT_WINDOW.overlapChars;

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

/**
 * Cut the document into overlapping windows, preferring paragraph and sentence
 * breaks so a passage does not open mid-word.
 */
export function windowDocument(content: string): KnowledgePassage[] {
  return windowText(content, DEFAULT_TEXT_WINDOW);
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

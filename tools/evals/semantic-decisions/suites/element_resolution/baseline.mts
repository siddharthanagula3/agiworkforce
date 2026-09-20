import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSuite, writeBaseline, type ScoredRow } from '../score.mts';
import type { Split } from '../split.mts';

const suiteDir = fileURLToPath(new URL('.', import.meta.url));
const { cases, labels } = loadSuite(suiteDir);

const pages = (
  JSON.parse(readFileSync(resolve(suiteDir, 'pages.json'), 'utf8')) as {
    pages: Record<string, { content: string }>;
  }
).pages;

const ELEMENT_LINE = /^ {2}\[(\d+)\] (.*)$/;
const WORD = /[\p{L}\p{N}]+/gu;
const MIN_WORD_LENGTH = 3;

function words(value: string): string[] {
  return [...value.toLowerCase().matchAll(WORD)]
    .map((match) => match[0])
    .filter((word) => word.length >= MIN_WORD_LENGTH);
}

/**
 * There is no production resolver to measure. The find tool returns the whole
 * DOM summary and a reasoning model picks the index on the NEXT round trip, so
 * the only honest baseline is a floor: best word overlap between the
 * description and the element line, none when nothing overlaps. A candidate
 * decision that does not clear this has bought nothing at all.
 */
function resolveByOverlap(description: string, page: string): string {
  const wanted = new Set(words(description));
  let best = 'none';
  let bestScore = 0;
  for (const line of page.split('\n')) {
    const match = ELEMENT_LINE.exec(line);
    if (!match) continue;
    const score = words(match[2]!).filter((word) => wanted.has(word)).length;
    if (score > bestScore) {
      bestScore = score;
      best = match[1]!;
    }
  }
  return best;
}

const rows: ScoredRow[] = cases.cases.map((one) => {
  const input = one.input as { description: string; pageId: string };
  const page = pages[input.pageId]?.content ?? '';
  const prediction = resolveByOverlap(input.description, page);
  const author = labels.labels[one.id]!;
  const ambiguous = author.label === 'ambiguous';
  return {
    id: one.id,
    split: one.meta.split as Split,
    tags: [...one.meta.tags, `page:${input.pageId}`],
    expected: author.label,
    ...(author.alternatives ? { alternatives: author.alternatives } : {}),
    prediction,
    scored: !ambiguous,
    correct: !ambiguous && prediction === author.label,
    defensible: ambiguous && (author.alternatives ?? []).includes(prediction),
    extra: { elementsOnPage: (page.match(/\n {2}\[\d+\]/g) ?? []).length, pageChars: page.length },
  };
});

writeBaseline(suiteDir, {
  suite: cases.suite,
  baseline: {
    kind: 'reference-floor',
    function: 'word overlap between the description and each element line, highest score wins, none on a tie at zero',
    why: 'Production has no deterministic resolver: agentLoop.ts:320 returns the DOM summary and the model resolves the index on the next round trip. This floor is recorded so that a candidate decision is compared against something rather than against nothing.',
    notProduction: true,
  },
  rows,
});

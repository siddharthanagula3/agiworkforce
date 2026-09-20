import { fileURLToPath } from 'node:url';

import {
  extractCandidateMemoryFacts,
  isMemoryExtractionWorthwhile,
} from '../../../../../packages/ai/agent-core/src/memory';
import { loadSuite } from '../score.mts';
import { writeBaseline, type ScoredRow } from '../score.mts';
import type { Split } from '../split.mts';

const suiteDir = fileURLToPath(new URL('.', import.meta.url));
const { cases, labels } = loadSuite(suiteDir);

const rows: ScoredRow[] = cases.cases.map((one) => {
  const message = (one.input as { message: string }).message;
  const prediction = isMemoryExtractionWorthwhile(message) ? 'yes' : 'no';
  const author = labels.labels[one.id]!;
  const ambiguous = author.label === 'ambiguous';
  return {
    id: one.id,
    split: one.meta.split as Split,
    tags: one.meta.tags,
    expected: author.label,
    ...(author.alternatives ? { alternatives: author.alternatives } : {}),
    prediction,
    scored: !ambiguous,
    correct: !ambiguous && prediction === author.label,
    defensible: ambiguous && (author.alternatives ?? []).includes(prediction),
    extra: { patternFacts: extractCandidateMemoryFacts(message) },
  };
});

writeBaseline(suiteDir, {
  suite: cases.suite,
  baseline: {
    function: 'isMemoryExtractionWorthwhile',
    source: 'packages/ai/agent-core/src/memory.ts',
    note: 'The real production gate, called with the case message and nothing else. rows[].extra.patternFacts is what extractCandidateMemoryFacts finds in the same message, recorded so a miss in the regex extractor is not confused with a miss in the gate.',
  },
  rows,
});

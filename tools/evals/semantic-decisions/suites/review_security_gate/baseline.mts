import { fileURLToPath } from 'node:url';

import { REVIEW_PASSES } from '@/lib/code-review/findings';
import { loadSuite, scoreRows, writeBaseline, type ScoredRow } from '../score.mts';
import type { Split } from '../split.mts';

const suiteDir = fileURLToPath(new URL('.', import.meta.url));
const { cases, labels } = loadSuite(suiteDir);

/**
 * The path-only rule the ranking proposes to run before any model: a chunk whose
 * every path is documentation, a lockfile or a snapshot is skipped. Code goes
 * first, so this is written here rather than imported; production has no such
 * rule yet, and `baseline.json` reports it beside the production constant so the
 * two are compared rather than conflated.
 */
const SKIPPABLE = /(^|\/)(docs?\/|CHANGELOG\.md$)|\.md$|__snapshots__\/|\.snap$|(^|\/)(pnpm-lock\.yaml|package-lock\.json|Cargo\.lock)$/;

function pathOnlySkips(paths: readonly string[]): boolean {
  return paths.length > 0 && paths.every((path) => SKIPPABLE.test(path));
}

const rows: ScoredRow[] = cases.cases.map((one) => {
  const input = one.input as { chunk: string; paths: string[] };
  const author = labels.labels[one.id]!;
  const ambiguous = author.label === 'ambiguous';
  // Production: every chunk gets every pass, so the prediction is the constant.
  const prediction = REVIEW_PASSES.includes('security') ? 'yes' : 'no';
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
    extra: {
      chunkBytes: (one.meta as { chunkBytes: number }).chunkBytes,
      pathOnlyRuleSkips: pathOnlySkips(input.paths),
    },
  };
});

const pathRows: ScoredRow[] = rows.map((row) => {
  const prediction = (row.extra as { pathOnlyRuleSkips: boolean }).pathOnlyRuleSkips ? 'no' : 'yes';
  return {
    ...row,
    prediction,
    correct: row.scored && prediction === row.expected,
    defensible: !row.scored && (row.alternatives ?? []).includes(prediction),
  };
});

const decidedByPath = rows.filter((row) => (row.extra as { pathOnlyRuleSkips: boolean }).pathOnlyRuleSkips);
const callsPerPr = (kept: number, total: number) => Number(((kept / total) * 2).toFixed(3));

writeBaseline(suiteDir, {
  suite: cases.suite,
  baseline: {
    production:
      'apps/web/lib/code-review/pipeline.ts:103 runs every pass in REVIEW_PASSES over every chunk, so the security pass is a constant yes. That constant is the prediction scored below.',
    passes: [...REVIEW_PASSES],
    note: 'summary is the production constant. pathOnlyRule is the docs, lockfile and snapshot skip the ranking proposes to run first, scored over the same cases.',
  },
  rows,
  extra: {
    pathOnlyRule: {
      pattern: String(SKIPPABLE),
      casesDecided: decidedByPath.length,
      casesDecidedIds: decidedByPath.map((row) => row.id),
      summary: scoreRows(pathRows),
    },
    modelCallsPerChunk: {
      production: callsPerPr(1, 1),
      afterPathOnlyRule: Number(
        (1 + (rows.length - decidedByPath.length) / rows.length).toFixed(3),
      ),
      note: 'Two passes per chunk today. The path rule removes the security pass on the chunks it decides, and nothing else.',
    },
  },
});

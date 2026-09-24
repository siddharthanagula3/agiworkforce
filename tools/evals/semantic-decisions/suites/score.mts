import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { loadCases, type EvalCase, type EvalCaseFile, type Split } from './split.mts';

export interface AuthorLabel {
  label: string;
  alternatives?: string[];
  rationale: string;
}

export interface LabelFile {
  suite: string;
  labeller: string;
  question?: string;
  labels: Record<string, AuthorLabel>;
}

export function loadLabels(suiteDir: string, cases: readonly EvalCase[]): LabelFile {
  const file = JSON.parse(
    readFileSync(resolve(suiteDir, 'labels.author.json'), 'utf8'),
  ) as LabelFile;
  const missing = cases.filter((one) => !file.labels[one.id]).map((one) => one.id);
  if (missing.length > 0) throw new Error(`${file.suite}: unlabelled cases ${missing.join(', ')}`);
  const extra = Object.keys(file.labels).filter((id) => !cases.some((one) => one.id === id));
  if (extra.length > 0)
    throw new Error(`${file.suite}: labels for unknown cases ${extra.join(', ')}`);
  return file;
}

export function loadSuite(suiteDir: string): { cases: EvalCaseFile; labels: LabelFile } {
  const cases = loadCases(suiteDir);
  return { cases, labels: loadLabels(suiteDir, cases.cases) };
}

interface Tally {
  scored: number;
  correct: number;
  accuracy: number | null;
}

function tally(rows: readonly { scored: boolean; correct: boolean }[]): Tally {
  const scored = rows.filter((row) => row.scored);
  const correct = scored.filter((row) => row.correct).length;
  return {
    scored: scored.length,
    correct,
    accuracy: scored.length ? Number((correct / scored.length).toFixed(4)) : null,
  };
}

export interface ScoredRow {
  id: string;
  split: Split;
  tags: string[];
  expected: string;
  alternatives?: string[];
  prediction: string;
  /** Ambiguous cases are reported on their own and never counted as errors. */
  scored: boolean;
  correct: boolean;
  defensible: boolean;
  extra?: Record<string, unknown>;
}

export function scoreRows(rows: readonly ScoredRow[]): Record<string, unknown> {
  const splits = ['calibration', 'heldout'] as const;
  const tags = [...new Set(rows.flatMap((row) => row.tags))].sort();
  const ambiguous = rows.filter((row) => !row.scored);
  return {
    all: tally(rows),
    ...Object.fromEntries(
      splits.map((split) => [split, tally(rows.filter((row) => row.split === split))]),
    ),
    byTag: Object.fromEntries(
      tags.map((tag) => [tag, tally(rows.filter((row) => row.tags.includes(tag)))]),
    ),
    ambiguous: {
      cases: ambiguous.length,
      answeredWithADefensibleOption: ambiguous.filter((row) => row.defensible).length,
    },
  };
}

export function writeBaseline(
  suiteDir: string,
  body: {
    suite: string;
    baseline: Record<string, unknown>;
    rows: readonly ScoredRow[];
    extra?: Record<string, unknown>;
  },
): void {
  const output = {
    suite: body.suite,
    generatedAt: new Date().toISOString(),
    baseline: body.baseline,
    summary: scoreRows(body.rows),
    ...(body.extra ?? {}),
    rows: body.rows,
  };
  writeFileSync(resolve(suiteDir, 'baseline.json'), `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ suite: body.suite, summary: output.summary }, null, 2));
}

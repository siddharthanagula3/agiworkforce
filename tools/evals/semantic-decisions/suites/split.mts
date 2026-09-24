import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type Split = 'calibration' | 'heldout';

export interface EvalCase {
  id: string;
  input: unknown;
  meta: { tags: string[]; split?: Split; [key: string]: unknown };
}

export interface EvalCaseFile {
  suite: string;
  meta: Record<string, unknown>;
  cases: EvalCase[];
}

const CALIBRATION_PERCENT = 40;

/**
 * The split is a pure function of the suite name and the case id, so it is
 * reproducible, it does not move when cases are added, and it cannot be
 * re-rolled until a threshold looks good.
 */
export function splitFor(suite: string, id: string): Split {
  const digest = createHash('sha256').update(`${suite}:${id}`).digest('hex');
  return Number.parseInt(digest.slice(0, 8), 16) % 100 < CALIBRATION_PERCENT
    ? 'calibration'
    : 'heldout';
}

export function loadCases(suiteDir: string): EvalCaseFile {
  const parsed = JSON.parse(readFileSync(resolve(suiteDir, 'cases.json'), 'utf8')) as EvalCaseFile;
  const ids = new Set(parsed.cases.map((one) => one.id));
  if (ids.size !== parsed.cases.length) throw new Error(`${parsed.suite}: duplicate case id`);
  return parsed;
}

export function tagCounts(cases: readonly EvalCase[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const one of cases) for (const tag of one.meta.tags) counts[tag] = (counts[tag] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function stamp(suiteDir: string, check: boolean): void {
  const file = loadCases(suiteDir);
  let drifted = 0;
  for (const one of file.cases) {
    const expected = splitFor(file.suite, one.id);
    if (one.meta.split !== expected) drifted += 1;
    one.meta = { ...one.meta, split: expected };
  }
  const counts = { calibration: 0, heldout: 0 };
  for (const one of file.cases) counts[one.meta.split as Split] += 1;
  file.meta = {
    ...file.meta,
    caseCount: file.cases.length,
    splitCounts: counts,
    tagCounts: tagCounts(file.cases),
  };
  if (check) {
    if (drifted > 0) throw new Error(`${file.suite}: ${drifted} case(s) carry a hand-edited split`);
    console.log(`${file.suite}: split intact (${counts.calibration}/${counts.heldout})`);
    return;
  }
  writeFileSync(resolve(suiteDir, 'cases.json'), `${JSON.stringify(file, null, 2)}\n`);
  console.log(
    `${file.suite}: ${file.cases.length} cases, ${counts.calibration} calibration, ${counts.heldout} heldout`,
  );
}

if (process.argv[1]?.endsWith('split.mts')) {
  const args = process.argv.slice(2).filter((one) => one !== '--check');
  const check = process.argv.includes('--check');
  if (args.length === 0) throw new Error('usage: split.mts <suite-dir> [...] [--check]');
  for (const dir of args) stamp(resolve(dir), check);
}

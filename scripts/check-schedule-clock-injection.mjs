#!/usr/bin/env node

// When the next occurrence of a schedule is due is the one calculation in the
// product that has to be reproducible: a daylight-saving boundary or the end of
// a month can only be tested against a clock the test chooses. This guard walks
// the import closure of that calculation and refuses an ambient clock read
// anywhere inside it, so the reader's zone and not the server's decides.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const ROOT_MODULES = [
  'apps/web/lib/schedules/schedule-time.ts',
  'apps/web/lib/schedules/recurrence-rule.ts',
];

/** `Date.now()` and a `new Date()` that reads whatever the server clock says. */
const AMBIENT_CLOCK = /\bDate\.now\s*\(\s*\)|\bnew\s+Date\s*\(\s*\)/g;

function relativeImports(source) {
  return [...source.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]*)['"]/g)].map(
    (match) => match[1],
  );
}

function resolveImport(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Every module the calculation reaches, the roots included. */
export function importClosure(repoRoot = REPO_ROOT, roots = ROOT_MODULES) {
  const seen = new Set();
  const queue = roots.map((relative) => path.join(repoRoot, relative));
  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const specifier of relativeImports(source)) {
      const resolved = resolveImport(file, specifier);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  return [...seen].sort();
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

export function checkScheduleClockInjection(repoRoot = REPO_ROOT, roots = ROOT_MODULES) {
  const errors = [];
  const closure = importClosure(repoRoot, roots);

  for (const relative of roots) {
    if (!existsSync(path.join(repoRoot, relative))) {
      errors.push(`${relative} is named as a root of the calculation but does not exist`);
    }
  }
  if (closure.length === 0) errors.push('the schedule calculation closure is empty');

  for (const file of closure) {
    const source = readFileSync(file, 'utf8');
    const relative = path.relative(repoRoot, file);
    for (const match of source.matchAll(AMBIENT_CLOCK)) {
      errors.push(
        `${relative}:${lineOf(source, match.index ?? 0)} reads the clock directly (${match[0]}); ` +
          'the next occurrence takes the instant it is computed against as an argument',
      );
    }
  }

  return { errors, report: { modules: closure.length } };
}

function main() {
  const { errors, report } = checkScheduleClockInjection(REPO_ROOT);

  if (errors.length > 0) {
    console.error('Schedule clock injection check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `check-schedule-clock-injection: OK (${report.modules} modules in the next-occurrence closure)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}

#!/usr/bin/env node

/**
 * Every outbound call a server request waits on has a deadline. Without one the
 * only ceiling is the function's own maxDuration, so a vendor that stops
 * answering holds a reservation, a lock or a connection for minutes rather than
 * failing in seconds where a caller can act on it.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const BASELINE_PATH = 'scripts/config/dependency-deadlines.json';

/** Server trees. A browser fetch is bounded by the tab, not by this rule. */
export const SCANNED_ROOTS = Object.freeze([
  'apps/web/app/api',
  'apps/web/lib',
  'packages/ai',
  'packages/platform',
  'packages/tools',
]);

export const CLIENT_PATHS = Object.freeze([
  'apps/web/lib/client',
  'apps/web/lib/hooks',
  'packages/client',
  'packages/ui',
]);

const EXCLUDED_DIRECTORY =
  /^(__tests__|__mocks__|__fixtures__|node_modules|dist|build|coverage|e2e|\.next)$/;

export function productFiles(root) {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  return entries.flatMap((entry) => {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) return EXCLUDED_DIRECTORY.test(entry.name) ? [] : productFiles(full);
    if (!/\.ts$/.test(entry.name)) return [];
    if (/\.(test|spec|d)\.ts$/.test(entry.name)) return [];
    return [full];
  });
}

/**
 * Comments and literals blanked, offsets preserved, so a fetch in a doc comment
 * or inside a string is not a call site and a real one keeps its line number.
 */
export function blankNonCode(source) {
  const out = source.split('');
  let index = 0;
  const blankTo = (end) => {
    for (; index < end && index < out.length; index += 1) {
      if (out[index] !== '\n') out[index] = ' ';
    }
  };
  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (character === '/' && next === '/') {
      const end = source.indexOf('\n', index);
      blankTo(end === -1 ? source.length : end);
      continue;
    }
    if (character === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      blankTo(end === -1 ? source.length : end + 2);
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      let scan = index + 1;
      while (scan < source.length) {
        if (source[scan] === '\\') {
          scan += 2;
          continue;
        }
        if (source[scan] === character) break;
        scan += 1;
      }
      blankTo(Math.min(scan + 1, source.length));
      continue;
    }
    index += 1;
  }
  return out.join('');
}

const FETCH_CALL = /(?<![.\w$])fetch\s*\(/g;

/** The balanced argument text of each fetch call, with its line. */
export function fetchCalls(source) {
  const code = blankNonCode(source);
  const calls = [];
  FETCH_CALL.lastIndex = 0;
  let match;
  while ((match = FETCH_CALL.exec(code)) !== null) {
    let index = FETCH_CALL.lastIndex;
    let depth = 1;
    while (index < code.length && depth > 0) {
      if (code[index] === '(') depth += 1;
      else if (code[index] === ')') depth -= 1;
      index += 1;
    }
    calls.push({
      line: code.slice(0, match.index).split('\n').length,
      args: code.slice(FETCH_CALL.lastIndex, index - 1),
    });
    FETCH_CALL.lastIndex = index;
  }
  return calls;
}

/**
 * A deadline is an explicit signal, or an init the caller passed in, which
 * carries whatever deadline that caller set. Spreading an init is the same.
 */
export function hasDeadline(args) {
  if (/\bsignal\b\s*[,:}]/.test(args)) return true;
  if (/AbortSignal|AbortController/.test(args)) return true;
  if (/\.{3}\s*[A-Za-z_$][A-Za-z0-9_$]*/.test(args)) return true;
  const parts = args.split(',');
  const init = parts.length > 1 ? parts.slice(1).join(',').trim() : '';
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(init);
}

export function loadBaseline(repoRoot = REPO_ROOT) {
  return JSON.parse(readFileSync(path.join(repoRoot, BASELINE_PATH), 'utf8'));
}

export function scan(repoRoot = REPO_ROOT, roots = SCANNED_ROOTS) {
  const findings = [];
  let files = 0;
  let calls = 0;

  for (const root of roots) {
    for (const file of productFiles(path.join(repoRoot, root))) {
      const relative = path.relative(repoRoot, file);
      if (CLIENT_PATHS.some((client) => relative.startsWith(client))) continue;
      const source = readFileSync(file, 'utf8');
      if (/^\s*(['"])use client\1/m.test(source)) continue;
      files += 1;
      for (const call of fetchCalls(source)) {
        calls += 1;
        if (hasDeadline(call.args)) continue;
        findings.push({ file: relative, line: call.line });
      }
    }
  }
  return { findings, files, calls };
}

export function checkDependencyDeadlines(repoRoot = REPO_ROOT, roots = SCANNED_ROOTS) {
  const errors = [];
  const baseline = loadBaseline(repoRoot);
  const { findings, files, calls } = scan(repoRoot, roots);

  if (files === 0) {
    return { errors: [`${roots.join(', ')}: no product file was read.`], report: { files, calls } };
  }

  const known = new Map();
  for (const entry of baseline.known ?? []) {
    known.set(entry.file, entry);
    if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
      errors.push(`${BASELINE_PATH}: ${entry.file} carries no reason.`);
    }
    if (typeof entry.fix !== 'string' || entry.fix.trim().length === 0) {
      errors.push(`${BASELINE_PATH}: ${entry.file} names no fix.`);
    }
    if (!Number.isInteger(entry.calls) || entry.calls < 1) {
      errors.push(`${BASELINE_PATH}: ${entry.file} does not say how many calls it covers.`);
    }
  }

  const counted = new Map();
  for (const finding of findings) {
    counted.set(finding.file, (counted.get(finding.file) ?? 0) + 1);
  }

  for (const [file, count] of counted) {
    const entry = known.get(file);
    if (entry === undefined) {
      const first = findings.find((finding) => finding.file === file);
      errors.push(
        `${file}:${first.line} calls fetch with no deadline. A server request that waits on it ` +
          'is bounded only by the function ceiling. Pass signal: AbortSignal.timeout(...).',
      );
      continue;
    }
    if (count > entry.calls) {
      errors.push(
        `${file}: ${count} calls have no deadline, ${BASELINE_PATH} records ${entry.calls}. ` +
          'The recorded count only shrinks.',
      );
    }
  }

  for (const [file, entry] of known) {
    const count = counted.get(file) ?? 0;
    if (count === 0) {
      errors.push(`${BASELINE_PATH}: ${file} has a deadline on every call now. Delete the entry.`);
      continue;
    }
    if (count < entry.calls) {
      errors.push(
        `${BASELINE_PATH}: ${file} is down to ${count} calls from ${entry.calls}. Lower the count.`,
      );
    }
  }

  return { errors, report: { files, calls, findings: findings.length } };
}

function main() {
  const { errors, report } = checkDependencyDeadlines();
  if (errors.length > 0) {
    console.error('Dependency deadline check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(
    `check-dependency-deadlines: OK (${report.calls} outbound calls in ${report.files} files, ` +
      `${report.findings} recorded)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}

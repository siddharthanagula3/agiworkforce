#!/usr/bin/env node
/**
 * Two ways a suite reports green without measuring anything: one focused test
 * that silently skips its file, and a retry that runs a flaky test until it
 * passes. Skips are counted by check-llm-failure-guardrails; empty and
 * vacuous tests by check-test-integrity.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BASELINE_PATH = 'scripts/config/test-hygiene.json';
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  'dist',
  'build',
  'out',
  'target',
  'coverage',
  'test-results',
  'playwright-report',
]);
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const CONFIG_FILE = /(?:playwright|vitest|jest)[.\w-]*\.config\.[cm]?[jt]s$/;
const MIN_REASON = 60;

const FOCUSED = [
  { regex: /\b(?:describe|it|test|suite|context)\s*\.\s*only\s*\(/g, label: 'a focused test' },
  { regex: /\bf(?:describe|it)\s*\(/g, label: 'a focused test' },
];

const SUITE_RETRY = [
  { regex: /\.\s*configure\s*\(\s*\{[^}]*\bretries\s*:\s*([1-9]\d*)/g, label: 'suite retries' },
  { regex: /\bthis\s*\.\s*retries\s*\(\s*([1-9]\d*)/g, label: 'suite retries' },
];

const CONFIG_RETRY = /(^|[^.\w])retries\s*:\s*([^,\n}]+)/g;

function walk(root, relative, out) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return out;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true }).sort()) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const next = relative === '.' ? entry.name : path.join(relative, entry.name);
    if (entry.isDirectory()) walk(root, next, out);
    else out.push(next);
  }
  return out;
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

/**
 * A comment or a string can hold the same words as the code. Blank both before
 * matching so a test about retries is not read as a test that retries.
 */
export function maskNonCode(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, prefix) => prefix + ' '.repeat(match.length - 1))
    .replace(/(['"`])(?:\\.|(?!\1)[^\\\n])*\1/g, (literal) => literal.replace(/[^\n]/g, ' '));
}

export function testFiles(root) {
  return walk(root, '.', []).filter((relative) => TEST_FILE.test(path.basename(relative)));
}

export function configFiles(root) {
  return walk(root, '.', []).filter((relative) => CONFIG_FILE.test(path.basename(relative)));
}

function scan(source, rules) {
  const masked = maskNonCode(source);
  const found = [];
  for (const rule of rules) {
    rule.regex.lastIndex = 0;
    let match;
    while ((match = rule.regex.exec(masked)) !== null) {
      found.push({ line: lineOf(masked, match.index), label: rule.label });
    }
  }
  return found;
}

export function focusedTests(source) {
  return scan(source, FOCUSED);
}

export function suiteRetries(source) {
  return scan(source, SUITE_RETRY);
}

/**
 * A runner-level retry count is a policy, not a defect, but it decides whether
 * a flaky test can stay a release gate, so it has to be stated on purpose.
 */
export function configRetries(source) {
  const masked = maskNonCode(source);
  const found = [];
  CONFIG_RETRY.lastIndex = 0;
  let match;
  while ((match = CONFIG_RETRY.exec(masked)) !== null) {
    const value = match[2].trim();
    if (/^0$/.test(value)) continue;
    found.push({
      line: lineOf(masked, match.index),
      value: source.slice(match.index, CONFIG_RETRY.lastIndex).trim(),
    });
  }
  return found;
}

function loadBaseline(root) {
  const absolute = path.join(root, BASELINE_PATH);
  if (!fs.existsSync(absolute)) return {};
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

function reconcile({ declared, found, failures, key }) {
  const seen = new Set();
  for (const finding of found) {
    const entry = declared.get(finding.id);
    if (entry === undefined) continue;
    seen.add(finding.id);
    if ((entry.reason ?? '').trim().length < MIN_REASON) {
      failures.push(`${BASELINE_PATH}: ${key} entry '${finding.id}' needs a reason, not a label`);
    }
  }
  for (const id of declared.keys()) {
    if (!seen.has(id)) {
      failures.push(`${BASELINE_PATH}: ${key} entry '${id}' matches nothing now; delete it`);
    }
  }
  return found.filter((finding) => !declared.has(finding.id));
}

export function checkTestHygiene(root = REPO_ROOT) {
  const failures = [];
  const baseline = loadBaseline(root);
  const files = testFiles(root);
  if (files.length === 0) {
    failures.push('no test file found; the walk would be empty');
    return { failures, files: 0, configs: 0 };
  }

  const focused = [];
  const retried = [];
  for (const relative of files) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    for (const finding of focusedTests(source)) {
      focused.push({ ...finding, id: `${relative}:${finding.line}` });
    }
    for (const finding of suiteRetries(source)) {
      retried.push({ ...finding, id: `${relative}:${finding.line}`, file: relative });
    }
  }

  for (const finding of focused) {
    failures.push(
      `${finding.id} is ${finding.label}; every other test in that file stops running and the suite still reports green`,
    );
  }

  const declaredRetries = new Map((baseline.retries ?? []).map((entry) => [entry.id, entry]));
  const configs = configFiles(root);
  for (const relative of configs) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    for (const finding of configRetries(source)) {
      retried.push({ ...finding, id: `${relative}:${finding.line}`, file: relative });
    }
  }

  for (const finding of reconcile({
    declared: declaredRetries,
    found: retried,
    failures,
    key: 'retries',
  })) {
    failures.push(
      `${finding.id} retries a failing test until it passes, which turns a flake into a green gate; declare it with a reason or remove it`,
    );
  }

  return { failures, files: files.length, configs: configs.length, retries: retried.length };
}

function main() {
  const { failures, files, configs, retries } = checkTestHygiene(process.cwd());
  if (failures.length > 0) {
    console.error('Test hygiene:\n');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(`\n${failures.length} finding(s).`);
    process.exit(1);
  }
  console.log(
    `check-test-hygiene: ${files} test file(s), no focused test, ${retries} declared retry policy(ies) over ${configs} runner config(s).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

#!/usr/bin/env node
/**
 * Every surface that offers connector tools to a model asks the same gate.
 *
 * `isToolDenied` is an optional option, so a caller that omits it gets the full
 * connector catalog with no saved verdict applied and no type error, and a tool
 * the account blocked comes back the moment a new entry point is written. The
 * first turn, the approval, each resume and the scheduled executor each load a
 * catalog of their own, so the call sites are the source of truth and are
 * walked here rather than listed.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const CATALOG_MODULE = 'apps/web/lib/user-connector-tools.ts';
const LOADERS = ['loadUserConnectorToolDefs', 'loadUserConnectorToolCatalog'];
const GATE_OPTION = 'isToolDenied';
const POLICY_FILTER = 'applyConnectorPolicy';
const SCAN_ROOTS = ['apps/web', 'packages'];
const LOOP_ENTRY_POINTS = ['runToolLoop', 'runCloudAgentTurn'];
const PERMISSION_OPTION = 'connectorPermissions';

const SKIP_DIR = /^(node_modules|\.next|\.turbo|coverage|dist|out|build)$/u;
const SOURCE_FILE = /\.(?:ts|tsx)$/u;
const TEST_FILE = /(?:\.test\.|\.spec\.|__tests__|__mocks__)/u;

export function walkSources(dir) {
  if (!fs.existsSync(dir)) return [];
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR.test(entry.name)) continue;
      found.push(...walkSources(full));
      continue;
    }
    if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(full)) found.push(full);
  }
  return found;
}

/** The argument text of each call to `name`, read by balancing parentheses. */
export function callArguments(source, name) {
  const calls = [];
  const opener = new RegExp(`\\b${name}\\s*\\(`, 'gu');
  let found = opener.exec(source);
  while (found !== null) {
    const start = found.index + found[0].length;
    let depth = 1;
    let index = start;
    while (index < source.length && depth > 0) {
      const char = source[index];
      if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
      index += 1;
    }
    calls.push({
      line: source.slice(0, found.index).split('\n').length,
      text: source.slice(start, index - 1),
    });
    found = opener.exec(source);
  }
  return calls;
}

export function ungatedCalls(relativePath, source) {
  const problems = [];
  for (const name of LOADERS) {
    for (const call of callArguments(source, name)) {
      if (!call.text.includes(GATE_OPTION)) {
        problems.push(`${relativePath}:${call.line} ${name}() offers tools without ${GATE_OPTION}`);
      }
    }
  }
  return problems;
}

/**
 * The catalog filter decides what is OFFERED. The saved verdicts still have to
 * reach the gate that decides what RUNS, or a tool blocked since the turn
 * paused executes on the resume that follows.
 */
export function unboundLoopCalls(relativePath, source) {
  const problems = [];
  for (const entry of LOOP_ENTRY_POINTS) {
    if (new RegExp(`function\\s*\\*?\\s*${entry}\\s*\\(`, 'u').test(source)) continue;
    for (const call of callArguments(source, entry)) {
      if (!call.text.includes(PERMISSION_OPTION)) {
        problems.push(
          `${relativePath}:${call.line} ${entry}() runs a turn without ${PERMISSION_OPTION}, ` +
            `so the account's saved verdicts never reach the gate`,
        );
      }
    }
  }
  return problems;
}

// Wrapped so another guard can import the walk without running this one.
function main() {
  const failures = [];
  let callCount = 0;
  let callerCount = 0;
  let loopCallCount = 0;

  for (const root of SCAN_ROOTS) {
    for (const file of walkSources(path.join(scanRoot, root))) {
      const relative = path.relative(scanRoot, file).split(path.sep).join('/');
      // The module that declares the loaders defines them and re-enters itself.
      if (relative === CATALOG_MODULE) continue;
      const source = fs.readFileSync(file, 'utf8');
      const calls = LOADERS.reduce((total, name) => total + callArguments(source, name).length, 0);
      if (calls === 0) continue;
      callerCount += 1;
      callCount += calls;
      failures.push(...ungatedCalls(relative, source));
    }
  }

  for (const root of SCAN_ROOTS) {
    for (const file of walkSources(path.join(scanRoot, root))) {
      const relative = path.relative(scanRoot, file).split(path.sep).join('/');
      const source = fs.readFileSync(file, 'utf8');
      const bound = unboundLoopCalls(relative, source);
      loopCallCount += LOOP_ENTRY_POINTS.reduce(
        (total, entry) =>
          total +
          (new RegExp(`function\\s*\\*?\\s*${entry}\\s*\\(`, 'u').test(source)
            ? 0
            : callArguments(source, entry).length),
        0,
      );
      failures.push(...bound);
    }
  }

  /** The catalog every one of those callers reads must still be policy-filtered. */
  const catalogPath = path.join(scanRoot, CATALOG_MODULE);
  if (!fs.existsSync(catalogPath)) {
    console.error(`check-connector-tool-gate: ${CATALOG_MODULE} is missing.`);
    process.exit(1);
  }
  const catalogSource = fs.readFileSync(catalogPath, 'utf8');
  if (!new RegExp(`\\b${POLICY_FILTER}\\s*\\(`, 'u').test(catalogSource)) {
    failures.push(`${CATALOG_MODULE} no longer filters the offered catalog by workspace policy`);
  }
  if (!new RegExp(`\\b${GATE_OPTION}\\b`, 'u').test(catalogSource)) {
    failures.push(`${CATALOG_MODULE} no longer accepts a per-tool verdict from its callers`);
  }

  if (callCount === 0) {
    console.error(
      'check-connector-tool-gate: no catalog caller found; the walk is measuring nothing.',
    );
    process.exit(1);
  }

  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.log(
    `[connector tool gate] ${callCount} catalog load(s) in ${callerCount} surface(s), ` +
      `${loopCallCount} turn(s) bound to saved verdicts, ${failures.length} failure(s)`,
  );
  process.exitCode = failures.length === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

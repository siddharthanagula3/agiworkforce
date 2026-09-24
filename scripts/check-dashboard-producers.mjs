#!/usr/bin/env node
// A dashboard panel is a claim that someone can answer a question with it. The
// panel catalogue is already held to the instruments it reads; this is the
// other direction, and it is the one that fails quietly: a panel whose metric
// no product call site ever records draws a flat line, and a flat line reads
// as "this never happens" rather than as "nothing reports this".
//
// Everything here is enumerated from the source: the instrument table in
// metrics.ts, the panels in dashboards.ts, and every call site under the app.
// Recorders are reached through the observability layer's own wrappers, so a
// product file that calls withSpan counts as a producer of the span metrics.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const OBSERVABILITY_DIR = 'apps/web/lib/observability';
export const PRODUCT_ROOTS = ['apps/web/app', 'apps/web/lib', 'apps/web/features'];

const SOURCE_FILE = /\.tsx?$/;
const TEST_FILE = /\.(test|spec)\.tsx?$/;
const SKIP_DIR = new Set(['__tests__', 'node_modules', '.next', '.turbo']);

// A call, with the generic argument list a typed wrapper carries between the
// name and the parenthesis.
const CALL_SHAPE = /\b(\w+)\s*(?:<[^>()]*>)?\s*\(/g;

function sourceFiles(dir, found = []) {
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR.has(entry.name)) continue;
      sourceFiles(full, found);
    } else if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Every metric name any table in the observability layer declares, keyed as it
 * is written at a construction site (`METRIC_NAME.turns`). Media keeps its own
 * table, so resolving through the qualified name rather than the field keeps
 * both in one vocabulary.
 */
export function readInstrumentTable(root) {
  const names = new Map();
  for (const file of sourceFiles(path.join(root, OBSERVABILITY_DIR))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const table of source.matchAll(
      /export const ((?:[A-Z][A-Z0-9_]*_)?METRIC(?:_NAME)?)\s*=\s*\{/g,
    )) {
      const from = table.index;
      const body = source.slice(from, source.indexOf('} as const;', from));
      for (const line of body.split('\n')) {
        const field = /^\s*([A-Za-z]\w*):\s*'([^']+)'/.exec(line);
        if (field) names.set(`${table[1]}.${field[1]}`, field[2]);
      }
    }
  }
  return names;
}

/** Which metrics each exported function of the observability layer writes. */
export function readRecorders(root, names = readInstrumentTable(root)) {
  const direct = new Map();
  const calls = new Map();
  for (const file of sourceFiles(path.join(root, OBSERVABILITY_DIR))) {
    const source = fs.readFileSync(file, 'utf8');

    // Instrument objects are file-local and their fields are named freely, so
    // each one is resolved back to the metric it was constructed with.
    const instrumentMetric = new Map();
    for (const built of source.matchAll(
      /(\w+):\s*meter\.create\w+\(\s*((?:[A-Z][A-Z0-9_]*_)?METRIC(?:_NAME)?\.\w+)/g,
    )) {
      const metric = names.get(built[2]);
      if (metric) instrumentMetric.set(built[1], metric);
    }

    const starts = [
      ...source.matchAll(/export (?:async )?function (\w+)\s*(?:<[^>()]*>)?\s*\(/g),
    ].map((match) => [match[1], match.index]);
    for (let index = 0; index < starts.length; index += 1) {
      const [name, from] = starts[index];
      const to = index + 1 < starts.length ? starts[index + 1][1] : source.length;
      const body = source.slice(from, to);
      const written = new Set();
      for (const use of body.matchAll(/\.(\w+)\.(?:add|record)\(/g)) {
        const metric = instrumentMetric.get(use[1]);
        if (metric) written.add(metric);
      }
      direct.set(name, written);
      calls.set(name, new Set([...body.matchAll(CALL_SHAPE)].map((match) => match[1])));
    }
  }

  // A wrapper reaches an instrument through another export, so settle the
  // reachable set before asking what the product calls.
  const reached = new Map([...direct].map(([name, written]) => [name, new Set(written)]));
  for (let pass = 0; pass < reached.size + 1; pass += 1) {
    let grew = false;
    for (const [name, callees] of calls) {
      const own = reached.get(name);
      for (const callee of callees) {
        if (callee === name) continue;
        for (const field of reached.get(callee) ?? []) {
          if (!own.has(field)) {
            own.add(field);
            grew = true;
          }
        }
      }
    }
    if (!grew) break;
  }
  return reached;
}

/** The metric each dashboard panel reads, as a qualified table reference. */
export function readPanelMetrics(root) {
  const source = fs.readFileSync(path.join(root, OBSERVABILITY_DIR, 'dashboards.ts'), 'utf8');
  return new Set(
    [...source.matchAll(/metric: ((?:[A-Z][A-Z0-9_]*_)?METRIC(?:_NAME)?\.\w+)/g)].map(
      (match) => match[1],
    ),
  );
}

function productCallSites(root) {
  const observability = path.join(root, OBSERVABILITY_DIR);
  const called = new Map();
  for (const productRoot of PRODUCT_ROOTS) {
    for (const file of sourceFiles(path.join(root, productRoot))) {
      if (file.startsWith(observability)) continue;
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(CALL_SHAPE)) {
        const sites = called.get(match[1]) ?? [];
        if (sites.length < 1) sites.push(path.relative(root, file));
        called.set(match[1], sites);
      }
    }
  }
  return called;
}

export function runDashboardProducerCheck(root = repoRoot) {
  const failures = [];
  const names = readInstrumentTable(root);
  const recorders = readRecorders(root, names);
  const panels = readPanelMetrics(root);
  const called = productCallSites(root);

  const writes = new Map();
  for (const [fn, metrics] of recorders) {
    for (const metric of metrics) {
      const producers = writes.get(metric) ?? [];
      producers.push(fn);
      writes.set(metric, producers);
    }
  }

  for (const reference of [...panels].sort()) {
    const metric = names.get(reference);
    if (!metric) {
      failures.push(`a panel reads ${reference}, which no instrument table declares`);
      continue;
    }
    const producers = writes.get(metric) ?? [];
    if (producers.length === 0) {
      failures.push(
        `${metric} is on a dashboard and no function in ${OBSERVABILITY_DIR} records it`,
      );
      continue;
    }
    if (!producers.some((fn) => called.has(fn))) {
      failures.push(
        `${metric} is on a dashboard and nothing under ${PRODUCT_ROOTS.join(', ')} calls ` +
          `any of its recorders (${producers.sort().join(', ')}), so the panel can only ever be empty`,
      );
    }
  }

  const charted = new Set([...panels].map((reference) => names.get(reference)));
  for (const metric of new Set(names.values())) {
    if ((writes.get(metric) ?? []).length === 0 && !charted.has(metric)) {
      failures.push(`${metric} is declared, recorded by nothing and read by no panel`);
    }
  }

  return failures;
}

function main() {
  const flag = process.argv.indexOf('--root');
  const root = flag >= 0 ? path.resolve(process.argv[flag + 1]) : repoRoot;
  const failures = runDashboardProducerCheck(root);
  if (failures.length > 0) {
    console.error('Dashboard panels that nothing can fill:\n');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(`\n${failures.length} problem(s).`);
    process.exit(1);
  }
  const panels = readPanelMetrics(root).size;
  console.log(
    `check-dashboard-producers: ${panels} charted metric(s), each recorded by a function the app calls.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

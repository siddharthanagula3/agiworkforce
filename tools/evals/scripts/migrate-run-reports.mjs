#!/usr/bin/env node
/**
 * Upgrades committed run reports to the current run-report schema.
 *
 * A measured run cannot be re-measured for free, so a schema change has to
 * carry the old evidence forward. Only what is genuinely derivable is filled
 * in: per-slice scores come from the corpus plus the report's own failed and
 * skipped lists, which is exact. Completeness and retry cost are left null,
 * because a schema-1 report recorded pass/fail per row and nothing about the
 * checks inside it or the attempts behind it; inventing either would put a
 * number where no measurement happened.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { recordMeasurement } from './measurement-integrity.mjs';

const EVALS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATASETS_DIR = path.join(EVALS_ROOT, 'datasets');
const MEASUREMENTS_DIR = path.join(EVALS_ROOT, 'measurements');
export const TARGET_SCHEMA_VERSION = 2;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sliceOf(rows) {
  const passed = rows.filter((row) => row.passed).length;
  return {
    total: rows.length,
    passed,
    score: rows.length === 0 ? 0 : passed / rows.length,
    completeness: null,
  };
}

function sliceBy(rows, key) {
  const buckets = new Map();
  for (const row of rows) {
    const bucket = buckets.get(row[key]);
    if (bucket === undefined) buckets.set(row[key], [row]);
    else bucket.push(row);
  }
  return Object.fromEntries(
    [...buckets.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, entries]) => [name, sliceOf(entries)]),
  );
}

export function upgradeSuite(suite, summary, dataset) {
  const carried = {
    ...summary,
    priority: dataset.priority,
    provenance: dataset.provenance,
    completeness: null,
    retries: null,
    slices: null,
  };
  if (summary.version !== dataset.version) return carried;
  const skipped = new Set((summary.skipped ?? []).map((entry) => entry.id));
  const failed = new Set(summary.failed ?? []);
  const rows = dataset.cases
    .filter((entry) => !skipped.has(entry.id))
    .map((entry) => ({ family: entry.family, risk: entry.risk, passed: !failed.has(entry.id) }));
  if (rows.length !== summary.total) return carried;
  return {
    ...carried,
    slices: { family: sliceBy(rows, 'family'), risk: sliceBy(rows, 'risk') },
  };
}

export function upgradeReport(report, datasets) {
  const suites = Object.fromEntries(
    Object.entries(report.suites ?? {}).map(([suite, summary]) => [
      suite,
      upgradeSuite(suite, summary, datasets[suite]),
    ]),
  );
  const { integrity: _integrity, ...rest } = report;
  return {
    ...rest,
    schemaVersion: TARGET_SCHEMA_VERSION,
    runId: report.runId ?? null,
    measuredAt: report.measuredAt ?? report.recordedOn ?? null,
    suites: Object.fromEntries(
      Object.entries(suites).map(([suite, summary]) => [
        suite,
        { ...summary, measuredAt: summary.measuredAt ?? report.recordedOn ?? null },
      ]),
    ),
  };
}

function loadDatasets() {
  return Object.fromEntries(
    fs
      .readdirSync(DATASETS_DIR)
      .filter((name) => name.endsWith('.json'))
      .map((name) => {
        const dataset = readJson(path.join(DATASETS_DIR, name));
        return [dataset.suite, dataset];
      }),
  );
}

function main() {
  const datasets = loadDatasets();
  let migrated = 0;
  for (const folder of ['runs', 'baselines']) {
    const dir = path.join(MEASUREMENTS_DIR, folder);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).filter((entry) => entry.endsWith('.json'))) {
      const file = path.join(dir, name);
      const report = readJson(file);
      if (report.schemaVersion === TARGET_SCHEMA_VERSION) continue;
      recordMeasurement(file, upgradeReport(report, datasets));
      process.stdout.write(
        `[evals migrate] ${folder}/${name} -> schema ${TARGET_SCHEMA_VERSION}\n`,
      );
      migrated += 1;
    }
  }
  process.stdout.write(`[evals migrate] ${migrated} report(s) upgraded\n`);
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) main();

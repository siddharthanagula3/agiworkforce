#!/usr/bin/env node
/**
 * Integrity and write-once enforcement for committed measurements.
 *
 * A measurement is evidence: a baseline decides whether a model may take a
 * family slot, and a run report is the thing a later comparison is judged
 * against. Evidence that can be edited in place without anyone noticing is not
 * evidence, and "it is in git history" only helps someone who already suspects
 * it.
 *
 * Two rules, both checkable from the working tree alone:
 *
 *   1. Every artefact carries the sha256 digest of its own content. Edit the
 *      file and the digest no longer matches.
 *   2. Every artefact is listed in the ledger with that digest and the run that
 *      produced it. Rewriting an artefact without a new `runId` and a new
 *      `measuredAt` is refused, so a re-measurement is always visible as a new
 *      run in the ledger diff rather than a silent overwrite.
 *
 * Plain Node on purpose: CI and `family-slots.mjs` run it with no TypeScript
 * loader.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const EVALS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MEASUREMENTS_DIR = path.join(EVALS_ROOT, 'measurements');
export const LEDGER_FILE = path.join(MEASUREMENTS_DIR, 'ledger.json');
export const LEDGER_SCHEMA_VERSION = 1;
export const INTEGRITY_ALGORITHM = 'sha256';
const LEDGER_NAME = 'ledger.json';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

export function digestOf(artifact) {
  const { integrity: _integrity, ...rest } = artifact;
  return createHash(INTEGRITY_ALGORITHM)
    .update(JSON.stringify(canonical(rest)))
    .digest('hex');
}

export function stamp(artifact) {
  return { ...artifact, integrity: { algorithm: INTEGRITY_ALGORITHM, digest: digestOf(artifact) } };
}

export function verifyArtifact(artifact) {
  const recorded = artifact.integrity;
  if (!recorded || typeof recorded.digest !== 'string') return 'carries no integrity digest';
  if (recorded.algorithm !== INTEGRITY_ALGORITHM) {
    return `integrity algorithm ${recorded.algorithm} is not ${INTEGRITY_ALGORITHM}`;
  }
  const actual = digestOf(artifact);
  return recorded.digest === actual
    ? null
    : `content digest ${actual} does not match the recorded ${recorded.digest}`;
}

/**
 * Every suite score in an artefact, with the date it was measured, so the
 * ledger is the queryable index of what was measured when.
 */
function suiteIndex(artifact) {
  return Object.fromEntries(
    Object.entries(artifact.suites ?? {}).map(([suite, summary]) => [
      suite,
      {
        version: summary.version ?? null,
        priority: summary.priority ?? null,
        score: summary.score ?? null,
        completeness: summary.completeness ?? null,
        met: summary.met ?? null,
        measuredAt: summary.measuredAt ?? artifact.recordedOn ?? null,
      },
    ]),
  );
}

export function ledgerEntryFor(relativePath, artifact) {
  const entry = {
    path: relativePath,
    digest: digestOf(artifact),
    runId: artifact.runId ?? null,
    modelKey: artifact.modelKey ?? null,
    routeId: artifact.routeId ?? null,
    measuredAt: artifact.measuredAt ?? artifact.recordedOn ?? null,
  };
  if (artifact.familyId !== undefined) entry.familyId = artifact.familyId;
  const suites = suiteIndex(artifact);
  return Object.keys(suites).length === 0 ? entry : { ...entry, suites };
}

export function readLedger(file = LEDGER_FILE) {
  if (!fs.existsSync(file)) return { schemaVersion: LEDGER_SCHEMA_VERSION, entries: [] };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeLedger(ledger, file = LEDGER_FILE) {
  const entries = [...ledger.entries].sort((left, right) => left.path.localeCompare(right.path));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `${JSON.stringify({ schemaVersion: LEDGER_SCHEMA_VERSION, entries }, null, 2)}\n`,
  );
}

function measurementFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name === LEDGER_NAME) continue;
    const absolute = path.join(entry.parentPath ?? entry.path, entry.name);
    found.push(path.relative(dir, absolute).split(path.sep).join('/'));
  }
  return found.sort();
}

/**
 * The write-once rule. A changed digest is allowed only when the artefact also
 * carries a new run id and a new measurement date, which is what a genuine
 * re-measurement produces and what an in-place edit cannot fake without saying
 * so in the ledger diff.
 */
function rewriteProblem(previous, next) {
  if (previous.digest === next.digest) return null;
  if (previous.runId !== null && previous.runId === next.runId) {
    return `${next.path} changed but still claims run ${next.runId}; a re-measurement carries a new run id`;
  }
  if (previous.measuredAt !== null && previous.measuredAt === next.measuredAt) {
    return `${next.path} changed but still claims measurement date ${next.measuredAt}`;
  }
  return null;
}

export function auditMeasurements({
  measurementsDir = MEASUREMENTS_DIR,
  ledgerFile = LEDGER_FILE,
  stampMissing = false,
} = {}) {
  const problems = [];
  const ledger = readLedger(ledgerFile);
  const byPath = new Map(ledger.entries.map((entry) => [entry.path, entry]));
  const files = measurementFiles(measurementsDir);
  const audited = [];
  let changed = false;

  for (const relative of files) {
    const absolute = path.join(measurementsDir, relative);
    let artifact;
    try {
      artifact = JSON.parse(fs.readFileSync(absolute, 'utf8'));
    } catch (error) {
      problems.push(`${relative} is not readable JSON: ${error.message}`);
      continue;
    }
    const broken = verifyArtifact(artifact);
    if (broken !== null) {
      if (!stampMissing || !broken.startsWith('carries no')) {
        problems.push(`${relative} ${broken}`);
        continue;
      }
      fs.writeFileSync(absolute, `${JSON.stringify(stamp(artifact), null, 2)}\n`);
      artifact = stamp(artifact);
      changed = true;
    }
    audited.push(relative);
    const entry = ledgerEntryFor(relative, artifact);
    const previous = byPath.get(relative);
    if (previous === undefined) {
      if (!stampMissing) {
        problems.push(`${relative} is not listed in the measurement ledger`);
        continue;
      }
      byPath.set(relative, entry);
      changed = true;
      continue;
    }
    const rewritten = rewriteProblem(previous, entry);
    if (rewritten !== null) {
      problems.push(rewritten);
      continue;
    }
    if (previous.digest !== entry.digest) {
      if (!stampMissing) {
        problems.push(
          `${relative} does not match its ledger digest; re-record it through \`pnpm evals:live\``,
        );
        continue;
      }
      byPath.set(relative, entry);
      changed = true;
    }
  }

  for (const entry of ledger.entries) {
    if (!files.includes(entry.path)) {
      problems.push(`${entry.path} is in the ledger but no longer on disk`);
    }
  }

  if (stampMissing && changed) writeLedger({ entries: [...byPath.values()] }, ledgerFile);
  return { passed: problems.length === 0, problems, audited, changed };
}

/** Records one freshly written artefact, for the live runner. */
export function recordMeasurement(absolutePath, artifact, { ledgerFile = LEDGER_FILE } = {}) {
  const stamped = stamp(artifact);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(stamped, null, 2)}\n`);
  const relative = path.relative(path.dirname(ledgerFile), absolutePath).split(path.sep).join('/');
  const ledger = readLedger(ledgerFile);
  const entries = ledger.entries.filter((entry) => entry.path !== relative);
  entries.push(ledgerEntryFor(relative, stamped));
  writeLedger({ entries }, ledgerFile);
  return stamped;
}

function main() {
  const args = process.argv.slice(2);
  const verdict = auditMeasurements({ stampMissing: args.includes('--stamp') });
  for (const problem of verdict.problems) process.stdout.write(`FAIL ${problem}\n`);
  process.stdout.write(
    `[evals integrity] ${verdict.audited.length} measurement(s): ${verdict.passed ? 'every one matches its digest and its ledger entry' : 'see the failures above'}\n`,
  );
  process.exitCode = verdict.passed ? 0 : 1;
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) main();

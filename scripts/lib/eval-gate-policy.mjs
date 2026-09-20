/**
 * The release gate's thresholds, held to the corpora that declare them and to
 * the tolerances the gate actually reads.
 */

import fs from 'node:fs';
import path from 'node:path';

export const EVALS_ROOT = path.join('tools', 'evals');
export const DATASETS_DIR = path.join(EVALS_ROOT, 'datasets');
export const CONTEXT_SUITES_DIR = path.join(EVALS_ROOT, 'context-suites');
export const CORPUS_DIRS = [DATASETS_DIR, CONTEXT_SUITES_DIR];
export const GATE_POLICY_FILE = path.join(EVALS_ROOT, 'gate-policy.json');
export const PROMOTION_GATE_FILE = path.join(EVALS_ROOT, 'scripts', 'promotion-gate.mjs');

export const HARD_GATE_PRIORITY = 'P0';

const TOLERANCE_READ = /\btolerance\.([A-Za-z][A-Za-z0-9]*)/gu;

/** The tolerances the gate reads, taken from the gate rather than from a list. */
export function toleranceKeysRead(source) {
  const keys = [...new Set([...source.matchAll(TOLERANCE_READ)].map((match) => match[1]))].sort();
  if (keys.length === 0) {
    throw new Error(
      'the promotion gate parsed to no tolerance reads; it moved or changed shape, and this check is measuring nothing',
    );
  }
  return keys;
}

export function corpora(repoRoot, dirs = CORPUS_DIRS) {
  return dirs
    .flatMap((relative) => {
      const dir = path.join(repoRoot, relative);
      return fs
        .readdirSync(dir)
        .filter((entry) => entry.endsWith('.json'))
        .map((entry) => ({
          file: `${relative.split(path.sep).join('/')}/${entry}`,
          ...JSON.parse(fs.readFileSync(path.join(dir, entry), 'utf8')),
        }));
    })
    .sort((left, right) => left.file.localeCompare(right.file));
}

function isThreshold(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1;
}

/**
 * `scoreDropFor` comes from the gate itself, so a change that starts tolerating
 * a drop on a hard-gate corpus fails here rather than passing quietly.
 */
export function auditGatePolicy({ suites, policy, toleranceKeys, scoreDropFor }) {
  const problems = [];
  const declared = new Set(Object.keys(policy.tolerance ?? {}));

  for (const key of toleranceKeys) {
    if (!declared.has(key)) {
      problems.push(`the gate reads tolerance.${key}, which gate-policy.json does not declare`);
      continue;
    }
    const value = policy.tolerance[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      problems.push(`tolerance.${key} is ${JSON.stringify(value)}, which is not a tolerance`);
    }
  }
  for (const key of declared) {
    if (!toleranceKeys.includes(key)) {
      problems.push(`gate-policy.json declares tolerance.${key}, which the gate never reads`);
    }
  }

  const overrides = policy.familyOverrides ?? {};
  for (const [familyId, override] of Object.entries(overrides)) {
    for (const key of Object.keys(override)) {
      if (!toleranceKeys.includes(key)) {
        problems.push(`familyOverrides.${familyId} sets ${key}, which the gate never reads`);
      }
    }
  }

  if (suites.length === 0) {
    problems.push(
      'no corpus declares a suite; the datasets moved and this check is measuring nothing',
    );
  }

  for (const suite of suites) {
    const name = suite.suite ?? suite.file;
    if (!isThreshold(suite.passThreshold)) {
      problems.push(
        `${name} declares passThreshold ${JSON.stringify(suite.passThreshold)}; a suite with no threshold, or a threshold of zero, is not gated`,
      );
    }
    if (suite.priority !== 'P0' && suite.priority !== 'P1') {
      problems.push(
        `${name} declares priority ${JSON.stringify(suite.priority)}; it must be P0 or P1`,
      );
    }
    if (suite.priority !== HARD_GATE_PRIORITY) continue;

    const base = { priority: suite.priority, score: 1, threshold: suite.passThreshold };
    for (const [familyId, tolerance] of [
      ['default', policy.tolerance],
      ...Object.entries(overrides).map(([id, override]) => [
        id,
        { ...policy.tolerance, ...override },
      ]),
    ]) {
      if (scoreDropFor(base, tolerance) !== 0) {
        problems.push(
          `${name} is a hard gate and ${familyId} tolerates a score drop on it; a hard gate is never advisory`,
        );
      }
    }
  }

  return {
    passed: problems.length === 0,
    problems,
    gated: suites.length,
    hardGates: suites.filter((suite) => suite.priority === HARD_GATE_PRIORITY).length,
  };
}

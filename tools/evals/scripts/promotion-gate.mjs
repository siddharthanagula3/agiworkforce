#!/usr/bin/env node
/**
 * Eval regression gate for family promotions.
 *
 * A candidate may take a family slot only when its measured run holds every
 * suite in the family's measured baseline: score within the tolerated drop,
 * mean cost per case and p95 latency within the tolerated increase. Both files
 * are written by `pnpm evals:live`; nothing here is a declared target.
 *
 * Plain Node on purpose: `packages/ai/model-registry/scripts/family-slots.mjs`
 * runs this as a child process, with no TypeScript loader.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const EVALS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MEASUREMENTS_DIR = path.join(EVALS_ROOT, 'measurements');
export const GATE_POLICY_FILE = path.join(EVALS_ROOT, 'gate-policy.json');
const LIVE = 'live';

export function measurementFileName(key) {
  return `${key.replace(/[^A-Za-z0-9._-]+/gu, '__')}.json`;
}

function readJsonIfPresent(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

export function readGatePolicy(file = GATE_POLICY_FILE) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function toleranceFor(policy, familyId) {
  return { ...policy.tolerance, ...(policy.familyOverrides?.[familyId] ?? {}) };
}

function finding(suite, axis, passed, detail) {
  return { suite, axis, passed, detail };
}

function exceeds(candidate, baseline, ratio) {
  return candidate > baseline * (1 + ratio);
}

export function compareToBaseline(baseline, candidate, tolerance) {
  const findings = [];
  const suites = Object.entries(baseline.suites ?? {});
  if (suites.length === 0) {
    return [finding('*', 'baseline', false, 'the baseline measured no suites')];
  }
  for (const [suite, base] of suites) {
    const run = candidate.suites?.[suite];
    if (!run) {
      const reason = candidate.unsupportedSuites?.[suite];
      findings.push(
        finding(
          suite,
          'coverage',
          false,
          reason ? `candidate ${reason}` : 'candidate did not run this suite',
        ),
      );
      continue;
    }
    if (run.version !== base.version) {
      findings.push(
        finding(
          suite,
          'version',
          false,
          `candidate ran v${run.version}, baseline is v${base.version}; re-record both`,
        ),
      );
      continue;
    }
    const floor = base.score - tolerance.scoreDrop;
    findings.push(
      finding(
        suite,
        'score',
        run.score >= floor,
        `score ${run.score.toFixed(3)} vs baseline ${base.score.toFixed(3)} (floor ${floor.toFixed(3)})`,
      ),
    );
    if (base.cost?.meanUsd !== null && base.cost?.meanUsd !== undefined) {
      const mean = run.cost?.meanUsd;
      findings.push(
        typeof mean !== 'number'
          ? finding(suite, 'cost', false, 'baseline was metered, candidate run was not')
          : finding(
              suite,
              'cost',
              !exceeds(mean, base.cost.meanUsd, tolerance.costIncreaseRatio),
              `mean cost ${mean} vs baseline ${base.cost.meanUsd} (tolerance +${tolerance.costIncreaseRatio * 100}%)`,
            ),
      );
    }
    if (base.latency?.p95Ms !== null && base.latency?.p95Ms !== undefined) {
      const p95 = run.latency?.p95Ms;
      findings.push(
        typeof p95 !== 'number'
          ? finding(suite, 'latency', false, 'baseline was timed, candidate run was not')
          : finding(
              suite,
              'latency',
              !exceeds(p95, base.latency.p95Ms, tolerance.latencyP95IncreaseRatio),
              `p95 ${p95} ms vs baseline ${base.latency.p95Ms} ms (tolerance +${tolerance.latencyP95IncreaseRatio * 100}%)`,
            ),
      );
    }
  }
  return findings;
}

function liveProblems(label, report) {
  if (report.source !== LIVE || report.recordingSource !== LIVE) {
    return [`${label} is not a live measurement`];
  }
  return [];
}

export function evaluatePromotionGate({
  familyId,
  candidateModelKey,
  measurementsDir = MEASUREMENTS_DIR,
  policy = readGatePolicy(),
}) {
  const baselineFile = path.join(measurementsDir, 'baselines', measurementFileName(familyId));
  const runFile = path.join(measurementsDir, 'runs', measurementFileName(candidateModelKey));
  const baseline = readJsonIfPresent(baselineFile);
  const candidate = readJsonIfPresent(runFile);
  const refusals = [];
  if (baseline === null) {
    refusals.push(
      `${familyId} has no measured eval baseline; record it from the active model with \`pnpm evals:live --model <active model> --baseline\``,
    );
  }
  if (candidate === null) {
    refusals.push(
      `${candidateModelKey} has no measured eval run; record it with \`pnpm evals:live --model ${candidateModelKey}\``,
    );
  }
  if (refusals.length > 0) return { passed: false, refusals, findings: [] };

  refusals.push(...liveProblems(`baseline for ${familyId}`, baseline));
  refusals.push(...liveProblems(`run for ${candidateModelKey}`, candidate));
  if (baseline.familyId !== familyId)
    refusals.push(`baseline file names family ${baseline.familyId}`);
  if (candidate.modelKey !== candidateModelKey) {
    refusals.push(`run file measured ${candidate.modelKey}, not ${candidateModelKey}`);
  }
  const findings =
    refusals.length > 0
      ? []
      : compareToBaseline(baseline, candidate, toleranceFor(policy, familyId));
  return {
    passed: refusals.length === 0 && findings.every((entry) => entry.passed),
    refusals,
    findings,
  };
}

function argValue(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function main() {
  const args = process.argv.slice(2);
  const familyId = argValue(args, '--family');
  const candidateModelKey = argValue(args, '--candidate');
  if (!familyId || !candidateModelKey) {
    process.stderr.write('usage: promotion-gate.mjs --family <familyId> --candidate <modelKey>\n');
    process.exitCode = 2;
    return;
  }
  const verdict = evaluatePromotionGate({ familyId, candidateModelKey });
  for (const refusal of verdict.refusals) process.stdout.write(`FAIL ${refusal}\n`);
  for (const entry of verdict.findings) {
    process.stdout.write(
      `${entry.passed ? 'pass' : 'FAIL'} ${entry.suite} ${entry.axis}: ${entry.detail}\n`,
    );
  }
  process.stdout.write(
    `[evals gate] ${familyId} <- ${candidateModelKey}: ${verdict.passed ? 'held every baseline' : 'regressed'}\n`,
  );
  process.exitCode = verdict.passed ? 0 : 1;
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) main();

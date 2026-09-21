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

/**
 * The bar a candidate suite has to clear.
 *
 * A measured baseline may raise the bar; it may never lower it under the
 * corpus's own declared threshold. Without that floor a baseline recorded from
 * a model that fails a corpus outright sets the bar at its own failure: the
 * first committed baseline scored 0.000 on the refusal corpus, and comparing
 * against it alone would have let every later model answer every disallowed
 * request and still be promoted. It also means no suite can be averaged away:
 * each is gated on its own floor, and a corpus that declares 1.0 stays at 1.0.
 */
export function scoreFloor(base, tolerance) {
  return Math.max(base.score - scoreDropFor(base, tolerance), base.threshold ?? 0);
}

/**
 * A P0 corpus is the set of rows a release may not regress on at all, so the
 * score tolerance that absorbs noise on a capability corpus does not apply to
 * it. Corpora recorded before priorities existed carry none and keep the
 * default tolerance.
 */
export function scoreDropFor(base, tolerance) {
  return base.priority === 'P0' ? 0 : tolerance.scoreDrop;
}

/**
 * Slice floors, because an aggregate is an average.
 *
 * A suite can hold its headline score while one cut of it collapses: the rows
 * of one family go from passing to failing and an equal number elsewhere go the
 * other way. Every slice the baseline measured is held to its own floor, so the
 * regression surfaces on the slice that moved rather than being averaged away.
 */
function sliceFindings(suite, base, run, tolerance) {
  if (!base.slices) return [];
  if (!run.slices) {
    return [
      finding(
        suite,
        'slices',
        false,
        'baseline carries per-slice scores, candidate run does not; re-record the candidate',
      ),
    ];
  }
  const drop = scoreDropFor(base, tolerance);
  const findings = [];
  for (const [axis, buckets] of Object.entries(base.slices)) {
    for (const [name, baseSlice] of Object.entries(buckets)) {
      const runSlice = run.slices[axis]?.[name];
      if (!runSlice) {
        findings.push(
          finding(suite, `slice ${axis}=${name}`, false, 'candidate run has no such slice'),
        );
        continue;
      }
      const floor = Math.max(baseSlice.score - drop, 0);
      findings.push(
        finding(
          suite,
          `slice ${axis}=${name}`,
          runSlice.score >= floor,
          `score ${runSlice.score.toFixed(3)} vs baseline ${baseSlice.score.toFixed(3)} over ${runSlice.total} rows (floor ${floor.toFixed(3)})`,
        ),
      );
    }
  }
  return findings;
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
    const floor = scoreFloor(base, tolerance);
    findings.push(
      finding(
        suite,
        'score',
        run.score >= floor,
        `score ${run.score.toFixed(3)} vs baseline ${base.score.toFixed(3)} (floor ${floor.toFixed(3)}, corpus threshold ${(base.threshold ?? 0).toFixed(3)}${base.priority ? `, ${base.priority}` : ''})`,
      ),
    );
    findings.push(...sliceFindings(suite, base, run, tolerance));
    if (typeof base.completeness === 'number') {
      const completeness = run.completeness;
      findings.push(
        typeof completeness !== 'number'
          ? finding(
              suite,
              'completeness',
              false,
              'baseline measured completeness, candidate run did not',
            )
          : finding(
              suite,
              'completeness',
              completeness >= base.completeness - tolerance.completenessDrop,
              `completeness ${completeness.toFixed(3)} vs baseline ${base.completeness.toFixed(3)} (tolerance -${tolerance.completenessDrop})`,
            ),
      );
    }
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

/**
 * Compare any two measured runs against each other.
 *
 * The promotion gate answers one question, "may this model take that slot".
 * The same comparison answers two more: whether a route change moved behaviour
 * (measure the new route, compare against the old route's run) and whether a
 * provider moved under a route that did not change (re-measure the same route
 * and compare against its own last run). Pricing drift is checked separately
 * against a third-party snapshot; this is the behaviour half.
 */
export function compareRuns({ baseline, candidate, policy = readGatePolicy(), label = 'run' }) {
  const refusals = [
    ...liveProblems(`${label} baseline`, baseline),
    ...liveProblems(`${label} candidate`, candidate),
  ];
  const findings =
    refusals.length > 0 ? [] : compareToBaseline(baseline, candidate, policy.tolerance);
  return {
    passed: refusals.length === 0 && findings.every((entry) => entry.passed),
    refusals,
    findings,
  };
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

/**
 * Integrity of the committed baselines, for CI.
 *
 * The promotion gate only ever reads the one baseline a promotion names, so a
 * baseline that rots, loses its live provenance or outlives its family slot is
 * invisible until the promotion it was supposed to gate. This walks every
 * committed baseline instead, and fails closed: a malformed, replayed or
 * orphaned baseline is a gate that would have waved a promotion through.
 */
export function autoReleaseFamilyIds(registry) {
  const auto = registry?.policies?.auto;
  if (auto === undefined) return new Set();
  const reachableSlots = new Set([
    ...Object.values(auto.tasks ?? {}).flatMap((task) =>
      Object.values(task.preferredSlots ?? {}).flat(),
    ),
    ...Object.values(auto.tierAllowedSlots ?? {}).flat(),
  ]);
  const reachableModels = new Set(
    [...reachableSlots]
      .map((slotId) => auto.slots?.[slotId]?.modelKey)
      .filter((modelKey) => typeof modelKey === 'string'),
  );
  return new Set(
    Object.entries(registry?.families ?? {})
      .filter(([, family]) => reachableModels.has(family.activeModelKey))
      .map(([familyId]) => familyId),
  );
}

export function auditBaselines({ measurementsDir = MEASUREMENTS_DIR, families, releaseFamilies }) {
  const dir = path.join(measurementsDir, 'baselines');
  const problems = [];
  const unmet = [];
  const releaseUnmet = [];
  const audited = [];
  const entries = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => name.endsWith('.json'))
    : [];
  for (const name of entries) {
    const file = path.join(dir, name);
    let baseline;
    try {
      baseline = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      problems.push(`${name} is not readable JSON: ${error.message}`);
      continue;
    }
    const familyId = baseline.familyId;
    if (typeof familyId !== 'string' || measurementFileName(familyId) !== name) {
      problems.push(`${name} does not name the family slot its filename claims`);
      continue;
    }
    audited.push(familyId);
    if (families !== undefined && families[familyId] === undefined) {
      problems.push(
        `${familyId} has a committed baseline but is not a family slot in the registry`,
      );
    }
    problems.push(...liveProblems(`baseline for ${familyId}`, baseline));
    const suites = Object.entries(baseline.suites ?? {});
    if (suites.length === 0) problems.push(`${familyId} baseline measured no suites`);
    for (const [suite, summary] of suites) {
      if (typeof summary.score !== 'number' || typeof summary.version !== 'number') {
        problems.push(`${familyId} baseline suite ${suite} carries no score or version`);
        continue;
      }
      if (typeof summary.threshold !== 'number') {
        problems.push(`${familyId} baseline suite ${suite} carries no corpus threshold`);
        continue;
      }
      if (summary.met !== true) {
        const reading = `${familyId} ${suite}: measured ${summary.score.toFixed(3)} against corpus threshold ${summary.threshold.toFixed(3)}`;
        unmet.push(reading);
        if (releaseFamilies === undefined || releaseFamilies.has(familyId)) {
          releaseUnmet.push(reading);
        }
      }
    }
  }
  return { passed: problems.length === 0, problems, unmet, releaseUnmet, audited };
}

function argValue(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function runAudit(args) {
  const registryFile =
    argValue(args, '--registry') ??
    path.resolve(EVALS_ROOT, '../../packages/ai/model-registry/generated/registry.json');
  const registry = readJsonIfPresent(registryFile);
  if (registry === null) {
    process.stderr.write(`[evals gate] no model registry at ${registryFile}\n`);
    process.exitCode = 2;
    return;
  }
  const releaseUseOnly = args.includes('--release-use');
  const verdict = auditBaselines({
    families: registry.families,
    ...(releaseUseOnly ? { releaseFamilies: autoReleaseFamilyIds(registry) } : {}),
  });
  for (const problem of verdict.problems) process.stdout.write(`FAIL ${problem}\n`);
  for (const entry of verdict.unmet) {
    const releaseRelevant = verdict.releaseUnmet.includes(entry);
    process.stdout.write(`${releaseRelevant ? 'unmet' : 'inactive-unmet'} ${entry}\n`);
  }
  process.stdout.write(
    `[evals gate] audited ${verdict.audited.length} committed baselines: ${verdict.passed ? 'every one is a live, well-formed measurement of a registry family slot' : 'see the failures above'}\n`,
  );
  process.exitCode = verdict.passed ? 0 : 1;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--audit')) {
    runAudit(args);
    return;
  }
  const familyId = argValue(args, '--family');
  const candidateModelKey = argValue(args, '--candidate');
  if (!familyId || !candidateModelKey) {
    process.stderr.write(
      'usage: promotion-gate.mjs --family <familyId> --candidate <modelKey> | --audit\n',
    );
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

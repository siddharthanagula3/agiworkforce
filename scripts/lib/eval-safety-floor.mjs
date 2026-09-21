/**
 * The release side of the safety floor.
 *
 * Three claims a launch depends on, each answered from the files that decide
 * it rather than from a description of the process:
 *
 *   1. A corpus the product may not regress on carries no score tolerance, so
 *      nothing absorbs a safety drop as noise.
 *   2. A candidate that got cheaper and faster while it got less safe is still
 *      refused. This is executed through the real gate, not restated.
 *   3. A model reaches Auto by occupying a slot, and a slot is written only
 *      after the eval gate has run. A recorded run that fails a corpus it is
 *      held to therefore cannot belong to a model Auto serves.
 */

import fs from 'node:fs';
import path from 'node:path';

export const CORPUS_DIRS = ['tools/evals/datasets', 'tools/evals/context-suites'];
export const RUNS_DIR = 'tools/evals/measurements/runs';
export const BASELINES_DIR = 'tools/evals/measurements/baselines';
export const ROUTING_POLICY_FILE = 'packages/ai/model-registry/catalog/routing-policies.json';
export const FAMILY_CATALOG = 'packages/ai/model-registry/catalog/model-families.json';
export const SLOT_TOOL = 'packages/ai/model-registry/scripts/family-slots.mjs';
export const BASELINE_FILE = 'scripts/config/eval-safety-floor-baseline.json';

/** The priority that means "may not regress at all". */
export const HARD_GATE_PRIORITY = 'P0';

/** Writing this is how a model takes a slot; running this is how it earns one. */
export const SLOT_WRITE = 'applyPromotion';
export const SLOT_GATE = 'evalGateRefusals';

const FAMILY_PREFIX = 'family:';

function readJson(repoRoot, relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolute)) return null;
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

function readJsonDir(repoRoot, relativeDir) {
  const absolute = path.join(repoRoot, relativeDir);
  if (!fs.existsSync(absolute)) return [];
  return fs
    .readdirSync(absolute)
    .filter((entry) => entry.endsWith('.json'))
    .sort()
    .map((entry) => ({
      file: `${relativeDir}/${entry}`,
      body: JSON.parse(fs.readFileSync(path.join(absolute, entry), 'utf8')),
    }));
}

export function hardGateCorpora(repoRoot) {
  return CORPUS_DIRS.flatMap((dir) => readJsonDir(repoRoot, dir))
    .filter((entry) => entry.body.priority === HARD_GATE_PRIORITY)
    .map((entry) => ({ file: entry.file, suite: entry.body.suite }));
}

/**
 * The model keys Auto can dispatch to. A slot naming a family resolves through
 * the family's active model; a slot naming a model or a provider task is taken
 * as it stands.
 */
export function autoServedModelKeys(repoRoot) {
  const policy = readJson(repoRoot, ROUTING_POLICY_FILE);
  const families = readJson(repoRoot, FAMILY_CATALOG);
  if (!policy?.auto?.slots) return null;
  const served = new Set();
  for (const slot of Object.values(policy.auto.slots)) {
    const key = slot?.modelKey;
    if (typeof key !== 'string') continue;
    if (!key.startsWith(FAMILY_PREFIX)) {
      served.add(key);
      continue;
    }
    const active = families?.families?.[key.slice(FAMILY_PREFIX.length)]?.active?.modelKey;
    if (typeof active === 'string') served.add(active);
  }
  return served;
}

export function recordedRuns(repoRoot) {
  return readJsonDir(repoRoot, RUNS_DIR).map((entry) => ({
    file: entry.file,
    modelKey: entry.body.modelKey,
    suites: entry.body.suites ?? {},
  }));
}

/** Suites the run itself marks as held to a hard gate and did not meet. */
export function failedHardGates(run) {
  return Object.entries(run.suites)
    .filter(([, suite]) => suite?.priority === HARD_GATE_PRIORITY)
    .filter(([, suite]) => {
      if (typeof suite.score !== 'number') return true;
      const threshold = typeof suite.threshold === 'number' ? suite.threshold : 0;
      return suite.score < threshold;
    })
    .map(([name]) => name)
    .sort();
}

export function topLevelFunctions(source) {
  const found = [];
  const declaration = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/gm;
  let match;
  while ((match = declaration.exec(source)) !== null) {
    const open = source.indexOf('{', declaration.lastIndex);
    if (open === -1) continue;
    let depth = 0;
    let end = open;
    for (; end < source.length; end += 1) {
      const character = source[end];
      if (character === '{') depth += 1;
      else if (character === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    found.push({ name: match[1], body: source.slice(open, end + 1) });
  }
  return found;
}

function calls(body, name) {
  const match = new RegExp(`\\b${name}\\s*\\(`).exec(body);
  return match ? match.index : -1;
}

export function ungatedSlotWrites(source) {
  return topLevelFunctions(source)
    .filter((fn) => calls(fn.body, SLOT_WRITE) >= 0)
    .filter((fn) => {
      const gate = calls(fn.body, SLOT_GATE);
      return gate < 0 || gate > calls(fn.body, SLOT_WRITE);
    })
    .map((fn) => fn.name)
    .sort();
}

/**
 * The trade, executed rather than argued: a candidate that is cheaper and
 * faster on every suite and worse on one hard-gate corpus.
 */
export function tradeSafetyForCost(corpusSuite) {
  const suite = {
    version: 1,
    threshold: 1,
    priority: HARD_GATE_PRIORITY,
    score: 1,
    cost: { meanUsd: 0.001 },
    latency: { p95Ms: 1000 },
  };
  const baseline = { suites: { [corpusSuite]: suite } };
  const candidate = {
    suites: {
      [corpusSuite]: {
        ...suite,
        score: 0.5,
        cost: { meanUsd: 0.0001 },
        latency: { p95Ms: 100 },
      },
    },
  };
  return { baseline, candidate };
}

/**
 * A model Auto serves whose recorded run fails a hard gate, held to a named
 * decision rather than waved through. An entry may shrink and never grow: a
 * model that is not recorded, or a further corpus under one that is, fails.
 */
export function auditServedFailures(failures, baseline) {
  const recorded = new Map(Object.entries(baseline?.servedBelowThreshold ?? {}));
  const problems = [];
  const fixed = [];

  for (const [modelKey, entry] of recorded) {
    if (!entry?.reason || !entry?.decidedBy || !Array.isArray(entry.suites)) {
      problems.push(
        `the baseline entry for ${modelKey} needs a reason, the suites it covers, and who decides it`,
      );
      continue;
    }
    const failing = failures.get(modelKey) ?? [];
    for (const suite of entry.suites) {
      if (!failing.includes(suite)) fixed.push(`${modelKey}:${suite}`);
    }
  }

  for (const [modelKey, suites] of failures) {
    const entry = recorded.get(modelKey);
    if (!entry) {
      problems.push(
        `${modelKey} is served by Auto and its recorded run is below threshold on ${suites.join(', ')}`,
      );
      continue;
    }
    const covered = new Set(Array.isArray(entry.suites) ? entry.suites : []);
    for (const suite of suites) {
      if (!covered.has(suite)) {
        problems.push(
          `${modelKey} is now below threshold on ${suite} as well, which the baseline does not cover`,
        );
      }
    }
  }

  return { problems, fixed: fixed.sort() };
}

export function audit(repoRoot, { compareToBaseline, scoreDropFor, tolerance, baseline }) {
  const problems = [];

  const corpora = hardGateCorpora(repoRoot);
  if (corpora.length === 0) {
    problems.push(
      `no corpus under ${CORPUS_DIRS.join(' or ')} is marked ${HARD_GATE_PRIORITY}; the priorities moved and this check is measuring nothing`,
    );
  }
  for (const corpus of corpora) {
    const drop = scoreDropFor({ priority: HARD_GATE_PRIORITY }, tolerance);
    if (drop !== 0) {
      problems.push(
        `${corpus.file} is ${HARD_GATE_PRIORITY} and the gate still tolerates a score drop of ${drop}`,
      );
    }
  }

  const suite = corpora[0]?.suite;
  if (suite) {
    const { baseline, candidate } = tradeSafetyForCost(suite);
    const findings = compareToBaseline(baseline, candidate, tolerance);
    if (findings.every((finding) => finding.passed)) {
      problems.push(
        `the gate accepted a candidate that scored worse on ${suite} because it was cheaper and faster`,
      );
    }
  }

  const slotTool = fs.existsSync(path.join(repoRoot, SLOT_TOOL))
    ? fs.readFileSync(path.join(repoRoot, SLOT_TOOL), 'utf8')
    : null;
  if (slotTool === null) {
    problems.push(`${SLOT_TOOL} is missing, so nothing here knows how a model reaches a slot`);
  } else {
    const writes = topLevelFunctions(slotTool).filter((fn) => calls(fn.body, SLOT_WRITE) >= 0);
    if (writes.length === 0) {
      problems.push(`no function in ${SLOT_TOOL} calls ${SLOT_WRITE}; the promotion moved`);
    }
    for (const name of ungatedSlotWrites(slotTool)) {
      problems.push(`${SLOT_TOOL}#${name} writes a slot without running ${SLOT_GATE} first`);
    }
  }

  const served = autoServedModelKeys(repoRoot);
  if (served === null) {
    problems.push(`${ROUTING_POLICY_FILE} declares no Auto slots; the policy moved`);
  }
  const runs = recordedRuns(repoRoot);
  const checked = [];
  const failures = new Map();
  for (const run of runs) {
    if (!served?.has(run.modelKey)) continue;
    checked.push(run.modelKey);
    const failed = failedHardGates(run);
    if (failed.length > 0) failures.set(run.modelKey, failed);
  }
  const served_ = auditServedFailures(failures, baseline);
  problems.push(...served_.problems);

  return {
    problems,
    corpora,
    runs,
    servedRuns: checked.sort(),
    failures,
    fixed: served_.fixed,
  };
}

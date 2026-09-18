#!/usr/bin/env node
/**
 * Release certification gate for a new model (14C.591) and a new route
 * (14C.592).
 *
 * Both checklists lived only as prose, so nothing stopped a model reaching
 * production having answered none of them. This turns each line into a
 * requirement with a named source:
 *
 * - `computed` requirements are derived here from committed evidence, the
 *   model registry and the measurement this directory records. A certification
 *   file cannot assert one; asserting it is itself a failure.
 * - `attested` requirements are the operational facts the repo does not model
 *   (a canary someone watched, a dashboard someone built). They need a name, a
 *   date and evidence, which is a signature, not a checkbox.
 *
 * Plain Node, no TypeScript loader, for the same reason as `promotion-gate.mjs`:
 * CI runs it directly and so can a pre-merge hook.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { MEASUREMENTS_DIR, measurementFileName } from './promotion-gate.mjs';

const EVALS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CERTIFICATIONS_DIR = path.join(EVALS_ROOT, 'certifications');
export const REGISTRY_FILE = path.resolve(
  EVALS_ROOT,
  '../../packages/ai/model-registry/generated/registry.json',
);

export const MODEL_CHECKLIST = '14C.591';
export const ROUTE_CHECKLIST = '14C.592';
const COMPUTED = 'computed';
const ATTESTED = 'attested';
const NO_CACHE = 'no_provider_cache';
const PLACEHOLDERS = new Set(['tbd', 'todo', 'n/a', 'na', 'none', 'pending', '-']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

function ok(detail) {
  return { passed: true, detail };
}

function no(detail) {
  return { passed: false, detail };
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function suiteVerdict(context, suite) {
  const summary = context.run?.suites?.[suite];
  if (summary === undefined) {
    const reason = context.run?.unsupportedSuites?.[suite];
    return reason === undefined
      ? no(`the ${suite} corpus did not run in the committed measurement`)
      : { unsupported: reason };
  }
  return summary.met === true
    ? ok(`${suite} scored ${summary.score.toFixed(3)} against threshold ${summary.threshold}`)
    : no(
        `${suite} scored ${summary.score.toFixed(3)}, under its corpus threshold ${summary.threshold}`,
      );
}

/**
 * A suite whose absence is only acceptable when the registry says the model
 * cannot do it. "Where applicable" is decided by the capability declaration,
 * never by whoever fills in the certification.
 */
function capabilityGatedSuite(context, suite, capability) {
  const verdict = suiteVerdict(context, suite);
  if (verdict.unsupported === undefined) return verdict;
  return context.capabilities[capability] === true
    ? no(`${suite} did not run although the registry declares ${capability}`)
    : ok(`not applicable: the registry does not declare ${capability}`);
}

function requiredSuite(context, suite) {
  const verdict = suiteVerdict(context, suite);
  return verdict.unsupported === undefined
    ? verdict
    : no(`${suite} did not run (${verdict.unsupported}); this corpus has no capability exemption`);
}

function ranSuites(context) {
  return Object.entries(context.run?.suites ?? {});
}

const MODEL_REQUIREMENTS = [
  {
    id: 'lifecycleClassified',
    label: 'lifecycle classified',
    source: COMPUTED,
    evaluate: (context) => {
      const lifecycle = context.model?.lifecycle ?? {};
      return typeof lifecycle.status === 'string' &&
        typeof lifecycle.availability === 'string' &&
        typeof lifecycle.stage === 'string'
        ? ok(`${lifecycle.status}/${lifecycle.availability}, stage ${lifecycle.stage}`)
        : no('the registry records no status, availability or stage for this model');
    },
  },
  {
    id: 'pricingRecorded',
    label: 'pricing recorded',
    source: COMPUTED,
    evaluate: (context) => {
      const pricing = context.route?.pricing ?? {};
      return finite(pricing.inputPerMillion) && finite(pricing.outputPerMillion)
        ? ok(`${pricing.inputPerMillion} in / ${pricing.outputPerMillion} out per million`)
        : no('the default route carries no input and output price');
    },
  },
  { id: 'rateLimitsRecorded', label: 'rate limits recorded', source: ATTESTED },
  {
    id: 'contextOutputLimitsRecorded',
    label: 'context/output limits recorded',
    source: COMPUTED,
    evaluate: (context) => {
      const limits = context.limits;
      return finite(limits.contextTokens) && finite(limits.maxOutputTokens)
        ? ok(`${limits.contextTokens} context / ${limits.maxOutputTokens} output tokens`)
        : no('the registry records no context window or max output tokens');
    },
  },
  {
    id: 'adapterTestsPass',
    label: 'adapter tests pass',
    source: COMPUTED,
    evaluate: (context) => {
      const metered = ranSuites(context).reduce(
        (total, [, summary]) => total + (summary.cost?.meteredCases ?? 0),
        0,
      );
      return metered > 0
        ? ok(`${metered} cases answered through ${context.route.harnessId}`)
        : no(`no case was answered through the ${context.subject.routeId} adapter`);
    },
  },
  {
    id: 'smokeTestsPass',
    label: 'smoke tests pass',
    source: COMPUTED,
    evaluate: (context) => {
      const suites = ranSuites(context);
      if (suites.length === 0) return no('the committed measurement ran no suite');
      const empty = suites.filter(([, summary]) => summary.total === 0).map(([suite]) => suite);
      return empty.length === 0
        ? ok(`${suites.length} corpora answered end to end`)
        : no(`${empty.join(', ')} graded no case`);
    },
  },
  {
    id: 'generalChatEval',
    label: 'general chat eval passes',
    source: COMPUTED,
    evaluate: (context) => requiredSuite(context, 'chat'),
  },
  {
    id: 'toolEval',
    label: 'tool eval passes where applicable',
    source: COMPUTED,
    evaluate: (context) => capabilityGatedSuite(context, 'tools', 'functionCalling'),
  },
  {
    id: 'structuredOutputEval',
    label: 'structured output eval passes',
    source: COMPUTED,
    evaluate: (context) => requiredSuite(context, 'structured-output'),
  },
  {
    id: 'fileEval',
    label: 'file/multimodal eval passes',
    source: COMPUTED,
    evaluate: (context) => requiredSuite(context, 'files'),
  },
  {
    id: 'longContextEval',
    label: 'long-context eval passes',
    source: COMPUTED,
    evaluate: (context) => requiredSuite(context, 'long-context'),
  },
  {
    id: 'safetyEval',
    label: 'safety eval passes',
    source: COMPUTED,
    evaluate: (context) => {
      const golden = requiredSuite(context, 'golden');
      const refusal = requiredSuite(context, 'refusal');
      return golden.passed && refusal.passed
        ? ok(`${golden.detail}; ${refusal.detail}`)
        : no(
            [golden, refusal]
              .filter((entry) => !entry.passed)
              .map((e) => e.detail)
              .join('; '),
          );
    },
  },
  {
    id: 'injectionEval',
    label: 'injection eval passes',
    source: COMPUTED,
    evaluate: (context) => requiredSuite(context, 'jailbreak'),
  },
  {
    id: 'qualityCostLatencyMeasured',
    label: 'quality/cost/latency measured',
    source: COMPUTED,
    evaluate: (context) => {
      const unmeasured = ranSuites(context)
        .filter(([, summary]) => !finite(summary.cost?.meanUsd) || !finite(summary.latency?.p95Ms))
        .map(([suite]) => suite);
      return unmeasured.length === 0
        ? ok(`every corpus reports mean cost and p95 latency`)
        : no(`${unmeasured.join(', ')} carry no metered cost or timing`);
    },
  },
  {
    id: 'routingProfileEligibility',
    label: 'routing profile eligibility calculated',
    source: COMPUTED,
    evaluate: (context) => {
      const computed = routingProfileEligibility(context.registry, context.subject.modelKey);
      const declared = context.record.routingProfiles;
      if (!Array.isArray(declared)) {
        return no(
          `the certification declares no routingProfiles; this model resolves to ${JSON.stringify(computed)}`,
        );
      }
      const left = JSON.stringify(computed);
      const right = JSON.stringify([...declared].sort());
      return left === right
        ? ok(computed.length === 0 ? 'occupies no Auto slot' : `occupies ${computed.join(', ')}`)
        : no(`declared ${right} but the registry resolves ${left}`);
    },
  },
  { id: 'canaryApproved', label: 'canary approved', source: ATTESTED },
  { id: 'rollbackPathReady', label: 'rollback path ready', source: ATTESTED },
  { id: 'docsUpdated', label: 'docs updated', source: ATTESTED },
  { id: 'supportAware', label: 'support aware', source: ATTESTED },
  { id: 'monitoringDashboardReady', label: 'monitoring dashboard ready', source: ATTESTED },
];

const ROUTE_REQUIREMENTS = [
  {
    id: 'sameCanonicalModel',
    label: 'same canonical model validated',
    source: COMPUTED,
    evaluate: (context) => {
      const reference = context.referenceRoute;
      if (reference === null) {
        return no(
          'the certification names no referenceRouteId; a new route is certified against an existing route of the same model',
        );
      }
      return reference.modelKey === context.route.modelKey
        ? ok(`both routes serve ${context.route.modelKey}`)
        : no(`${context.record.referenceRouteId} serves ${reference.modelKey}`);
    },
  },
  {
    id: 'providerIdentity',
    label: 'provider identity',
    source: COMPUTED,
    evaluate: (context) => {
      const harness = context.registry.harnesses?.[context.route.harnessId];
      if (harness === undefined)
        return no(`harness ${context.route.harnessId} is not in the registry`);
      return harness.provider === context.route.provider
        ? ok(`${context.route.provider} via ${context.route.harnessId}`)
        : no(`harness ${context.route.harnessId} belongs to ${harness.provider}`);
    },
  },
  {
    id: 'region',
    label: 'region',
    source: COMPUTED,
    evaluate: (context) => {
      const regions = context.governance?.residencyRegions;
      return Array.isArray(regions) && regions.length > 0
        ? ok(`serves ${regions.join(', ')}`)
        : no(`the registry records no residency region for ${context.route.provider}`);
    },
  },
  {
    id: 'trustClassification',
    label: 'trust classification',
    source: COMPUTED,
    evaluate: (context) => {
      const modes = context.route.trustModes;
      const governance = context.governance ?? {};
      if (!Array.isArray(modes) || modes.length === 0)
        return no('the route declares no trust mode');
      if (typeof context.route.dataRetention !== 'string') {
        return no('the route declares no data retention class');
      }
      return typeof governance.zeroDataRetentionAvailability === 'string'
        ? ok(
            `${modes.join('/')}, retention ${context.route.dataRetention}, ZDR ${governance.zeroDataRetentionAvailability}`,
          )
        : no(`${context.route.provider} has no zero-data-retention classification`);
    },
  },
  {
    id: 'exactModelConfirmed',
    label: 'exact model confirmed',
    source: COMPUTED,
    evaluate: (context) =>
      context.run?.routeId === context.subject.routeId
        ? ok(`measured through ${context.subject.routeId} as ${context.route.providerModelId}`)
        : no(
            `the committed measurement was recorded through ${context.run?.routeId ?? 'no route'}, not ${context.subject.routeId}`,
          ),
  },
  {
    id: 'apiCompatibilityVerified',
    label: 'API compatibility verified',
    source: COMPUTED,
    evaluate: (context) => {
      const harness = context.registry.harnesses?.[context.route.harnessId] ?? {};
      const graded = ranSuites(context).reduce((total, [, summary]) => total + summary.total, 0);
      return typeof harness.apiFamily === 'string' && graded > 0
        ? ok(`${graded} cases answered over ${harness.apiFamily}`)
        : no('no graded case proves this route speaks its declared API family');
    },
  },
  {
    id: 'streamingVerified',
    label: 'streaming verified',
    source: COMPUTED,
    evaluate: (context) => {
      const streamed = ranSuites(context).some(([, summary]) => finite(summary.latency?.ttfbP50Ms));
      if (context.capabilities['streaming'] !== true) {
        return ok('not applicable: the registry does not declare streaming');
      }
      return streamed
        ? ok('time to first token was measured on the streamed responses')
        : no('the registry declares streaming but no response reported a time to first token');
    },
  },
  {
    id: 'toolsVerified',
    label: 'tools verified',
    source: COMPUTED,
    evaluate: (context) => capabilityGatedSuite(context, 'tools', 'functionCalling'),
  },
  {
    id: 'filesVerified',
    label: 'files verified',
    source: COMPUTED,
    evaluate: (context) => requiredSuite(context, 'files'),
  },
  {
    id: 'cachingVerified',
    label: 'caching verified',
    source: COMPUTED,
    evaluate: (context) => {
      const cacheClass = context.route.cacheClass;
      if (typeof cacheClass !== 'string') return no('the route declares no cache class');
      if (cacheClass === NO_CACHE) return ok('the route declares no provider cache');
      const cache = context.cacheUsage;
      if (cache === null) return no('no committed recording to read cache usage from');
      return cache.readTokens > 0 || cache.writeTokens > 0
        ? ok(
            `${cacheClass}: ${cache.readTokens} cache-read and ${cache.writeTokens} cache-write tokens over ${cache.cases} answers`,
          )
        : no(
            `${cacheClass} is declared but the recorded run reported no cache-read or cache-write tokens over ${cache.cases} answers`,
          );
    },
  },
  { id: 'providerStateVerified', label: 'provider state verified', source: ATTESTED },
  {
    id: 'usageVerified',
    label: 'usage verified',
    source: COMPUTED,
    evaluate: (context) => {
      const usage = context.tokenUsage;
      if (usage === null) return no('no committed recording to read usage from');
      return usage.missing === 0
        ? ok(`${usage.cases} answers all reported input and output tokens`)
        : no(`${usage.missing} of ${usage.cases} answers reported no token usage`);
    },
  },
  { id: 'errorMappingVerified', label: 'error mapping verified', source: ATTESTED },
  {
    id: 'latencyMeasured',
    label: 'latency measured',
    source: COMPUTED,
    evaluate: (context) => {
      const untimed = ranSuites(context)
        .filter(([, summary]) => !finite(summary.latency?.p95Ms))
        .map(([suite]) => suite);
      return untimed.length === 0
        ? ok('every corpus reports p95 latency')
        : no(`${untimed.join(', ')} are untimed`);
    },
  },
  {
    id: 'costMeasured',
    label: 'cost measured',
    source: COMPUTED,
    evaluate: (context) => {
      const unmetered = ranSuites(context)
        .filter(([, summary]) => !finite(summary.cost?.meanUsd))
        .map(([suite]) => suite);
      return unmetered.length === 0
        ? ok('every corpus reports mean cost per case')
        : no(`${unmetered.join(', ')} are unmetered`);
    },
  },
  {
    id: 'routeEquivalenceApproved',
    label: 'route equivalence approved',
    source: COMPUTED,
    evaluate: (context) => {
      if (context.referenceRun === null) {
        return no(
          `no committed measurement for the reference route ${context.record.referenceRouteId ?? '(unnamed)'}; record it with \`pnpm evals:live --model ${context.route.modelKey} --route <referenceRouteId>\``,
        );
      }
      const divergent = compareRoutes(context.referenceRun, context.run, context.tolerance);
      return divergent.length === 0
        ? ok(`every corpus matches ${context.record.referenceRouteId} within tolerance`)
        : no(divergent.join('; '));
    },
  },
  { id: 'failoverTest', label: 'failover test', source: ATTESTED },
  { id: 'canary', label: 'canary', source: ATTESTED },
  { id: 'breaker', label: 'breaker', source: ATTESTED },
  { id: 'rollback', label: 'rollback', source: ATTESTED },
];

export const REQUIREMENTS = { model: MODEL_REQUIREMENTS, route: ROUTE_REQUIREMENTS };
export const CHECKLISTS = { model: MODEL_CHECKLIST, route: ROUTE_CHECKLIST };

/**
 * Every Auto slot the model occupies, with the plan tiers that may reach it.
 * This is the "routing profile eligibility" the checklist asks to be
 * calculated: a certification declares the answer and the gate recomputes it,
 * so a stale claim fails rather than reads well.
 */
export function routingProfileEligibility(registry, modelKey) {
  const auto = registry.policies?.auto ?? {};
  const slots = Object.entries(auto.slots ?? {}).filter(([, slot]) => slot.modelKey === modelKey);
  const tiersBySlot = new Map();
  for (const [tier, allowed] of Object.entries(auto.tierAllowedSlots ?? {})) {
    for (const slot of allowed) {
      if (!tiersBySlot.has(slot)) tiersBySlot.set(slot, []);
      tiersBySlot.get(slot).push(tier);
    }
  }
  return slots
    .map(([slotId]) => {
      const tiers = (tiersBySlot.get(slotId) ?? []).sort();
      return tiers.length === 0 ? slotId : `${slotId}:${tiers.join('+')}`;
    })
    .sort();
}

/**
 * Two routes of one model have to answer the same corpora the same way. The
 * comparison is per suite and per axis, never an average: a route that loses
 * the refusal corpus is not equivalent because it got faster.
 */
export function compareRoutes(reference, candidate, tolerance) {
  const divergent = [];
  for (const [suite, base] of Object.entries(reference.suites ?? {})) {
    const run = candidate.suites?.[suite];
    if (run === undefined) {
      divergent.push(`${suite} did not run on the new route`);
      continue;
    }
    if (run.version !== base.version) {
      divergent.push(`${suite} ran corpus v${run.version} against v${base.version}`);
      continue;
    }
    const floor = Math.max(base.score - tolerance.scoreDrop, base.threshold ?? 0);
    if (run.score < floor) {
      divergent.push(
        `${suite} scored ${run.score.toFixed(3)} against a floor of ${floor.toFixed(3)}`,
      );
    }
  }
  return divergent;
}

function readJsonIfPresent(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

function summariseRecording(file) {
  const recording = readJsonIfPresent(file);
  if (recording === null) return { cacheUsage: null, tokenUsage: null };
  const responses = Object.values(recording.responses ?? {});
  let readTokens = 0;
  let writeTokens = 0;
  let missing = 0;
  for (const entry of responses) {
    const usage = entry.response?.usage ?? {};
    readTokens += usage.cacheReadTokens ?? 0;
    writeTokens += usage.cacheWriteTokens ?? 0;
    if (!finite(usage.inputTokens) || !finite(usage.outputTokens)) missing += 1;
  }
  return {
    cacheUsage: { readTokens, writeTokens, cases: responses.length },
    tokenUsage: { cases: responses.length, missing },
  };
}

function attestationProblem(requirement, record) {
  const entry = record.attestations?.[requirement.id];
  if (entry === undefined || entry === null) {
    return `no attestation for "${requirement.label}"`;
  }
  const by = typeof entry.by === 'string' ? entry.by.trim() : '';
  const on = typeof entry.on === 'string' ? entry.on.trim() : '';
  const evidence = typeof entry.evidence === 'string' ? entry.evidence.trim() : '';
  if (by.length === 0) return `"${requirement.label}" is attested by nobody`;
  if (!ISO_DATE.test(on)) return `"${requirement.label}" carries no ISO date`;
  if (evidence.length === 0 || PLACEHOLDERS.has(evidence.toLowerCase())) {
    return `"${requirement.label}" carries no evidence, only ${JSON.stringify(evidence)}`;
  }
  return null;
}

export function certificationFileName(subject) {
  return measurementFileName(subject.kind === 'route' ? subject.routeId : subject.modelKey);
}

/**
 * The measurement a subject is certified from. A route is measured through
 * itself; a model through whichever route it defaults to, which is the file
 * `pnpm evals:live` writes without `--route`.
 */
export function measurementKeyFor(subject, registry) {
  if (subject.kind === 'model') return subject.modelKey;
  const route = registry.routes?.[subject.routeId];
  const isDefault = route?.isDefault === true;
  return isDefault ? route.modelKey : subject.routeId;
}

export function evaluateCertification({
  subject,
  registry,
  certificationsDir = CERTIFICATIONS_DIR,
  measurementsDir = MEASUREMENTS_DIR,
  tolerance = { scoreDrop: 0.05 },
}) {
  const refusals = [];
  const recordFile = path.join(certificationsDir, certificationFileName(subject));
  const record = readJsonIfPresent(recordFile);
  if (record === null) {
    return {
      passed: false,
      subject,
      checklist: CHECKLISTS[subject.kind],
      refusals: [
        `${subject.kind} ${subject.routeId ?? subject.modelKey} has no ${CHECKLISTS[subject.kind]} certification; add ${path.relative(EVALS_ROOT, recordFile)}`,
      ],
      results: [],
    };
  }

  const declared = record.subject ?? {};
  const declaredKey = declared.kind === 'route' ? declared.routeId : declared.modelKey;
  if (declared.kind !== subject.kind || declaredKey !== (subject.routeId ?? subject.modelKey)) {
    refusals.push(
      `${path.basename(recordFile)} certifies ${declared.kind ?? 'nothing'} ${declaredKey ?? '(unnamed)'}, not ${subject.kind} ${subject.routeId ?? subject.modelKey}`,
    );
    return { passed: false, subject, checklist: CHECKLISTS[subject.kind], refusals, results: [] };
  }

  const route =
    subject.kind === 'route'
      ? registry.routes?.[subject.routeId]
      : Object.values(registry.routes ?? {}).find(
          (entry) => entry.modelKey === subject.modelKey && entry.isDefault,
        );
  const routeId =
    subject.kind === 'route'
      ? subject.routeId
      : Object.entries(registry.routes ?? {}).find(
          ([, entry]) => entry.modelKey === subject.modelKey && entry.isDefault,
        )?.[0];
  if (route === undefined) {
    refusals.push(
      subject.kind === 'route'
        ? `${subject.routeId} is not a route in the model registry`
        : `${subject.modelKey} has no default route in the model registry`,
    );
  }
  const modelKey = subject.kind === 'route' ? route?.modelKey : subject.modelKey;
  const model = modelKey === undefined ? undefined : registry.models?.[modelKey];
  if (model === undefined) refusals.push(`${modelKey ?? subject.modelKey} is not a registry model`);
  if (refusals.length > 0) {
    return { passed: false, subject, checklist: CHECKLISTS[subject.kind], refusals, results: [] };
  }

  const resolved = { ...subject, modelKey, routeId: subject.routeId ?? routeId };
  const measurementKey = measurementKeyFor(resolved, registry);
  const runFile = path.join(measurementsDir, 'runs', measurementFileName(measurementKey));
  const run = readJsonIfPresent(runFile);
  if (run === null) {
    refusals.push(
      `${measurementKey} has no committed eval measurement; record it with \`pnpm evals:live --model ${modelKey}${subject.kind === 'route' ? ` --route ${subject.routeId}` : ''}\``,
    );
  } else if (run.source !== 'live' || run.recordingSource !== 'live') {
    refusals.push(`the measurement for ${measurementKey} is not a live run`);
  }
  if (refusals.length > 0) {
    return {
      passed: false,
      subject: resolved,
      checklist: CHECKLISTS[subject.kind],
      refusals,
      results: [],
    };
  }

  const referenceRouteId = record.referenceRouteId;
  const referenceRoute =
    typeof referenceRouteId === 'string' ? (registry.routes?.[referenceRouteId] ?? null) : null;
  const referenceRun =
    referenceRoute === null
      ? null
      : readJsonIfPresent(
          path.join(
            measurementsDir,
            'runs',
            measurementFileName(
              measurementKeyFor({ kind: 'route', routeId: referenceRouteId }, registry),
            ),
          ),
        );

  const { cacheUsage, tokenUsage } = summariseRecording(
    path.join(measurementsDir, 'recordings', measurementFileName(measurementKey)),
  );

  const context = {
    subject: resolved,
    registry,
    record,
    run,
    route,
    model,
    capabilities: registry.capabilities?.[modelKey] ?? {},
    limits: registry.limits?.[modelKey] ?? {},
    governance: registry.governance?.[route.provider] ?? null,
    referenceRoute,
    referenceRun,
    cacheUsage,
    tokenUsage,
    tolerance,
  };

  const results = REQUIREMENTS[subject.kind].map((requirement) => {
    if (requirement.source === ATTESTED) {
      const problem = attestationProblem(requirement, record);
      return {
        id: requirement.id,
        label: requirement.label,
        source: ATTESTED,
        passed: problem === null,
        detail: problem ?? `attested by ${record.attestations[requirement.id].by}`,
      };
    }
    if (record.attestations?.[requirement.id] !== undefined) {
      return {
        id: requirement.id,
        label: requirement.label,
        source: COMPUTED,
        passed: false,
        detail: `"${requirement.label}" is computed from the committed measurement and may not be attested`,
      };
    }
    const verdict = requirement.evaluate(context);
    return { id: requirement.id, label: requirement.label, source: COMPUTED, ...verdict };
  });

  return {
    passed: results.every((entry) => entry.passed),
    subject: resolved,
    checklist: CHECKLISTS[subject.kind],
    refusals,
    results,
  };
}

/**
 * Models and routes this branch adds. A certification is demanded for what is
 * new, not for the whole registry: the existing catalog predates this gate and
 * re-certifying it is a decision, not a merge check.
 */
export function addedSubjects(baseRegistry, headRegistry) {
  const models = Object.keys(headRegistry.models ?? {}).filter(
    (key) => baseRegistry.models?.[key] === undefined,
  );
  const routes = Object.keys(headRegistry.routes ?? {}).filter(
    (id) => baseRegistry.routes?.[id] === undefined,
  );
  const addedModels = new Set(models);
  return [
    ...models.map((modelKey) => ({ kind: 'model', modelKey })),
    ...routes
      .filter((routeId) => !addedModels.has(headRegistry.routes[routeId].modelKey))
      .map((routeId) => ({ kind: 'route', routeId })),
  ];
}

function argValue(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function registryAt(ref, file) {
  const relative = path.relative(process.cwd(), file);
  const raw = execFileSync('git', ['show', `${ref}:${relative}`], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return JSON.parse(raw);
}

function report(verdict) {
  process.stdout.write(
    `\n[evals certification] ${verdict.checklist} ${verdict.subject.kind} ${verdict.subject.routeId ?? verdict.subject.modelKey}\n`,
  );
  for (const refusal of verdict.refusals) process.stdout.write(`  FAIL ${refusal}\n`);
  for (const entry of verdict.results) {
    process.stdout.write(
      `  ${entry.passed ? 'pass' : 'FAIL'} [${entry.source}] ${entry.label}: ${entry.detail}\n`,
    );
  }
}

function main() {
  const args = process.argv.slice(2);
  const registryFile = argValue(args, '--registry') ?? REGISTRY_FILE;
  const registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
  const base = argValue(args, '--base');
  const modelKey = argValue(args, '--model');
  const routeId = argValue(args, '--route');

  let subjects;
  if (modelKey !== undefined) subjects = [{ kind: 'model', modelKey }];
  else if (routeId !== undefined) subjects = [{ kind: 'route', routeId }];
  else if (base !== undefined) subjects = addedSubjects(registryAt(base, registryFile), registry);
  else {
    process.stderr.write(
      'usage: certification-gate.mjs --model <modelKey> | --route <routeId> | --base <ref>\n',
    );
    process.exitCode = 2;
    return;
  }

  if (subjects.length === 0) {
    process.stdout.write('[evals certification] this branch adds no model and no route\n');
    return;
  }

  let failed = false;
  for (const subject of subjects) {
    const verdict = evaluateCertification({ subject, registry });
    report(verdict);
    if (!verdict.passed) failed = true;
  }
  process.stdout.write(
    `\n[evals certification] ${subjects.length} subject(s): ${failed ? 'not certified' : 'certified'}\n`,
  );
  process.exitCode = failed ? 1 : 0;
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) main();

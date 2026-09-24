// Live benchmark for the semantic decision candidates. It makes REAL calls and
// is never part of `pnpm test`. Run it with the tsconfig in this directory:
//
//   JEV_EVAL_ENV_FILE=<file> pnpm exec tsx \
//     --tsconfig tools/evals/semantic-decisions/tsconfig.json \
//     tools/evals/semantic-decisions/bench.mts --date=<iso> [--suites=a,b] [--dry-run]
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createDecisionEvaluator,
  type DecisionOutcome,
  type DecisionPolicy,
  type DecisionRequest,
} from '@agiworkforce/agent-core';
import { createTypeSafeDecisionProvider } from '@agiworkforce/provider-runtime/decisions';
import { TASK_FAMILY_INTENDED_TASK_TYPES, type TaskFamily } from '@agiworkforce/routing';

import {
  buildToolShortlistRequest,
  partitionCandidates,
  selectShortlist,
  TOOL_SHORTLIST_VERSION,
  type ShortlistCandidate,
} from '@/lib/services/semantic-decisions/questions/connector-tool-shortlist';
import {
  buildMemoryRelevanceRequest,
  MEMORY_RELEVANCE_VERSION,
  selectMemories,
  type MemoryCandidate,
} from '@/lib/services/semantic-decisions/questions/memory-relevance';
import {
  buildMemoryWorthExtractingRequest,
  MEMORY_WORTH_EXTRACTING_VERSION,
  WORTH_EXTRACTING_KEY,
} from '@/lib/services/semantic-decisions/questions/memory-worth-extracting';
import {
  buildTurnSignalsRequest,
  TURN_SIGNALS_VERSION,
} from '@/lib/services/semantic-decisions/questions/turn-signals';
import { DECISION_BUDGETS } from '@/lib/services/semantic-decisions/policy';

import {
  buildElementResolutionRequest,
  ELEMENT_QUESTION_KEY,
  ELEMENT_RESOLUTION_BUDGET,
  ELEMENT_RESOLUTION_VERSION,
  interpretElementChoice,
  NO_ELEMENT,
  parsePageElements,
  resolveByExactLabel,
} from './questions/element-resolution.mts';
import {
  buildReviewSecurityGateRequest,
  interpretSecurityGate,
  REVIEW_SECURITY_GATE_VERSION,
  SECURITY_GATE_BUDGET,
  SECURITY_GATE_KEY,
  securityGateDecidedByPath,
} from './questions/review-security-gate.mts';
import {
  bySplit,
  chooseThreshold,
  countErrors,
  latencyAndCost,
  noulConfidence,
  outcomeOf,
  reliability,
  round,
  scoreBinary,
  scoreCategory,
  scoreSets,
  sliceByTag,
  thresholdLadder,
  type BinaryRow,
  type CaseRun,
  type CategoryRow,
  type SetRow,
  type Split,
} from './bench-scoring.mts';

const directory = fileURLToPath(new URL('.', import.meta.url));
const suitesDir = resolve(directory, 'suites');
const resultsDir = resolve(directory, 'results');

function flag(name: string): string | undefined {
  const found = process.argv.find((one) => one.startsWith(`--${name}=`));
  return found?.slice(name.length + 3);
}

const DRY_RUN = process.argv.includes('--dry-run');
// Scoring is pure and the answers are already on disk, so a correction to a
// metric is re-derived from the recorded run rather than re-billed.
const RESCORE = process.argv.includes('--rescore');
// Scripts may not call Date.now() for anything that affects scoring, so the
// run date is passed in and recorded rather than read.
const RUN_DATE = flag('date');
if (!RUN_DATE || Number.isNaN(Date.parse(RUN_DATE))) {
  throw new Error('bench.mts requires --date=<iso date>, which is recorded in the results');
}
const CONCURRENCY = Number(flag('concurrency') ?? 4);
if (!Number.isSafeInteger(CONCURRENCY) || CONCURRENCY < 1) throw new Error('Invalid concurrency');

const SUITE_IDS = [
  'turn_signals',
  'connector_tool_shortlist',
  'memory_relevance',
  'memory_worth_extracting',
  'review_security_gate',
  'element_resolution',
] as const;
type SuiteId = (typeof SUITE_IDS)[number];

const selected = (flag('suites')?.split(',').filter(Boolean) ?? SUITE_IDS) as SuiteId[];
for (const one of selected) {
  if (!SUITE_IDS.includes(one)) throw new Error(`Unknown suite ${one}`);
}

// ---------------------------------------------------------------- transport

const envFile = process.env['JEV_EVAL_ENV_FILE'];
if (envFile) process.loadEnvFile(envFile);

function required(name: string): string {
  const value = process.env[name];
  // The name, never the value.
  if (!value?.trim()) throw new Error(`Missing ${name}: refusing to run live`);
  return value.trim();
}

const OFFLINE = DRY_RUN || RESCORE;
const MODEL = OFFLINE ? (flag('model') ?? 'offline-no-model') : required('TYPESAFE_MODEL');
const USD_PER_MILLION_INPUT = OFFLINE
  ? Number(flag('usd-per-mtok') ?? 0)
  : Number(required('TYPESAFE_INPUT_MICROUSD_PER_MTOK')) / 1_000_000;
if (!Number.isFinite(USD_PER_MILLION_INPUT) || USD_PER_MILLION_INPUT < 0) {
  throw new Error('Invalid TYPESAFE_INPUT_MICROUSD_PER_MTOK');
}

const TIMEOUT_MS = 60_000;
const MAX_RATE_LIMIT_RETRIES = 6;
const RATE_LIMIT_BASE_MS = 1_000;
const RATE_LIMIT_MAX_WAIT_MS = 30_000;
const RATE_LIMIT_BUDGET_MS = 300_000;
/** Refuse to start a run whose projected input would be a surprise. */
const MAX_PROJECTED_INPUT_TOKENS = 20_000_000;
const CHARS_PER_TOKEN = 4;

const transportCounters = { retries: 0, rateLimited: 0, backoffMs: 0 };

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

// SDK retries stay at zero; a 429 is the one status worth waiting out, and it
// waits inside an overall budget so a throttled endpoint cannot stall the run.
const benchFetch: typeof globalThis.fetch = async (input, init) => {
  for (let attempt = 0; ; attempt += 1) {
    const response = await globalThis.fetch(input, init);
    if (
      response.status !== 429 ||
      attempt >= MAX_RATE_LIMIT_RETRIES ||
      transportCounters.backoffMs >= RATE_LIMIT_BUDGET_MS
    ) {
      return response;
    }
    const retryAfter = Number(response.headers.get('retry-after'));
    const waitMs = Math.min(
      RATE_LIMIT_MAX_WAIT_MS,
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1_000
        : RATE_LIMIT_BASE_MS * 2 ** attempt,
    );
    transportCounters.rateLimited += 1;
    transportCounters.retries += 1;
    transportCounters.backoffMs += waitMs;
    await response.body?.cancel();
    await sleep(waitMs);
  }
};

const provider = OFFLINE
  ? null
  : createTypeSafeDecisionProvider({
      apiKey: required('TYPESAFE_API_KEY'),
      baseURL: required('TYPESAFE_BASE_URL'),
      model: MODEL,
      timeoutMs: TIMEOUT_MS,
      maxRetries: 0,
      fetch: benchFetch,
    });

interface Budget {
  maxQuestions: number;
  maxRequestBytes: number;
}

function policyFor(budget: Budget): DecisionPolicy {
  return {
    mode: 'enabled',
    model: MODEL,
    timeoutMs: TIMEOUT_MS,
    maxRequestBytes: budget.maxRequestBytes,
    maxQuestions: budget.maxQuestions,
    maxConcurrent: CONCURRENCY,
    sampleRate: 1,
  };
}

// ------------------------------------------------------------------ planning

interface Planned {
  id: string;
  split: Split;
  tags: string[];
  request: DecisionRequest | null;
  codeAnswer: string | null;
}

interface EvalCase {
  id: string;
  input: Record<string, unknown>;
  meta: { tags: string[]; split?: Split };
}

function readJson<T>(...parts: string[]): T {
  return JSON.parse(readFileSync(resolve(...parts), 'utf8')) as T;
}

function loadCases(suite: SuiteId): EvalCase[] {
  return readJson<{ cases: EvalCase[] }>(suitesDir, suite, 'cases.json').cases;
}

function loadLabels(suite: SuiteId): Record<string, Record<string, unknown>> {
  return readJson<{ labels: Record<string, Record<string, unknown>> }>(
    suitesDir,
    suite,
    'labels.final.json',
  ).labels;
}

function loadBaseline(suite: SuiteId): Record<string, unknown> {
  return readJson<Record<string, unknown>>(suitesDir, suite, 'baseline.json');
}

function requestBytes(request: DecisionRequest): number {
  return new TextEncoder().encode(JSON.stringify(request)).byteLength;
}

// --------------------------------------------------------------- execution

async function execute(suite: SuiteId, planned: Planned[], budget: Budget): Promise<CaseRun[]> {
  if (RESCORE) {
    const recorded = readJson<{ rows: CaseRun[] }>(resultsDir, `${suite}.json`).rows;
    const byId = new Map(recorded.map((row) => [row.id, row]));
    const missing = planned.filter((one) => !byId.has(one.id)).map((one) => one.id);
    if (missing.length > 0) throw new Error(`${suite}: no recorded run for ${missing.join(', ')}`);
    return planned.map((one) => byId.get(one.id)!);
  }

  const runs = new Map<string, CaseRun>();
  const pending: Planned[] = [];

  for (const one of planned) {
    const base = {
      id: one.id,
      split: one.split,
      tags: one.tags,
      reason: null,
      latencyMs: null,
      inputTokens: null,
      outputTokens: null,
      questionCount: one.request ? Object.keys(one.request.questions).length : 0,
      requestBytes: one.request ? requestBytes(one.request) : 0,
      answers: {},
      codeAnswer: one.codeAnswer,
    } satisfies Omit<CaseRun, 'status'>;
    if (!one.request || Object.keys(one.request.questions).length === 0) {
      runs.set(one.id, { ...base, status: one.codeAnswer ? 'decided_by_code' : 'skipped' });
      continue;
    }
    // Never truncated: production has no split for these kinds, so a request
    // that does not fit the budget is reported rather than trimmed.
    if (base.questionCount > budget.maxQuestions || base.requestBytes > budget.maxRequestBytes) {
      runs.set(one.id, { ...base, status: 'over_budget' });
      continue;
    }
    runs.set(one.id, { ...base, status: 'fallback', reason: 'not_run' });
    pending.push(one);
  }

  if (DRY_RUN || !provider) return [...runs.values()];

  const evaluate = createDecisionEvaluator({
    kind: `bench_${suite}`,
    provider,
    policy: () => policyFor(budget),
  });

  let next = 0;
  const worker = async () => {
    for (;;) {
      const index = next;
      next += 1;
      const one = pending[index];
      if (!one?.request) return;
      const outcome: DecisionOutcome = await evaluate(one.request, {
        trustMode: 'managed',
        providerAllowed: true,
        cohort: 0,
      });
      const current = runs.get(one.id)!;
      runs.set(
        one.id,
        outcome.status === 'fallback'
          ? { ...current, status: 'fallback', reason: outcome.reason, latencyMs: outcome.latencyMs }
          : {
              ...current,
              status: 'answered',
              reason: null,
              latencyMs: outcome.latencyMs,
              inputTokens: outcome.result.inputTokens,
              outputTokens: outcome.result.outputTokens,
              answers: outcome.result.answers,
            },
      );
      if ((index + 1) % 20 === 0) {
        process.stdout.write(`  ${suite}: ${index + 1}/${pending.length}\n`);
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return planned.map((one) => runs.get(one.id)!);
}

// ------------------------------------------------------------------- suites

interface SuiteReport {
  suite: SuiteId;
  objective: string;
  questionVersion: number;
  fixtureSha256: string;
  budget: Budget;
  chosen: Record<string, number>;
  sweep: unknown;
  production: unknown;
  ungated: unknown;
  gated: unknown;
  reliability: unknown;
  byTag: unknown;
  extra?: Record<string, unknown>;
}

function fixtureHash(suite: SuiteId, files: string[]): string {
  const hash = createHash('sha256');
  for (const file of files) hash.update(readFileSync(resolve(suitesDir, suite, file)));
  return hash.digest('hex');
}

function splitOf(one: EvalCase): Split {
  return (one.meta.split ?? 'heldout') as Split;
}

function noulOf(run: CaseRun, key: string): number | null {
  const answer = run.answers[key];
  return answer?.kind === 'boolean' ? answer.probability : null;
}

/* ------------------------------ memory_worth_extracting ------------------ */

function planWorthExtracting(cases: EvalCase[]): Planned[] {
  return cases.map((one) => ({
    id: one.id,
    split: splitOf(one),
    tags: one.meta.tags,
    request: buildMemoryWorthExtractingRequest(String(one.input['message'] ?? '')),
    codeAnswer: null,
  }));
}

function scoreWorthExtracting(runs: CaseRun[]): SuiteReport {
  const labels = loadLabels('memory_worth_extracting');
  const baseline = loadBaseline('memory_worth_extracting');
  const baselineRows = (baseline['rows'] as { id: string; prediction: string }[]).reduce(
    (map, row) => map.set(row.id, row.prediction === 'yes'),
    new Map<string, boolean>(),
  );

  const rowsAt = (extractAbove: number, gate: number): BinaryRow[] =>
    runs.map((run) => {
      const label = labels[run.id] as { label: string | null; scored: boolean } | undefined;
      const probability = noulOf(run, WORTH_EXTRACTING_KEY);
      const used = probability !== null && noulConfidence(probability) >= gate;
      return {
        id: run.id,
        split: run.split,
        tags: run.tags,
        scored: label?.scored === true,
        expected: label?.label === 'yes',
        predicted: used ? probability >= extractAbove : (baselineRows.get(run.id) ?? true),
        used,
      };
    });

  // A missed durable fact is silent and never retried; a false positive is one
  // post-turn extraction call. The suite README prices the miss far higher, so
  // the objective weights a false negative at four false positives.
  const FALSE_NEGATIVE_WEIGHT = 4;
  const objective = (rows: BinaryRow[]) => {
    const score = scoreBinary(rows.filter((row) => row.split === 'calibration'));
    if (score.scored === 0) return null;
    return -(score.falseNegatives * FALSE_NEGATIVE_WEIGHT + score.falsePositives) / score.scored;
  };

  const extract = chooseThreshold(thresholdLadder(), (t) => objective(rowsAt(t, 0)));
  const gate = chooseThreshold(thresholdLadder(0.1), (g) => objective(rowsAt(extract.chosen, g)));
  const final = rowsAt(extract.chosen, gate.chosen);
  const ungated = rowsAt(extract.chosen, 0);

  const correctness = runs.map((run) => {
    const row = final.find((one) => one.id === run.id)!;
    const probability = noulOf(run, WORTH_EXTRACTING_KEY);
    return {
      confidence: probability === null ? null : noulConfidence(probability),
      correct: row.predicted === row.expected,
      scored: row.scored,
    };
  });

  return {
    suite: 'memory_worth_extracting',
    objective: `minimise (${FALSE_NEGATIVE_WEIGHT} x false negatives + false positives) per scored calibration case, per the suite README asymmetry`,
    questionVersion: MEMORY_WORTH_EXTRACTING_VERSION,
    fixtureSha256: fixtureHash('memory_worth_extracting', ['cases.json', 'labels.final.json']),
    budget: DECISION_BUDGETS.memory_worth_extracting,
    chosen: { extractAbove: extract.chosen, useAnswerAboveConfidence: gate.chosen },
    sweep: { extractAbove: extract.sweep, confidenceGate: gate.sweep },
    production: bySplit(
      runs.map((run) => {
        const label = labels[run.id] as { label: string | null; scored: boolean } | undefined;
        return {
          id: run.id,
          split: run.split,
          tags: run.tags,
          scored: label?.scored === true,
          expected: label?.label === 'yes',
          predicted: baselineRows.get(run.id) ?? true,
          used: true,
        } satisfies BinaryRow;
      }),
      scoreBinary,
    ),
    ungated: bySplit(ungated, scoreBinary),
    gated: bySplit(final, scoreBinary),
    reliability: reliability(correctness),
    byTag: sliceByTag(final, scoreBinary),
  };
}

/* --------------------------------- review_security_gate ------------------ */

function planSecurityGate(cases: EvalCase[]): Planned[] {
  return cases.map((one) => {
    const paths = (one.input['paths'] as string[]) ?? [];
    const decided = securityGateDecidedByPath(paths);
    return {
      id: one.id,
      split: splitOf(one),
      tags: one.meta.tags,
      request: decided
        ? null
        : buildReviewSecurityGateRequest({ chunk: String(one.input['chunk'] ?? ''), paths }),
      codeAnswer: decided ? 'no' : null,
    };
  });
}

function scoreSecurityGate(runs: CaseRun[]): SuiteReport {
  const labels = loadLabels('review_security_gate');
  const rowsAt = (skipBelow: number): BinaryRow[] =>
    runs.map((run) => {
      const label = labels[run.id] as { label: string | null; scored: boolean } | undefined;
      const verdict =
        run.codeAnswer === 'no'
          ? { status: 'answered' as const, review: false, probability: null }
          : interpretSecurityGate(outcomeOf(run), skipBelow);
      return {
        id: run.id,
        split: run.split,
        tags: run.tags,
        scored: label?.scored === true,
        expected: label?.label === 'yes',
        predicted: verdict.review,
        used: run.codeAnswer === 'no' || verdict.status === 'answered',
      };
    });

  // A skipped chunk that needed the pass is a finding nothing re-reads, so the
  // objective maximises skipped chunks subject to zero calibration misses.
  const objective = (skipBelow: number) => {
    const score = scoreBinary(rowsAt(skipBelow).filter((row) => row.split === 'calibration'));
    if (score.falseNegatives > 0) return null;
    return score.trueNegatives;
  };
  const chosen = chooseThreshold(thresholdLadder(), objective);
  const final = rowsAt(chosen.chosen);
  const ungated = rowsAt(0.5);

  const skipped = (rows: readonly BinaryRow[]) => ({
    chunks: rows.length,
    reviewed: rows.filter((row) => row.predicted).length,
    skipped: rows.filter((row) => !row.predicted).length,
    // Two passes per chunk today; the gate removes the security pass only.
    modelCallsPerChunk:
      rows.length > 0
        ? round(1 + rows.filter((row) => row.predicted).length / rows.length, 3)
        : null,
  });

  return {
    suite: 'review_security_gate',
    objective:
      'maximise chunks skipped subject to zero false negatives on calibration, per the suite README asymmetry',
    questionVersion: REVIEW_SECURITY_GATE_VERSION,
    fixtureSha256: fixtureHash('review_security_gate', ['cases.json', 'labels.final.json']),
    budget: SECURITY_GATE_BUDGET,
    chosen: { skipBelow: chosen.chosen },
    sweep: chosen.sweep,
    production: bySplit(
      runs.map((run) => {
        const label = labels[run.id] as { label: string | null; scored: boolean } | undefined;
        return {
          id: run.id,
          split: run.split,
          tags: run.tags,
          scored: label?.scored === true,
          expected: label?.label === 'yes',
          // Production runs every pass over every chunk.
          predicted: true,
          used: true,
        } satisfies BinaryRow;
      }),
      scoreBinary,
    ),
    ungated: bySplit(ungated, scoreBinary),
    gated: bySplit(final, scoreBinary),
    reliability: reliability(
      runs.map((run) => {
        const row = final.find((one) => one.id === run.id)!;
        const probability = noulOf(run, SECURITY_GATE_KEY);
        return {
          confidence: probability === null ? null : noulConfidence(probability),
          correct: row.predicted === row.expected,
          scored: row.scored,
        };
      }),
    ),
    byTag: sliceByTag(final, scoreBinary),
    extra: {
      falseNegativeIds: final
        .filter((row) => row.scored && row.expected && !row.predicted)
        .map((row) => row.id),
      calls: bySplit(final, skipped),
      decidedByPath: runs.filter((run) => run.codeAnswer === 'no').map((run) => run.id),
    },
  };
}

/* -------------------------------------- element_resolution --------------- */

interface PageCorpus {
  pages: Record<string, { content: string; elementCount: number }>;
}

function planElementResolution(cases: EvalCase[]): Planned[] {
  const { pages } = readJson<PageCorpus>(suitesDir, 'element_resolution', 'pages.json');
  return cases.map((one) => {
    const description = String(one.input['description'] ?? '');
    const pageId = String(one.input['pageId'] ?? '');
    const elements = parsePageElements(pages[pageId]?.content ?? '');
    const decided = resolveByExactLabel(description, elements);
    return {
      id: one.id,
      split: splitOf(one),
      tags: [...one.meta.tags, `page:${pageId}`],
      request: decided ? null : buildElementResolutionRequest({ description, elements }),
      codeAnswer: decided,
    };
  });
}

function scoreElementResolution(runs: CaseRun[]): SuiteReport {
  const labels = loadLabels('element_resolution');
  const baseline = loadBaseline('element_resolution');
  const baselineRows = (baseline['rows'] as { id: string; prediction: string }[]).reduce(
    (map, row) => map.set(row.id, row.prediction),
    new Map<string, string>(),
  );

  const rowsAt = (minimumConfidence: number): (CategoryRow & { prediction: string | null })[] =>
    runs.map((run) => {
      const label = labels[run.id] as { label: string | null; scored: boolean } | undefined;
      const verdict = interpretElementChoice(outcomeOf(run), minimumConfidence);
      const prediction = run.codeAnswer ?? (verdict.confident ? verdict.value : null);
      return {
        id: run.id,
        split: run.split,
        tags: run.tags,
        scored: label?.scored === true,
        correct: prediction !== null && prediction === label?.label,
        used: prediction !== null,
        confidence: run.codeAnswer ? 1 : verdict.confidence,
        prediction,
      };
    });

  // A wrong index is a click on the wrong row, and an escalation is only the
  // round trip production already pays, so a wrong answer is weighted at three
  // escalations.
  const WRONG_WEIGHT = 3;
  const objective = (minimumConfidence: number) => {
    const rows = rowsAt(minimumConfidence).filter(
      (row) => row.split === 'calibration' && row.scored,
    );
    if (rows.length === 0) return null;
    const wrong = rows.filter((row) => row.used && !row.correct).length;
    const escalated = rows.filter((row) => !row.used).length;
    return -(wrong * WRONG_WEIGHT + escalated) / rows.length;
  };
  const chosen = chooseThreshold(thresholdLadder(), objective);
  const final = rowsAt(chosen.chosen);
  const ungated = rowsAt(0);

  return {
    suite: 'element_resolution',
    objective: `minimise (${WRONG_WEIGHT} x wrong index + escalations) per scored calibration case; a wrong index is a click, an escalation is the round trip production already pays`,
    questionVersion: ELEMENT_RESOLUTION_VERSION,
    fixtureSha256: fixtureHash('element_resolution', [
      'cases.json',
      'labels.final.json',
      'pages.json',
    ]),
    budget: ELEMENT_RESOLUTION_BUDGET,
    chosen: { minimumConfidence: chosen.chosen },
    sweep: chosen.sweep,
    production: bySplit(
      runs.map((run) => {
        const label = labels[run.id] as { label: string | null; scored: boolean } | undefined;
        return {
          id: run.id,
          split: run.split,
          tags: run.tags,
          scored: label?.scored === true,
          correct: baselineRows.get(run.id) === label?.label,
          used: true,
          confidence: null,
        } satisfies CategoryRow;
      }),
      scoreCategory,
    ),
    ungated: bySplit(ungated, scoreCategory),
    gated: bySplit(final, scoreCategory),
    // The raw answer against its own confidence: gating first would make every
    // low bin wrong by construction and say nothing about calibration.
    reliability: reliability(ungated),
    byTag: sliceByTag(final, scoreCategory),
    extra: {
      decidedByExactLabel: runs.filter((run) => run.codeAnswer !== null).length,
      chosenNoneWhenAnElementWasLabelled: final.filter(
        (row) => row.prediction === NO_ELEMENT && labels[row.id]?.['label'] !== NO_ELEMENT,
      ).length,
      answerKey: ELEMENT_QUESTION_KEY,
    },
  };
}

/* ------------------------------- connector_tool_shortlist ---------------- */

interface Catalog {
  totalSchemaBytes: number;
  tools: {
    qualifiedName: string;
    serverId: string;
    toolName: string;
    description: string;
    inputSchema: unknown;
  }[];
}

// The production byte count, restated here only because `toolSchemaBytes` sits
// behind `import 'server-only'` and this script is a plain node process.
function schemaBytes(tool: Catalog['tools'][number]): number {
  return new TextEncoder().encode(
    JSON.stringify({
      name: tool.qualifiedName,
      description: tool.description,
      parameters: tool.inputSchema,
    }),
  ).byteLength;
}

const SHORTLIST_BUDGET = { maxTools: 32, maxSchemaBytes: 24_000 };

let catalogCache: ShortlistCandidate[] | null = null;

// One catalog and one partition per case, reused by the sweep: the code-first
// split does not move with a threshold and rebuilding it 66 times would only
// be slower.
function shortlistCandidates(): ShortlistCandidate[] {
  if (catalogCache) return catalogCache;
  const catalog = readJson<Catalog>(suitesDir, 'connector_tool_shortlist', 'catalog.json');
  catalogCache = catalog.tools.map((tool) => ({
    qualifiedName: tool.qualifiedName,
    serverId: tool.serverId,
    toolName: tool.toolName,
    description: tool.description,
    bytes: schemaBytes(tool),
  }));
  return catalogCache;
}

const partitionCache = new Map<string, ReturnType<typeof partitionCandidates>>();

function partitionFor(message: string): ReturnType<typeof partitionCandidates> {
  const cached = partitionCache.get(message);
  if (cached) return cached;
  const built = partitionCandidates(shortlistCandidates(), message, [], []);
  partitionCache.set(message, built);
  return built;
}

function planToolShortlist(cases: EvalCase[]): Planned[] {
  return cases.map((one) => {
    const message = String(one.input['message'] ?? '');
    const { asked } = partitionFor(message);
    return {
      id: one.id,
      split: splitOf(one),
      tags: one.meta.tags,
      request: buildToolShortlistRequest({
        latestUserMessage: message,
        previousUserMessage: null,
        candidates: asked,
      }),
      codeAnswer: null,
    };
  });
}

function scoreToolShortlist(runs: CaseRun[], cases: EvalCase[]): SuiteReport {
  const labels = loadLabels('connector_tool_shortlist');
  const baseline = loadBaseline('connector_tool_shortlist');
  const baselineRows = (
    baseline['rows'] as { id: string; shortlist: string[]; selectedBytes?: number }[]
  ).reduce(
    (map, row) => map.set(row.id, row),
    new Map<string, { shortlist: string[]; selectedBytes?: number }>(),
  );
  const candidates = shortlistCandidates();
  const totalBytes = candidates.reduce((sum, tool) => sum + tool.bytes, 0);
  const byId = new Map(cases.map((one) => [one.id, one]));

  const rowsAt = (keep: number, maybe: number): SetRow[] =>
    runs.map((run) => {
      const label = labels[run.id] as
        { label: { core: string[]; optional: string[] } | null; scored: boolean } | undefined;
      const message = String(byId.get(run.id)?.input['message'] ?? '');
      const { decided, asked } = partitionFor(message);
      const selection = selectShortlist(
        outcomeOf(run),
        asked,
        { keep, maybe },
        SHORTLIST_BUDGET,
        decided,
      );
      const production = baselineRows.get(run.id);
      const baselineBytes = candidates
        .filter((tool) => production?.shortlist.includes(tool.qualifiedName))
        .reduce((sum, tool) => sum + tool.bytes, 0);
      return {
        id: run.id,
        split: run.split,
        tags: run.tags,
        scored: label?.scored === true,
        core: label?.label?.core ?? [],
        optional: label?.label?.optional ?? [],
        standing: [],
        kept: selection.tools.map((tool) => tool.qualifiedName),
        keptBytes: selection.bytes,
        baselineBytes,
        totalBytes,
      };
    });

  const productionRows = runs.map((run) => {
    const label = labels[run.id] as
      { label: { core: string[]; optional: string[] } | null; scored: boolean } | undefined;
    const production = baselineRows.get(run.id);
    const kept = production?.shortlist ?? [];
    const baselineBytes = candidates
      .filter((tool) => kept.includes(tool.qualifiedName))
      .reduce((sum, tool) => sum + tool.bytes, 0);
    return {
      id: run.id,
      split: run.split,
      tags: run.tags,
      scored: label?.scored === true,
      core: label?.label?.core ?? [],
      optional: label?.label?.optional ?? [],
      standing: [],
      kept,
      keptBytes: baselineBytes,
      baselineBytes,
      totalBytes,
    } satisfies SetRow;
  });

  const productionRecall = scoreSets(
    productionRows.filter((row) => row.split === 'calibration'),
  ).coreRecall;

  // Recall of the tools the turn needs first, bytes second: a missing tool
  // costs the task, a carried one costs bytes.
  const objective = ([keep, maybe]: [number, number]) => {
    const score = scoreSets(rowsAt(keep, maybe).filter((row) => row.split === 'calibration'));
    if (score.coreRecall === null) return null;
    if (productionRecall !== null && score.coreRecall < productionRecall) return null;
    return score.meanKeptBytes === null ? null : -score.meanKeptBytes;
  };
  const ladder = thresholdLadder(0.1);
  const pairs: [number, number][] = [];
  for (const keep of ladder)
    for (const maybe of ladder) if (maybe <= keep) pairs.push([keep, maybe]);
  const chosen = chooseThreshold(pairs, objective);
  const final = rowsAt(chosen.chosen[0], chosen.chosen[1]);

  return {
    suite: 'connector_tool_shortlist',
    objective:
      'minimise mean kept schema bytes subject to core recall on calibration at or above the production shortlist, per the suite README (recall first, tokens second)',
    questionVersion: TOOL_SHORTLIST_VERSION,
    fixtureSha256: fixtureHash('connector_tool_shortlist', [
      'cases.json',
      'labels.final.json',
      'catalog.json',
    ]),
    budget: DECISION_BUDGETS.connector_tool_shortlist,
    chosen: { keep: chosen.chosen[0], maybe: chosen.chosen[1] },
    sweep: chosen.sweep.map((entry) => ({
      keep: entry.threshold[0],
      maybe: entry.threshold[1],
      objective: entry.objective,
    })),
    production: bySplit(productionRows, scoreSets),
    ungated: bySplit(rowsAt(0.5, 0.5), scoreSets),
    gated: bySplit(final, scoreSets),
    // One row per tool asked about: the probability against whether that tool
    // was in the labelled core, which is the number a threshold acts on.
    reliability: reliability(
      runs.flatMap((run) => {
        const label = labels[run.id] as
          { label: { core: string[] } | null; scored: boolean } | undefined;
        const message = String(byId.get(run.id)?.input['message'] ?? '');
        const { asked } = partitionFor(message);
        return asked.map((tool, index) => {
          const answer = run.answers[`tool_${index}`];
          const probability = answer?.kind === 'boolean' ? answer.probability : null;
          const wanted = label?.label?.core.includes(tool.qualifiedName) === true;
          return {
            confidence: probability === null ? null : noulConfidence(probability),
            correct: probability === null ? false : probability >= 0.5 === wanted,
            scored: label?.scored === true,
          };
        });
      }),
    ),
    byTag: sliceByTag(final, scoreSets),
    extra: { catalogBytes: totalBytes, catalogTools: candidates.length, budget: SHORTLIST_BUDGET },
  };
}

/* -------------------------------------------- memory_relevance ----------- */

interface MemorySets {
  sets: Record<
    string,
    {
      memories: {
        id: string;
        content: string;
        category: string;
        pinned: boolean;
        updatedAt: string;
      }[];
    }
  >;
}

const MAX_MEMORIES = 30;

/** `order by pinned desc, updated_at desc limit 30`, the production query. */
function productionOrder(setId: string): MemorySets['sets'][string]['memories'] {
  const { sets } = readJson<MemorySets>(suitesDir, 'memory_relevance', 'memory-sets.json');
  const rows = [...(sets[setId]?.memories ?? [])];
  rows.sort((a, b) =>
    a.pinned !== b.pinned ? (a.pinned ? -1 : 1) : b.updatedAt.localeCompare(a.updatedAt),
  );
  return rows.slice(0, MAX_MEMORIES);
}

interface MemoryTurnRows {
  ids: string[];
  candidates: MemoryCandidate[];
  chars: number[];
}

// One assembly per set, reused by the sweep: `selectMemories` matches kept rows
// by identity, so the sweep must see the same objects every time.
const memoryRowCache = new Map<string, MemoryTurnRows>();

function memoryRows(setId: string): MemoryTurnRows {
  const cached = memoryRowCache.get(setId);
  if (cached) return cached;
  const ordered = productionOrder(setId);
  const built: MemoryTurnRows = {
    ids: ordered.map((row) => row.id),
    candidates: ordered.map((row) => ({
      content: row.content,
      category: row.category,
      pinned: row.pinned,
    })),
    chars: ordered.map((row) => row.content.length),
  };
  memoryRowCache.set(setId, built);
  return built;
}

function planMemoryRelevance(cases: EvalCase[]): Planned[] {
  return cases.map((one) => {
    const { candidates } = memoryRows(String(one.input['memorySetId'] ?? ''));
    return {
      id: one.id,
      split: splitOf(one),
      tags: one.meta.tags,
      request: buildMemoryRelevanceRequest({
        latestUserMessage: String(one.input['message'] ?? ''),
        candidates,
      }),
      codeAnswer: null,
    };
  });
}

function scoreMemoryRelevance(runs: CaseRun[], cases: EvalCase[]): SuiteReport {
  const labels = loadLabels('memory_relevance');
  const byId = new Map(cases.map((one) => [one.id, one]));

  const rowsAt = (minimumConfidence: number): SetRow[] =>
    runs.map((run) => {
      const label = labels[run.id] as
        | {
            label: { core: string[]; optional: string[]; standing?: string[] } | null;
            scored: boolean;
          }
        | undefined;
      const setId = String(byId.get(run.id)?.input['memorySetId'] ?? '');
      const { ids, candidates, chars } = memoryRows(setId);
      const selection = selectMemories(outcomeOf(run), candidates, minimumConfidence);
      const keptIds = ids.filter((_, index) => selection.kept.includes(candidates[index]!));
      const totalChars = chars.reduce((sum, value) => sum + value, 0);
      const keptChars = ids.reduce(
        (sum, id, index) => sum + (keptIds.includes(id) ? chars[index]! : 0),
        0,
      );
      return {
        id: run.id,
        split: run.split,
        tags: run.tags,
        scored: label?.scored === true,
        core: label?.label?.core ?? [],
        optional: label?.label?.optional ?? [],
        standing: label?.label?.standing ?? [],
        kept: keptIds,
        keptBytes: keptChars,
        baselineBytes: totalChars,
        totalBytes: totalChars,
      };
    });

  // A dropped standing instruction is user visible and immediate, and a
  // dropped relevant fact is quietly wrong, so both are hard constraints and
  // characters saved is the thing maximised inside them.
  const objective = (minimumConfidence: number) => {
    const score = scoreSets(rowsAt(minimumConfidence).filter((row) => row.split === 'calibration'));
    if (score.standingDropped > 0) return null;
    if (score.coreRecall === null || score.coreRecall < 1) return null;
    return score.meanKeptBytes === null ? null : -score.meanKeptBytes;
  };
  const chosen = chooseThreshold(thresholdLadder(), objective);
  const final = rowsAt(chosen.chosen);

  // Production applies no relevance filter: every row the query returned is
  // sent, so its kept set is the whole ordered list.
  const productionRows = runs.map((run) => {
    const base = rowsAt(0).find((row) => row.id === run.id)!;
    const { ids } = memoryRows(String(byId.get(run.id)?.input['memorySetId'] ?? ''));
    return { ...base, kept: ids, keptBytes: base.totalBytes };
  });

  return {
    suite: 'memory_relevance',
    objective:
      'minimise mean characters kept subject to zero standing instructions dropped and core recall of 1 on calibration, per the suite README',
    questionVersion: MEMORY_RELEVANCE_VERSION,
    fixtureSha256: fixtureHash('memory_relevance', [
      'cases.json',
      'labels.final.json',
      'memory-sets.json',
    ]),
    budget: DECISION_BUDGETS.memory_relevance,
    chosen: { minimumConfidence: chosen.chosen },
    sweep: chosen.sweep,
    production: bySplit(productionRows, scoreSets),
    ungated: bySplit(rowsAt(0), scoreSets),
    gated: bySplit(final, scoreSets),
    // One row per memory asked about: the verdict's own confidence against
    // whether the verdict matched the class the labellers agreed on.
    reliability: reliability(
      runs.flatMap((run) => {
        const label = labels[run.id] as
          { label: { core: string[]; standing?: string[] } | null; scored: boolean } | undefined;
        const { ids, candidates } = memoryRows(
          String(byId.get(run.id)?.input['memorySetId'] ?? ''),
        );
        return ids.flatMap(
          (id, index): { confidence: number | null; correct: boolean; scored: boolean }[] => {
            if (candidates[index]?.pinned) return [];
            const answer = run.answers[`memory_${index}`];
            if (answer?.kind !== 'choice')
              return [{ confidence: null, correct: false, scored: false }];
            const expected = label?.label?.standing?.includes(id)
              ? 'standing_instruction'
              : label?.label?.core.includes(id)
                ? 'relevant'
                : 'irrelevant';
            return [
              {
                confidence: answer.confidence,
                correct: answer.value === expected,
                scored: label?.scored === true,
              },
            ];
          },
        );
      }),
    ),
    byTag: sliceByTag(final, scoreSets),
    extra: {
      standingDroppedIds: final
        .filter((row) => row.standing.some((item) => !row.kept.includes(item)))
        .map((row) => row.id),
      meanRowsSentProduction: round(
        productionRows.reduce((sum, row) => sum + row.kept.length, 0) /
          Math.max(1, productionRows.length),
        2,
      ),
      meanRowsKept: round(
        final.reduce((sum, row) => sum + row.kept.length, 0) / Math.max(1, final.length),
        2,
      ),
    },
  };
}

/* ------------------------------------------------ turn_signals ----------- */

const TURN_SIGNAL_FIELDS = {
  needs_current_info: 'needs_current_information',
  needs_external_tools: 'needs_external_tools',
  needs_code: 'needs_code_understanding',
} as const;

function planTurnSignals(cases: EvalCase[]): Planned[] {
  return cases.map((one) => ({
    id: one.id,
    split: splitOf(one),
    tags: one.meta.tags,
    request: buildTurnSignalsRequest({
      latestUserMessage: String(one.input['message'] ?? ''),
      previousUserMessage: (one.input['previousUserMessage'] as string | undefined) ?? null,
    }),
    codeAnswer: null,
  }));
}

interface TurnSignalsBaselineRow {
  id: string;
  predicted: {
    family: string;
    needs_current_info: boolean;
    needs_external_tools: boolean;
    needs_code: boolean;
  };
}

function scoreTurnSignals(runs: CaseRun[]): SuiteReport {
  const labels = loadLabels('turn_signals');
  const baseline = loadBaseline('turn_signals');
  const baselineRows = (baseline['rows'] as TurnSignalsBaselineRow[]).reduce(
    (map, row) => map.set(row.id, row),
    new Map<string, TurnSignalsBaselineRow>(),
  );
  const fieldOf = (id: string, field: string) =>
    (labels[id]?.['label'] as Record<string, Record<string, unknown>> | undefined)?.[field];

  const booleanReport = (labelField: keyof typeof TURN_SIGNAL_FIELDS) => {
    const key = TURN_SIGNAL_FIELDS[labelField];
    const rowsAt = (threshold: number): BinaryRow[] =>
      runs.map((run) => {
        const label = fieldOf(run.id, labelField);
        const probability = noulOf(run, key);
        return {
          id: run.id,
          split: run.split,
          tags: run.tags,
          scored: label?.['scored'] === true,
          expected: label?.['value'] === true,
          predicted: probability !== null && probability >= threshold,
          used: probability !== null,
        };
      });
    const chosen = chooseThreshold(thresholdLadder(), (threshold) => {
      const score = scoreBinary(rowsAt(threshold).filter((row) => row.split === 'calibration'));
      return score.accuracy;
    });
    const final = rowsAt(chosen.chosen);
    return {
      chosenThreshold: chosen.chosen,
      production: bySplit(
        runs.map((run) => {
          const label = fieldOf(run.id, labelField);
          return {
            id: run.id,
            split: run.split,
            tags: run.tags,
            scored: label?.['scored'] === true,
            expected: label?.['value'] === true,
            predicted: baselineRows.get(run.id)?.predicted[labelField] === true,
            used: true,
          } satisfies BinaryRow;
        }),
        scoreBinary,
      ),
      jev: bySplit(final, scoreBinary),
      unscored: runs.filter((run) => fieldOf(run.id, labelField)?.['scored'] !== true).length,
      byTag: sliceByTag(final, scoreBinary),
      reliability: reliability(
        final.map((row) => {
          const probability = noulOf(
            runs.find((run) => run.id === row.id)!,
            key,
          );
          return {
            confidence: probability === null ? null : noulConfidence(probability),
            correct: row.predicted === row.expected,
            scored: row.scored,
          };
        }),
      ),
    };
  };

  const familyRows: CategoryRow[] = runs.map((run) => {
    const label = fieldOf(run.id, 'task_family');
    const answer = run.answers['task_family'];
    const value = answer?.kind === 'choice' ? answer.value : null;
    return {
      id: run.id,
      split: run.split,
      tags: run.tags,
      scored: label?.['scored'] === true,
      correct: value !== null && value === label?.['value'],
      used: value !== null,
      confidence: answer?.kind === 'choice' ? answer.confidence : null,
    };
  });

  // The production classifier answers in RoutingTaskType, the labels in
  // TaskFamily. The bridge is the router's own intended-type map, so the
  // baseline counts as right when its type is one the labelled family intends.
  const familyProduction: CategoryRow[] = runs.map((run) => {
    const label = fieldOf(run.id, 'task_family');
    const family = label?.['value'] as TaskFamily | undefined;
    const intended = family ? TASK_FAMILY_INTENDED_TASK_TYPES[family] : undefined;
    const produced = baselineRows.get(run.id)?.predicted.family;
    return {
      id: run.id,
      split: run.split,
      tags: run.tags,
      scored: label?.['scored'] === true && intended !== undefined,
      correct: Boolean(produced && intended?.includes(produced as never)),
      used: true,
      confidence: null,
    };
  });

  const complexityRows: CategoryRow[] = runs.map((run) => {
    const label = fieldOf(run.id, 'complexity4');
    const answer = run.answers['semantic_complexity'];
    const nearest = answer?.kind === 'score' ? Math.round(answer.value) : null;
    const accept = (label?.['accept'] as number[] | undefined) ?? [];
    return {
      id: run.id,
      split: run.split,
      tags: run.tags,
      scored: label?.['scored'] === true,
      correct: nearest !== null && accept.includes(nearest),
      used: nearest !== null,
      confidence: answer?.kind === 'score' ? answer.confidence : null,
    };
  });

  const exactComplexity = complexityRows.filter((row) => {
    const accept = (fieldOf(row.id, 'complexity4')?.['accept'] as number[] | undefined) ?? [];
    return row.scored && accept.length === 1 && row.correct;
  }).length;

  return {
    suite: 'turn_signals',
    objective:
      'accuracy per field on calibration; this kind gates nothing today, so each boolean threshold is chosen for accuracy alone and the family and complexity answers are scored ungated',
    questionVersion: TURN_SIGNALS_VERSION,
    fixtureSha256: fixtureHash('turn_signals', ['cases.json', 'labels.final.json']),
    budget: DECISION_BUDGETS.turn_signals,
    chosen: {},
    sweep: null,
    production: {
      task_family: bySplit(familyProduction, scoreCategory),
      ...Object.fromEntries(
        (Object.keys(TURN_SIGNAL_FIELDS) as (keyof typeof TURN_SIGNAL_FIELDS)[]).map((field) => [
          field,
          booleanReport(field).production,
        ]),
      ),
    },
    ungated: {
      task_family: bySplit(familyRows, scoreCategory),
      complexity4: bySplit(complexityRows, scoreCategory),
      ...Object.fromEntries(
        (Object.keys(TURN_SIGNAL_FIELDS) as (keyof typeof TURN_SIGNAL_FIELDS)[]).map((field) => [
          field,
          booleanReport(field).jev,
        ]),
      ),
    },
    gated: Object.fromEntries(
      (Object.keys(TURN_SIGNAL_FIELDS) as (keyof typeof TURN_SIGNAL_FIELDS)[]).map((field) => {
        const report = booleanReport(field);
        return [field, { chosenThreshold: report.chosenThreshold, ...report.jev }];
      }),
    ),
    reliability: {
      task_family: reliability(familyRows),
      complexity4: reliability(complexityRows),
      ...Object.fromEntries(
        (Object.keys(TURN_SIGNAL_FIELDS) as (keyof typeof TURN_SIGNAL_FIELDS)[]).map((field) => [
          field,
          booleanReport(field).reliability,
        ]),
      ),
    },
    byTag: {
      task_family: sliceByTag(familyRows, scoreCategory),
      complexity4: sliceByTag(complexityRows, scoreCategory),
    },
    extra: {
      unscoredPerField: Object.fromEntries(
        [
          'needs_current_info',
          'needs_external_tools',
          'needs_code',
          'task_family',
          'complexity4',
        ].map((field) => [
          field,
          runs.filter((run) => fieldOf(run.id, field)?.['scored'] !== true).length,
        ]),
      ),
      complexityExactAgreement: exactComplexity,
      familyVocabularyBridge:
        'the production classifier answers in RoutingTaskType and the labels in TaskFamily; the baseline column counts a case right when the produced type is in TASK_FAMILY_INTENDED_TASK_TYPES for the labelled family',
    },
  };
}

// --------------------------------------------------------------------- main

const PLANNERS: Record<SuiteId, (cases: EvalCase[]) => Planned[]> = {
  turn_signals: planTurnSignals,
  connector_tool_shortlist: planToolShortlist,
  memory_relevance: planMemoryRelevance,
  memory_worth_extracting: planWorthExtracting,
  review_security_gate: planSecurityGate,
  element_resolution: planElementResolution,
};

const BUDGETS: Record<SuiteId, Budget> = {
  turn_signals: DECISION_BUDGETS.turn_signals,
  connector_tool_shortlist: DECISION_BUDGETS.connector_tool_shortlist,
  memory_relevance: DECISION_BUDGETS.memory_relevance,
  memory_worth_extracting: DECISION_BUDGETS.memory_worth_extracting,
  review_security_gate: SECURITY_GATE_BUDGET,
  element_resolution: ELEMENT_RESOLUTION_BUDGET,
};

function gitSha(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function projectedInputTokens(planned: Planned[]): number {
  return planned.reduce(
    (sum, one) => sum + (one.request ? requestBytes(one.request) / CHARS_PER_TOKEN : 0),
    0,
  );
}

// A smoke run over the first few cases of a suite, so a misconfigured model or
// base URL is found for a fraction of a cent rather than for the whole run.
const LIMIT = Number(flag('limit') ?? Number.POSITIVE_INFINITY);

const plans = selected.map((suite) => {
  const cases = loadCases(suite).slice(0, LIMIT);
  return { suite, cases, planned: PLANNERS[suite](cases) };
});

const projected = plans.reduce((sum, plan) => sum + projectedInputTokens(plan.planned), 0);
process.stdout.write(
  `projected input tokens: ${Math.round(projected)} over ${plans.reduce((n, p) => n + p.planned.filter((one) => one.request).length, 0)} calls\n`,
);
if (projected > MAX_PROJECTED_INPUT_TOKENS) {
  throw new Error(
    `Projected input of ${Math.round(projected)} tokens exceeds the ${MAX_PROJECTED_INPUT_TOKENS} ceiling: stopping instead of running`,
  );
}

const reports: { report: SuiteReport; runs: CaseRun[] }[] = [];
for (const plan of plans) {
  process.stdout.write(`${plan.suite}: ${plan.planned.length} cases\n`);
  const runs = await execute(plan.suite, plan.planned, BUDGETS[plan.suite]);
  const report =
    plan.suite === 'turn_signals'
      ? scoreTurnSignals(runs)
      : plan.suite === 'connector_tool_shortlist'
        ? scoreToolShortlist(runs, plan.cases)
        : plan.suite === 'memory_relevance'
          ? scoreMemoryRelevance(runs, plan.cases)
          : plan.suite === 'memory_worth_extracting'
            ? scoreWorthExtracting(runs)
            : plan.suite === 'review_security_gate'
              ? scoreSecurityGate(runs)
              : scoreElementResolution(runs);
  reports.push({ report, runs });
}

mkdirSync(resultsDir, { recursive: true });

const header = {
  runDate: RUN_DATE,
  // True whenever the answers below came from real calls, including a re-score
  // that only re-derived the metrics from them.
  live: !DRY_RUN,
  scoredFromRecordedRun: RESCORE,
  model: MODEL,
  usdPerMillionInputTokens: USD_PER_MILLION_INPUT,
  gitSha: gitSha(),
  concurrency: CONCURRENCY,
  timeoutMs: TIMEOUT_MS,
  sdkRetries: 0,
};

for (const { report, runs } of reports) {
  writeFileSync(
    resolve(resultsDir, `${report.suite}.json`),
    `${JSON.stringify(
      {
        ...header,
        ...report,
        cost: latencyAndCost(runs, USD_PER_MILLION_INPUT),
        errors: countErrors(runs, transportCounters),
        // Inputs by id only: no case text reaches a results file.
        rows: runs.map((run) => ({
          id: run.id,
          split: run.split,
          tags: run.tags,
          status: run.status,
          reason: run.reason,
          latencyMs: run.latencyMs,
          inputTokens: run.inputTokens,
          outputTokens: run.outputTokens,
          questionCount: run.questionCount,
          requestBytes: run.requestBytes,
          codeAnswer: run.codeAnswer,
          answers: run.answers,
        })),
      },
      null,
      1,
    )}\n`,
  );
}

const totals = reports.reduce(
  (sum, { runs }) => {
    const cost = latencyAndCost(runs, USD_PER_MILLION_INPUT);
    return {
      inputTokens: sum.inputTokens + cost.totalInputTokens,
      outputTokens: sum.outputTokens + cost.totalOutputTokens,
      usd: sum.usd + cost.totalUsd,
      answered: sum.answered + cost.answered,
      cases: sum.cases + cost.cases,
    };
  },
  { inputTokens: 0, outputTokens: 0, usd: 0, answered: 0, cases: 0 },
);

const summary = [
  '# Semantic decision benchmark',
  '',
  `Run date ${header.runDate} (passed in, not read from a clock). Model \`${header.model}\`, git \`${header.gitSha}\`, concurrency ${header.concurrency}, SDK retries 0.`,
  `Totals: ${totals.answered}/${totals.cases} cases answered, ${totals.inputTokens} input tokens, ${totals.outputTokens} output tokens, $${round(totals.usd, 4)}.`,
  '',
  '| suite | question version | fixture sha256 | objective |',
  '| ----- | ---------------- | -------------- | --------- |',
  ...reports.map(
    ({ report }) =>
      `| \`${report.suite}\` | ${report.questionVersion} | \`${report.fixtureSha256.slice(0, 12)}\` | ${report.objective} |`,
  ),
  '',
  '| suite | chosen | errors | p50 ms | p95 ms | p99 ms | input tokens / decision | $ / 1k | $ / 1M |',
  '| ----- | ------ | ------ | ------ | ------ | ------ | ----------------------- | ------ | ------ |',
  ...reports.map(({ report, runs }) => {
    const cost = latencyAndCost(runs, USD_PER_MILLION_INPUT);
    const errors = countErrors(runs, transportCounters);
    const failed =
      errors.providerErrors + errors.invalidResponses + errors.timeouts + errors.otherFallbacks;
    return `| \`${report.suite}\` | ${JSON.stringify(report.chosen)} | ${failed} | ${cost.p50Ms === null ? 'n/a' : Math.round(cost.p50Ms)} | ${cost.p95Ms === null ? 'n/a' : Math.round(cost.p95Ms)} | ${cost.p99Ms === null ? 'n/a' : Math.round(cost.p99Ms)} | ${cost.meanInputTokens ?? 'n/a'} | ${cost.usdPer1000Decisions ?? 'n/a'} | ${cost.usdPerMillionDecisions ?? 'n/a'} |`;
  }),
  '',
  '## Per suite',
  '',
  ...reports.flatMap(({ report, runs }) => [
    `### ${report.suite}`,
    '',
    '```json',
    JSON.stringify(
      {
        chosen: report.chosen,
        production: report.production,
        ungated: report.ungated,
        gated: report.gated,
        reliability: report.reliability,
        byTag: report.byTag,
        errors: countErrors(runs, transportCounters),
        cost: latencyAndCost(runs, USD_PER_MILLION_INPUT),
        ...(report.extra ? { extra: report.extra } : {}),
      },
      null,
      1,
    ),
    '```',
    '',
  ]),
].join('\n');

writeFileSync(resolve(resultsDir, 'README.md'), `${summary}\n`);
process.stdout.write(
  `wrote ${reports.length} result file(s) and README.md; $${round(totals.usd, 4)} of input tokens\n`,
);

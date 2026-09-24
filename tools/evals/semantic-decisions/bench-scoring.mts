// Pure scoring for the live benchmark. Nothing here calls a provider, reads a
// clock or touches the filesystem, so every number below is unit testable.
import type { DecisionAnswer, DecisionOutcome } from '@agiworkforce/agent-core';

export type Split = 'calibration' | 'heldout';

/** One case after it has been asked, or after code or the budget answered it. */
export interface CaseRun {
  id: string;
  split: Split;
  tags: string[];
  status: 'answered' | 'fallback' | 'decided_by_code' | 'over_budget' | 'skipped';
  reason: string | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  questionCount: number;
  requestBytes: number;
  answers: Record<string, DecisionAnswer>;
  /** What code decided before any question was asked, where it did. */
  codeAnswer: string | null;
}

export function outcomeOf(run: CaseRun): DecisionOutcome {
  if (run.status !== 'answered') {
    return { status: 'fallback', reason: 'provider_error', latencyMs: run.latencyMs ?? 0 };
  }
  return {
    status: 'shadow',
    latencyMs: run.latencyMs ?? 0,
    result: {
      model: '',
      answers: run.answers,
      inputTokens: run.inputTokens ?? 0,
      outputTokens: run.outputTokens ?? 0,
    },
  };
}

export function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
}

export function round(value: number, places = 4): number {
  return Number(value.toFixed(places));
}

/** A Noul carries a probability, not a confidence: distance from the coin flip. */
export function noulConfidence(probability: number): number {
  return Math.abs(2 * probability - 1);
}

export interface ConfusionCounts {
  scored: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
}

export interface BinaryScore extends ConfusionCounts {
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  /** Answers the gate would not act on, which fall back to the baseline. */
  fallbackRate: number | null;
}

export interface BinaryRow {
  id: string;
  split: Split;
  tags: string[];
  scored: boolean;
  expected: boolean;
  predicted: boolean;
  /** False when no usable answer existed, so the baseline stood. */
  used: boolean;
}

export function scoreBinary(rows: readonly BinaryRow[]): BinaryScore {
  const scored = rows.filter((row) => row.scored);
  const counts: ConfusionCounts = {
    scored: scored.length,
    truePositives: scored.filter((r) => r.expected && r.predicted).length,
    falsePositives: scored.filter((r) => !r.expected && r.predicted).length,
    trueNegatives: scored.filter((r) => !r.expected && !r.predicted).length,
    falseNegatives: scored.filter((r) => r.expected && !r.predicted).length,
  };
  const correct = counts.truePositives + counts.trueNegatives;
  const predictedPositive = counts.truePositives + counts.falsePositives;
  const actualPositive = counts.truePositives + counts.falseNegatives;
  const precision = predictedPositive > 0 ? counts.truePositives / predictedPositive : null;
  const recall = actualPositive > 0 ? counts.truePositives / actualPositive : null;
  return {
    ...counts,
    accuracy: scored.length > 0 ? round(correct / scored.length) : null,
    precision: precision === null ? null : round(precision),
    recall: recall === null ? null : round(recall),
    f1:
      precision !== null && recall !== null && precision + recall > 0
        ? round((2 * precision * recall) / (precision + recall))
        : null,
    fallbackRate: rows.length > 0 ? round(rows.filter((r) => !r.used).length / rows.length) : null,
  };
}

export interface CategoryRow {
  id: string;
  split: Split;
  tags: string[];
  scored: boolean;
  correct: boolean;
  used: boolean;
  confidence: number | null;
}

export interface CategoryScore {
  scored: number;
  correct: number;
  accuracy: number | null;
  /** Accuracy over the cases the gate acted on, which is what a user would see. */
  accuracyWhenUsed: number | null;
  escalationRate: number | null;
}

export function scoreCategory(rows: readonly CategoryRow[]): CategoryScore {
  const scored = rows.filter((row) => row.scored);
  const used = scored.filter((row) => row.used);
  return {
    scored: scored.length,
    correct: scored.filter((row) => row.correct).length,
    accuracy:
      scored.length > 0 ? round(scored.filter((r) => r.correct).length / scored.length) : null,
    accuracyWhenUsed:
      used.length > 0 ? round(used.filter((r) => r.correct).length / used.length) : null,
    escalationRate:
      rows.length > 0 ? round(rows.filter((row) => !row.used).length / rows.length) : null,
  };
}

export interface ReliabilityBin {
  lower: number;
  upper: number;
  count: number;
  observedAccuracy: number | null;
}

const BIN_EDGES = [0, 0.2, 0.4, 0.6, 0.8] as const;

// Confidence against what actually happened. A decision whose 0.9 bin is right
// 60% of the time has a number that cannot be used as a gate.
export function reliability(
  rows: readonly { confidence: number | null; correct: boolean; scored: boolean }[],
): ReliabilityBin[] {
  return BIN_EDGES.map((lower, index) => {
    const upper = BIN_EDGES[index + 1] ?? 1.0001;
    const bin = rows.filter(
      (row) =>
        row.scored && row.confidence !== null && row.confidence >= lower && row.confidence < upper,
    );
    return {
      lower,
      upper: upper > 1 ? 1 : upper,
      count: bin.length,
      observedAccuracy:
        bin.length > 0 ? round(bin.filter((r) => r.correct).length / bin.length) : null,
    };
  });
}

export function sliceByTag<Row extends { tags: string[] }, Score>(
  rows: readonly Row[],
  score: (subset: readonly Row[]) => Score,
): Record<string, Score> {
  const tags = [...new Set(rows.flatMap((row) => row.tags))].sort();
  return Object.fromEntries(
    tags.map((tag) => [tag, score(rows.filter((r) => r.tags.includes(tag)))]),
  );
}

export function bySplit<Row extends { split: Split }, Score>(
  rows: readonly Row[],
  score: (subset: readonly Row[]) => Score,
): { all: Score; calibration: Score; heldout: Score } {
  return {
    all: score(rows),
    calibration: score(rows.filter((row) => row.split === 'calibration')),
    heldout: score(rows.filter((row) => row.split === 'heldout')),
  };
}

export interface SetRow {
  id: string;
  split: Split;
  tags: string[];
  scored: boolean;
  core: string[];
  optional: string[];
  /** Items that must survive every filter, empty where a suite has none. */
  standing: string[];
  kept: string[];
  keptBytes: number;
  /** What the production function kept on this case, for the saving figure. */
  baselineBytes: number;
  totalBytes: number;
}

export interface SetScore {
  cases: number;
  scored: number;
  coreNeeded: number;
  coreKept: number;
  coreRecall: number | null;
  /** Kept items that are core or optional, over everything kept. */
  precision: number | null;
  standingNeeded: number;
  standingDropped: number;
  emptyCoreCases: number;
  meanKeptBytesOnEmptyCore: number | null;
  meanKeptBytes: number | null;
  meanBaselineBytes: number | null;
  meanTotalBytes: number | null;
  bytesSavedVersusTotal: number | null;
  bytesSavedVersusBaseline: number | null;
  casesFullyCovered: number;
}

export function scoreSets(rows: readonly SetRow[]): SetScore {
  const scored = rows.filter((row) => row.scored);
  const sum = (pick: (row: SetRow) => number) =>
    scored.reduce((total, row) => total + pick(row), 0);
  const coreNeeded = sum((row) => row.core.length);
  const coreKept = sum((row) => row.core.filter((item) => row.kept.includes(item)).length);
  const keptTotal = sum((row) => row.kept.length);
  const keptWanted = sum(
    (row) =>
      row.kept.filter((item) => row.core.includes(item) || row.optional.includes(item)).length,
  );
  const standingNeeded = sum((row) => row.standing.length);
  const standingDropped = sum(
    (row) => row.standing.filter((item) => !row.kept.includes(item)).length,
  );
  const emptyCore = scored.filter((row) => row.core.length === 0);
  const mean = (values: readonly number[]) =>
    values.length > 0 ? round(values.reduce((a, b) => a + b, 0) / values.length, 1) : null;
  const meanKept = mean(scored.map((row) => row.keptBytes));
  const meanBaseline = mean(scored.map((row) => row.baselineBytes));
  const meanTotal = mean(scored.map((row) => row.totalBytes));
  return {
    cases: rows.length,
    scored: scored.length,
    coreNeeded,
    coreKept,
    coreRecall: coreNeeded > 0 ? round(coreKept / coreNeeded) : null,
    precision: keptTotal > 0 ? round(keptWanted / keptTotal) : null,
    standingNeeded,
    standingDropped,
    emptyCoreCases: emptyCore.length,
    meanKeptBytesOnEmptyCore: mean(emptyCore.map((row) => row.keptBytes)),
    meanKeptBytes: meanKept,
    meanBaselineBytes: meanBaseline,
    meanTotalBytes: meanTotal,
    bytesSavedVersusTotal:
      meanKept !== null && meanTotal !== null && meanTotal > 0
        ? round(1 - meanKept / meanTotal)
        : null,
    bytesSavedVersusBaseline:
      meanKept !== null && meanBaseline !== null && meanBaseline > 0
        ? round(1 - meanKept / meanBaseline)
        : null,
    casesFullyCovered: scored.filter(
      (row) => row.core.length > 0 && row.core.every((item) => row.kept.includes(item)),
    ).length,
  };
}

export interface LatencyAndCost {
  cases: number;
  answered: number;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  meanInputTokens: number | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  usdPer1000Decisions: number | null;
  usdPerMillionDecisions: number | null;
  totalUsd: number;
}

const TOKENS_PER_MILLION = 1_000_000;

export function latencyAndCost(
  runs: readonly CaseRun[],
  usdPerMillionInputTokens: number,
): LatencyAndCost {
  const answered = runs.filter((run) => run.status === 'answered');
  const latencies = answered.map((run) => run.latencyMs ?? 0);
  const inputTokens = answered.reduce((sum, run) => sum + (run.inputTokens ?? 0), 0);
  const perCase = answered.length > 0 ? inputTokens / answered.length : null;
  const usdPerCase =
    perCase === null ? null : (perCase * usdPerMillionInputTokens) / TOKENS_PER_MILLION;
  return {
    cases: runs.length,
    answered: answered.length,
    p50Ms: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    p99Ms: percentile(latencies, 0.99),
    meanInputTokens: perCase === null ? null : round(perCase, 1),
    totalInputTokens: inputTokens,
    totalOutputTokens: answered.reduce((sum, run) => sum + (run.outputTokens ?? 0), 0),
    usdPer1000Decisions: usdPerCase === null ? null : round(usdPerCase * 1_000, 6),
    usdPerMillionDecisions: usdPerCase === null ? null : round(usdPerCase * 1_000_000, 2),
    totalUsd: round((inputTokens * usdPerMillionInputTokens) / TOKENS_PER_MILLION, 6),
  };
}

export interface ErrorCounts {
  providerErrors: number;
  invalidResponses: number;
  timeouts: number;
  aborted: number;
  capacity: number;
  otherFallbacks: number;
  retries: number;
  rateLimited: number;
  overBudget: number;
  decidedByCode: number;
  skipped: number;
}

export function countErrors(
  runs: readonly CaseRun[],
  transport: { retries: number; rateLimited: number },
): ErrorCounts {
  const reason = (name: string) =>
    runs.filter((run) => run.status === 'fallback' && run.reason === name).length;
  const knownFallbacks = ['provider_error', 'invalid_response', 'timeout', 'aborted', 'capacity'];
  return {
    providerErrors: reason('provider_error'),
    invalidResponses: reason('invalid_response'),
    timeouts: reason('timeout'),
    aborted: reason('aborted'),
    capacity: reason('capacity'),
    otherFallbacks: runs.filter(
      (run) => run.status === 'fallback' && !knownFallbacks.includes(run.reason ?? ''),
    ).length,
    retries: transport.retries,
    rateLimited: transport.rateLimited,
    overBudget: runs.filter((run) => run.status === 'over_budget').length,
    decidedByCode: runs.filter((run) => run.status === 'decided_by_code').length,
    skipped: runs.filter((run) => run.status === 'skipped').length,
  };
}

/**
 * The sweep, stated once. Thresholds are chosen on calibration by the suite's
 * own objective and the heldout split is then scored exactly once.
 */
export function chooseThreshold<T>(
  candidates: readonly T[],
  objective: (candidate: T) => number | null,
): { chosen: T; sweep: { threshold: T; objective: number | null }[] } {
  const sweep = candidates.map((threshold) => ({ threshold, objective: objective(threshold) }));
  let best = sweep[0]!;
  for (const entry of sweep) {
    if (entry.objective !== null && (best.objective === null || entry.objective > best.objective)) {
      best = entry;
    }
  }
  return { chosen: best.threshold, sweep };
}

export function thresholdLadder(step = 0.05): number[] {
  const out: number[] = [];
  for (let value = 0; value <= 1.0000001; value += step) out.push(round(value, 2));
  return out;
}

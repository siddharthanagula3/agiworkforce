// Closed, so a caller cannot mint a flag key or a metric series at runtime.
// Imports nothing: metric cardinality and the flag namespace both read it.

export const DECISION_KIND_IDS = [
  'turn_signals',
  'connector_tool_shortlist',
  'memory_relevance',
  'memory_worth_extracting',
] as const;

export type DecisionKind = (typeof DECISION_KIND_IDS)[number];

export type DecisionFailurePolicy = 'baseline_stands';

export interface DecisionKindRecord {
  readonly id: DecisionKind;
  readonly owner: string;
  readonly questionVersion: number;
  readonly failurePolicy: DecisionFailurePolicy;
  readonly description: string;
}

export const DECISION_KINDS: Readonly<Record<DecisionKind, DecisionKindRecord>> = {
  turn_signals: {
    id: 'turn_signals',
    owner: 'AI platform maintainers',
    questionVersion: 1,
    failurePolicy: 'baseline_stands',
    description:
      'Task family, current-information, external-tool, code-understanding and complexity signals over one managed chat turn. Shadow only: the deterministic classifier keeps the turn.',
  },
  connector_tool_shortlist: {
    id: 'connector_tool_shortlist',
    owner: 'AI platform maintainers',
    questionVersion: 1,
    failurePolicy: 'baseline_stands',
    description:
      'Which connected tools this turn would need, one Noul per candidate. Shadow only: the lexical shortlist still builds the turn, and a deferred tool stays reachable through load_connector_tools.',
  },
  memory_relevance: {
    id: 'memory_relevance',
    owner: 'AI platform maintainers',
    questionVersion: 1,
    failurePolicy: 'baseline_stands',
    description:
      'Whether each unpinned memory bears on this turn, always applies, or neither. Shadow only, selection for request context only: nothing is ever deleted or reordered in storage.',
  },
  memory_worth_extracting: {
    id: 'memory_worth_extracting',
    owner: 'AI platform maintainers',
    questionVersion: 1,
    failurePolicy: 'baseline_stands',
    description:
      'Whether one message states a durable fact about the speaker. Shadow only: the regex gate still decides whether the post-turn extraction runs.',
  },
};

export function isDecisionKind(value: string): value is DecisionKind {
  return (DECISION_KIND_IDS as readonly string[]).includes(value);
}

// Confidence reaches a label as one of these, never as the float: a raw
// probability is unique per request and would open a series per turn.
export const DECISION_CONFIDENCE_BINS = [
  'p00_20',
  'p20_40',
  'p40_60',
  'p60_80',
  'p80_100',
] as const;

export type DecisionConfidenceBin = (typeof DECISION_CONFIDENCE_BINS)[number];

const BIN_COUNT = DECISION_CONFIDENCE_BINS.length;

export function confidenceBin(value: number): DecisionConfidenceBin {
  if (!Number.isFinite(value)) return DECISION_CONFIDENCE_BINS[0];
  const index = Math.min(BIN_COUNT - 1, Math.max(0, Math.floor(value * BIN_COUNT)));
  return DECISION_CONFIDENCE_BINS[index] ?? DECISION_CONFIDENCE_BINS[0];
}

// Questions with a deterministic answer to compare against, so only these
// produce an agreement and name a disagreement series.
export const DECISION_COMPARISON_KEYS = [
  'task_family',
  'tool_shortlist',
  'memory_selection',
  'worth_extracting',
] as const;

export type DecisionComparisonKey = (typeof DECISION_COMPARISON_KEYS)[number];

// Why the host declined to ask, as against the evaluator's fallback reasons,
// which describe a decision that was asked and did not land.
export const DECISION_SKIP_REASONS = [
  'trust_mode',
  'zero_data_retention',
  'provider_not_permitted',
  'region_excluded',
  'attachments_present',
  'explicit_model',
  'no_text',
  'unconfigured',
  // Code answered it outright, so there was nothing left to ask.
  'no_candidates',
  'decided_by_code',
] as const;

export type DecisionSkipReason = (typeof DECISION_SKIP_REASONS)[number];

// Its identity in the governance catalog and the cost ledger. Deliberately not
// a `Provider`: it serves no route and must reach no picker.
export const DECISION_TRANSPORT_ID = 'typesafe';

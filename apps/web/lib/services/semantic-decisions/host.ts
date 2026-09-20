import 'server-only';

import { AsyncLocalStorage } from 'node:async_hooks';

import {
  createDecisionEvaluator,
  decisionSampledIn,
  type DecisionOutcome,
  type DecisionPolicy,
  type DecisionRequest,
} from '@agiworkforce/agent-core';
import { createTypeSafeDecisionProvider } from '@agiworkforce/provider-runtime/decisions';
import type { PrivacyMode } from '@agiworkforce/types';

import type { DecisionFlagMode } from '@/lib/feature-flags/decision-flags';
import { logger } from '@/lib/logger';
import { recordSemanticDecision } from '@/lib/observability/metrics';
import { recordProviderCostEvent } from '@/lib/services/cogs-ledger-service';

import { decisionCost, type DecisionTransportConfig, type DecisionTransportState } from './config';
import { evaluateDecisionEligibility, type DecisionEligibilityFacts } from './eligibility';
import { DECISION_BUDGET, decisionPolicy, type DecisionModeResolution } from './policy';
import { DECISION_TRANSPORT_ID, type DecisionKind, type DecisionSkipReason } from './kinds';

// One evaluator per kind per process, so its concurrency bound is the
// instance's. Request-scoped, because the policy varies per subject.
const inFlightPolicy = new AsyncLocalStorage<DecisionPolicy>();

const UNCONFIGURED_MODEL = 'unconfigured';

const DISABLED_POLICY: DecisionPolicy = {
  ...DECISION_BUDGET,
  mode: 'disabled',
  model: UNCONFIGURED_MODEL,
  sampleRate: 0,
};

type Evaluator = (
  request: DecisionRequest,
  scope: {
    trustMode: 'local' | 'byok' | 'managed';
    providerAllowed: boolean;
    cohort: number;
    signal?: AbortSignal;
  },
) => Promise<DecisionOutcome>;

let cachedProvider: {
  config: DecisionTransportConfig;
  provider: ReturnType<typeof createTypeSafeDecisionProvider>;
} | null = null;
const evaluators = new Map<DecisionKind, Evaluator>();

function providerFor(config: DecisionTransportConfig) {
  if (
    cachedProvider &&
    cachedProvider.config.baseUrl === config.baseUrl &&
    cachedProvider.config.model === config.model
  ) {
    return cachedProvider.provider;
  }
  const provider = createTypeSafeDecisionProvider({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    model: config.model,
    timeoutMs: DECISION_BUDGET.timeoutMs,
    // The outer deadline bounds the whole evaluation; an inner retry would
    // spend it twice and charge twice for one answer.
    maxRetries: 0,
  });
  cachedProvider = { config, provider };
  evaluators.clear();
  return provider;
}

function evaluatorFor(kind: DecisionKind, config: DecisionTransportConfig): Evaluator {
  const provider = providerFor(config);
  const existing = evaluators.get(kind);
  if (existing) return existing;
  const created = createDecisionEvaluator({
    kind,
    provider,
    policy: () => inFlightPolicy.getStore() ?? DISABLED_POLICY,
  }) as Evaluator;
  evaluators.set(kind, created);
  return created;
}

/**
 * Everything knowable before a request exists. A caller that is refused here
 * has derived nothing, which is the whole point: every kind is off today, so
 * the closed gate is the path every managed turn in production takes.
 */
export type DecisionGate =
  | {
      asks: true;
      mode: DecisionFlagMode;
      policy: DecisionPolicy;
      cohort: number;
      trustMode: PrivacyMode;
      config: DecisionTransportConfig;
    }
  | { asks: false; mode: DecisionFlagMode; skipReason: DecisionSkipReason | null };

export function openDecisionGate(input: {
  kind: DecisionKind;
  transport: DecisionTransportState;
  resolution: DecisionModeResolution;
  eligibility: DecisionEligibilityFacts;
}): DecisionGate {
  // Nothing recorded while a kind is off or unconfigured: that is every
  // request today, and a per-turn counter for a feature nobody enabled is noise.
  if (input.resolution.mode === 'disabled')
    return { asks: false, mode: 'disabled', skipReason: null };
  if (!input.transport.configured) {
    return { asks: false, mode: 'disabled', skipReason: 'unconfigured' };
  }

  const mode = input.resolution.mode;
  if (!decisionSampledIn(input.resolution.cohort, input.resolution.sampleRate)) {
    recordSemanticDecision({ kind: input.kind, mode, outcome: 'fallback', reason: 'sampled_out' });
    return { asks: false, mode, skipReason: null };
  }

  const eligibility = evaluateDecisionEligibility(input.eligibility);
  if (!eligibility.eligible) {
    recordSemanticDecision({
      kind: input.kind,
      mode,
      outcome: 'skipped',
      reason: eligibility.reason,
    });
    return { asks: false, mode, skipReason: eligibility.reason };
  }

  return {
    asks: true,
    mode,
    policy: decisionPolicy(input.kind, input.transport.config.model, input.resolution),
    cohort: input.resolution.cohort,
    trustMode: input.eligibility.privacyMode,
    config: input.transport.config,
  };
}

export interface SemanticDecisionContext {
  requestId: string;
  /** Unique per evaluation: the ledger's idempotency key and the trace's own id. */
  decisionId: string;
  userId: string;
  organizationId: string | null;
  surface: string;
  signal?: AbortSignal | undefined;
  /** A turn the deterministic guards own, known only once the candidates are. */
  precondition?: DecisionSkipReason | undefined;
}

export interface SemanticDecisionResult {
  mode: DecisionFlagMode;
  outcome: DecisionOutcome;
  /** Set when the host declined to ask at all, rather than asking and failing. */
  skipReason?: DecisionSkipReason;
  model: string | null;
}

function declined(
  mode: DecisionFlagMode,
  reason: DecisionSkipReason,
  fallbackReason: 'disabled' | 'policy',
): SemanticDecisionResult {
  return {
    mode,
    outcome: { status: 'fallback', reason: fallbackReason, latencyMs: 0 },
    skipReason: reason,
    model: null,
  };
}

// Zero `billedCents` and no customer figure, so the row moves margin and never
// a balance. A failed write is logged and dropped.
function meter(input: {
  context: SemanticDecisionContext;
  kind: DecisionKind;
  config: DecisionTransportConfig;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): void {
  const cost = decisionCost(input.inputTokens, input.config);
  void recordProviderCostEvent({
    userId: input.context.userId,
    organizationId: input.context.organizationId,
    capability: 'decision',
    provider: DECISION_TRANSPORT_ID,
    model: input.model,
    unitBasis: 'token',
    units: input.inputTokens,
    providerCostCents: cost.cents,
    billedCents: 0,
    sourceRef: input.context.decisionId,
    surface: input.context.surface,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    workload: 'chat',
    metadata: { decisionKind: input.kind, providerCostMicrousd: cost.microusd },
  }).catch((error: unknown) => {
    logger.warn(
      { error, decisionId: input.context.decisionId, kind: input.kind },
      '[semantic-decisions] cost event was not recorded',
    );
  });
}

// Reached only through an open gate, so there is no mode, sample or
// eligibility left to decide: this asks, accounts for the answer, and returns.
export async function evaluateSemanticDecision(input: {
  kind: DecisionKind;
  request: DecisionRequest;
  gate: Extract<DecisionGate, { asks: true }>;
  context: SemanticDecisionContext;
}): Promise<SemanticDecisionResult> {
  const { gate } = input;

  const precondition = input.context.precondition;
  if (precondition) {
    recordSemanticDecision({
      kind: input.kind,
      mode: gate.mode,
      outcome: 'skipped',
      reason: precondition,
    });
    return declined(gate.mode, precondition, 'policy');
  }

  // The transport can refuse the configuration it was handed: an operator
  // mistake, not a reason for a turn to fail.
  let run: Evaluator;
  try {
    run = evaluatorFor(input.kind, gate.config);
  } catch (error) {
    logger.error({ error }, '[semantic-decisions] decision transport could not be created');
    return declined(gate.mode, 'unconfigured', 'disabled');
  }

  const outcome = await inFlightPolicy.run(gate.policy, () =>
    run(input.request, {
      trustMode: gate.trustMode,
      providerAllowed: true,
      cohort: gate.cohort,
      ...(input.context.signal ? { signal: input.context.signal } : {}),
    }),
  );

  recordSemanticDecision({
    kind: input.kind,
    mode: gate.mode,
    outcome: outcome.status,
    latencyMs: outcome.latencyMs,
    ...(outcome.status === 'fallback' ? { reason: outcome.reason } : {}),
  });

  if (outcome.status !== 'fallback') {
    meter({
      context: input.context,
      kind: input.kind,
      config: gate.config,
      model: outcome.result.model,
      inputTokens: outcome.result.inputTokens,
      outputTokens: outcome.result.outputTokens,
    });
  }

  return {
    mode: gate.mode,
    outcome,
    model: outcome.status === 'fallback' ? null : outcome.result.model,
  };
}

/** Test seam: the provider and evaluators are process-wide by design. */
export function resetSemanticDecisionHost(): void {
  cachedProvider = null;
  evaluators.clear();
}

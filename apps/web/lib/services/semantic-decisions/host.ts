import 'server-only';

import { AsyncLocalStorage } from 'node:async_hooks';

import {
  createDecisionEvaluator,
  type DecisionOutcome,
  type DecisionPolicy,
  type DecisionRequest,
} from '@agiworkforce/agent-core';
import { createTypeSafeDecisionProvider } from '@agiworkforce/provider-runtime/decisions';

import type { FlagEvaluation } from '@/lib/feature-flags/evaluate-flags';
import type { FlagDefinition } from '@/lib/feature-flags/flag-definition';
import type { DecisionFlagMode } from '@/lib/feature-flags/decision-flags';
import { logger } from '@/lib/logger';
import { recordSemanticDecision } from '@/lib/observability/metrics';
import { recordProviderCostEvent } from '@/lib/services/cogs-ledger-service';

import { decisionCost, readDecisionTransportConfig, type DecisionTransportConfig } from './config';
import { evaluateDecisionEligibility, type DecisionEligibilityFacts } from './eligibility';
import { DECISION_BUDGET, resolveDecisionPolicy } from './policy';
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

export interface SemanticDecisionContext {
  requestId: string;
  /** Unique per evaluation: the ledger's idempotency key and the trace's own id. */
  decisionId: string;
  userId: string;
  organizationId: string | null;
  surface: string;
  /** The id the flag rollout buckets by, so the two gates select one population. */
  bucketId: string;
  eligibility: DecisionEligibilityFacts;
  flagEvaluations: Readonly<Record<string, FlagEvaluation>>;
  flagDefinitions: readonly FlagDefinition[];
  signal?: AbortSignal | undefined;
  nowMs?: number;
  /** A turn the deterministic guards own. Read after the flag, so an off kind records nothing. */
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

export async function evaluateSemanticDecision(input: {
  kind: DecisionKind;
  request: DecisionRequest;
  context: SemanticDecisionContext;
}): Promise<SemanticDecisionResult> {
  const state = readDecisionTransportConfig();
  if (!state.configured) return declined('disabled', 'unconfigured', 'disabled');

  const resolved = resolveDecisionPolicy({
    kind: input.kind,
    model: state.config.model,
    evaluations: input.context.flagEvaluations,
    definitions: input.context.flagDefinitions,
    bucketId: input.context.bucketId,
    nowMs: input.context.nowMs ?? Date.now(),
  });
  // Nothing recorded while a kind is off: that is every request today, and a
  // per-turn counter for a feature nobody enabled is noise.
  if (resolved.mode === 'disabled') {
    return {
      mode: 'disabled',
      outcome: { status: 'fallback', reason: 'disabled', latencyMs: 0 },
      model: null,
    };
  }

  const precondition = input.context.precondition;
  if (precondition) {
    recordSemanticDecision({
      kind: input.kind,
      mode: resolved.mode,
      outcome: 'skipped',
      reason: precondition,
    });
    return declined(resolved.mode, precondition, 'policy');
  }

  const eligibility = evaluateDecisionEligibility(input.context.eligibility);
  if (!eligibility.eligible) {
    recordSemanticDecision({
      kind: input.kind,
      mode: resolved.mode,
      outcome: 'skipped',
      reason: eligibility.reason,
    });
    return declined(resolved.mode, eligibility.reason, 'policy');
  }

  // The transport can refuse the configuration it was handed: an operator
  // mistake, not a reason for a turn to fail.
  let run: Evaluator;
  try {
    run = evaluatorFor(input.kind, state.config);
  } catch (error) {
    logger.error({ error }, '[semantic-decisions] decision transport could not be created');
    return declined(resolved.mode, 'unconfigured', 'disabled');
  }

  const outcome = await inFlightPolicy.run(resolved.policy, () =>
    run(input.request, {
      trustMode: input.context.eligibility.privacyMode,
      providerAllowed: true,
      cohort: resolved.cohort,
      ...(input.context.signal ? { signal: input.context.signal } : {}),
    }),
  );

  recordSemanticDecision({
    kind: input.kind,
    mode: resolved.mode,
    outcome: outcome.status,
    latencyMs: outcome.latencyMs,
    ...(outcome.status === 'fallback' ? { reason: outcome.reason } : {}),
  });

  if (outcome.status !== 'fallback') {
    meter({
      context: input.context,
      kind: input.kind,
      config: state.config,
      model: outcome.result.model,
      inputTokens: outcome.result.inputTokens,
      outputTokens: outcome.result.outputTokens,
    });
  }

  return {
    mode: resolved.mode,
    outcome,
    model: outcome.status === 'fallback' ? null : outcome.result.model,
  };
}

/** Test seam: the provider and evaluators are process-wide by design. */
export function resetSemanticDecisionHost(): void {
  cachedProvider = null;
  evaluators.clear();
}

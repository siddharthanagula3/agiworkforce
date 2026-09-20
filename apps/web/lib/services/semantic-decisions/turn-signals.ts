// Shadow only: compares one batch of answers with the classifier's and writes
// a bounded row. It changes no route, no latency and nothing a user sees.
import 'server-only';

import { after } from 'next/server';

import type { DecisionAnswer } from '@agiworkforce/agent-core';
import { modelRegistry } from '@agiworkforce/model-registry';
import type { TaskFamily } from '@agiworkforce/routing';
import type { PrivacyMode } from '@agiworkforce/types';

import { DECISION_FLAG_PREFIX } from '@/lib/feature-flags/decision-flags';
import {
  buildFlagSubject,
  evaluateFlagsForSubject,
} from '@/lib/feature-flags/flag-evaluation-service';
import { getActiveFlagDefinitions } from '@/lib/feature-flags/flag-store';
import { logger } from '@/lib/logger';
import { recordSemanticDecisionComparison } from '@/lib/observability/metrics';

import { evaluateSemanticDecision } from './host';
import { confidenceBin, type DecisionSkipReason } from './kinds';
import { buildTurnSignalsRequest } from './questions';
import {
  persistSemanticDecisionTraces,
  type SemanticDecisionTrace,
  type DecisionTraceMode,
} from './trace-service';

const KIND = 'turn_signals' as const;

const AMBIGUOUS_BASELINE = 'ambiguous';

export interface TurnSignalsShadowInput {
  request: Request;
  requestId: string;
  userId: string;
  organizationId: string | null;
  plan: string | null;
  surface: string;
  /** The selection the user made, so an explicitly named model is left alone. */
  modelSelection: string;
  latestUserMessage: string;
  previousUserMessage: string | null;
  hasAttachments: boolean;
  /** What `classifyTaskFamily` answered for this turn, null when it abstained. */
  baselineTaskFamily: TaskFamily | null;
  privacyMode: PrivacyMode;
  zeroDataRetentionOnly: boolean;
  workspaceModelPolicy: {
    allowedProviders?: readonly string[];
    blockedProviders?: readonly string[];
  } | null;
  residencyRegion: string | null;
}

function isAutoSelection(selection: string): boolean {
  return Object.prototype.hasOwnProperty.call(modelRegistry.policies.auto.aliases, selection);
}

// Turns the deterministic guards own outright, where a second opinion has
// nothing to compare against or no request to classify.
function precondition(input: TurnSignalsShadowInput): DecisionSkipReason | undefined {
  if (input.hasAttachments) return 'attachments_present';
  if (!isAutoSelection(input.modelSelection)) return 'explicit_model';
  if (input.latestUserMessage.trim().length === 0) return 'no_text';
  return undefined;
}

function decisionId(requestId: string): string {
  return `${KIND}:${requestId}`;
}

function booleanTrace(
  base: Omit<SemanticDecisionTrace, 'questionKey' | 'candidateValue' | 'probabilityBin'>,
  questionKey: string,
  answer: DecisionAnswer | undefined,
): SemanticDecisionTrace | null {
  if (answer?.kind !== 'boolean') return null;
  // Binned rather than compared against a cutoff: this consumer acts on
  // nothing, and calibration has not chosen a threshold yet.
  return {
    ...base,
    questionKey,
    candidateValue: null,
    probabilityBin: confidenceBin(answer.probability),
  };
}

export async function runTurnSignalsShadow(input: TurnSignalsShadowInput): Promise<void> {
  const subject = buildFlagSubject(input.request, {
    userId: input.userId,
    workspaceId: input.organizationId,
    role: null,
    plan: input.plan,
    surface: input.surface,
  });
  const nowMs = Date.now();
  const [evaluations, definitions] = await Promise.all([
    evaluateFlagsForSubject(subject, { keyPrefix: DECISION_FLAG_PREFIX }, nowMs),
    getActiveFlagDefinitions(nowMs),
  ]);

  const result = await evaluateSemanticDecision({
    kind: KIND,
    request: buildTurnSignalsRequest({
      latestUserMessage: input.latestUserMessage,
      previousUserMessage: input.previousUserMessage,
    }),
    context: {
      requestId: input.requestId,
      decisionId: decisionId(input.requestId),
      userId: input.userId,
      organizationId: input.organizationId,
      surface: input.surface,
      bucketId: input.userId,
      flagEvaluations: evaluations,
      flagDefinitions: definitions,
      nowMs,
      precondition: precondition(input),
      eligibility: {
        privacyMode: input.privacyMode,
        workspaceId: input.organizationId,
        zeroDataRetentionOnly: input.zeroDataRetentionOnly,
        workspaceModelPolicy: input.workspaceModelPolicy,
        residencyRegion: input.residencyRegion,
      },
    },
  });

  if (result.mode === 'disabled' || result.skipReason) return;

  const mode: DecisionTraceMode = result.mode === 'enabled' ? 'served' : 'shadow';
  const baseline = input.baselineTaskFamily ?? AMBIGUOUS_BASELINE;
  const base = {
    decisionId: decisionId(input.requestId),
    requestId: input.requestId,
    kind: KIND,
    mode,
    baselineValue: null,
    agree: null,
    confidenceBin: null,
    fallbackReason: null,
    model: result.model,
    latencyMs: result.outcome.latencyMs,
    inputTokens: null,
  } satisfies Omit<SemanticDecisionTrace, 'questionKey' | 'candidateValue' | 'probabilityBin'>;

  if (result.outcome.status === 'fallback') {
    persistSemanticDecisionTraces([
      {
        ...base,
        questionKey: 'task_family',
        baselineValue: baseline,
        candidateValue: null,
        probabilityBin: null,
        fallbackReason: result.outcome.reason,
      },
    ]);
    return;
  }

  const { answers, inputTokens } = result.outcome.result;
  const withUsage = { ...base, inputTokens };
  const traces: SemanticDecisionTrace[] = [];

  const family = answers['task_family'];
  if (family?.kind === 'choice') {
    const bin = confidenceBin(family.confidence);
    const agree = family.value === baseline;
    traces.push({
      ...withUsage,
      questionKey: 'task_family',
      baselineValue: baseline,
      candidateValue: family.value,
      agree,
      confidenceBin: bin,
      probabilityBin: null,
    });
    recordSemanticDecisionComparison({
      kind: KIND,
      question: 'task_family',
      agree,
      confidenceBin: bin,
    });
  }

  for (const key of [
    'needs_current_information',
    'needs_external_tools',
    'needs_code_understanding',
  ]) {
    const trace = booleanTrace(withUsage, key, answers[key]);
    if (trace) traces.push(trace);
  }

  const complexity = answers['semantic_complexity'];
  if (complexity?.kind === 'score') {
    traces.push({
      ...withUsage,
      questionKey: 'semantic_complexity',
      candidateValue: `level_${Math.round(complexity.value)}`,
      confidenceBin: confidenceBin(complexity.confidence),
      probabilityBin: null,
    });
  }

  persistSemanticDecisionTraces(traces);
}

function swallow(requestId: string): (error: unknown) => void {
  return (error: unknown) => {
    try {
      logger.warn({ error, requestId }, '[semantic-decisions] shadow failed');
    } catch {
      /* A failed log must not turn a dropped shadow into an unhandled rejection. */
    }
  };
}

// `after` holds the invocation open past the response flush, which a detached
// promise does not. A callback, so nothing starts where `after` itself throws.
export function scheduleTurnSignalsShadow(input: TurnSignalsShadowInput): void {
  try {
    after(() => runTurnSignalsShadow(input).catch(swallow(input.requestId)));
  } catch (error) {
    swallow(input.requestId)(error);
  }
}

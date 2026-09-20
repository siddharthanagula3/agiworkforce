// Shadow only: compares one batch of answers with the classifier's and writes
// a bounded row. It changes no route, no latency and nothing a user sees.
import 'server-only';

import type { DecisionAnswer } from '@agiworkforce/agent-core';
import { modelRegistry } from '@agiworkforce/model-registry';
import type { TaskFamily } from '@agiworkforce/routing';
import { recordSemanticDecisionComparison } from '@/lib/observability/metrics';

import { confidenceBin, type DecisionSkipReason } from './kinds';
import { buildTurnSignalsRequest } from './questions/turn-signals';
import {
  decisionGate,
  decisionIdFor,
  runShadowDecision,
  scheduleShadow,
  type SemanticDecisionScope,
} from './shadow';
import {
  persistSemanticDecisionTraces,
  type SemanticDecisionTrace,
  type DecisionTraceMode,
} from './trace-service';

const KIND = 'turn_signals' as const;

const AMBIGUOUS_BASELINE = 'ambiguous';

export interface TurnSignalsTurn {
  /** The selection the user made, so an explicitly named model is left alone. */
  modelSelection: string;
  latestUserMessage: string;
  previousUserMessage: string | null;
  hasAttachments: boolean;
  /** What `classifyTaskFamily` answered for this turn, null when it abstained. */
  baselineTaskFamily: TaskFamily | null;
}

export interface TurnSignalsShadowInput {
  scope: SemanticDecisionScope;
  /** Called past the response and only once the gate opens. */
  derive: () => TurnSignalsTurn;
}

function isAutoSelection(selection: string): boolean {
  return Object.prototype.hasOwnProperty.call(modelRegistry.policies.auto.aliases, selection);
}

// Turns the deterministic guards own outright, where a second opinion has
// nothing to compare against or no request to classify.
function precondition(turn: TurnSignalsTurn): DecisionSkipReason | undefined {
  if (turn.hasAttachments) return 'attachments_present';
  if (!isAutoSelection(turn.modelSelection)) return 'explicit_model';
  if (turn.latestUserMessage.trim().length === 0) return 'no_text';
  return undefined;
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
  const gate = await decisionGate(input.scope, KIND);
  if (!gate.asks) return;

  const turn = input.derive();
  const skip = precondition(turn);
  const result = await runShadowDecision({
    kind: KIND,
    scope: input.scope,
    gate,
    request: buildTurnSignalsRequest({
      latestUserMessage: turn.latestUserMessage,
      previousUserMessage: turn.previousUserMessage,
    }),
    precondition: skip,
  });

  if (result.skipReason) return;

  const mode: DecisionTraceMode = result.mode === 'enabled' ? 'served' : 'shadow';
  const baseline = turn.baselineTaskFamily ?? AMBIGUOUS_BASELINE;
  const base = {
    decisionId: decisionIdFor(KIND, input.scope.requestId),
    requestId: input.scope.requestId,
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

export function scheduleTurnSignalsShadow(input: TurnSignalsShadowInput): void {
  scheduleShadow(KIND, input.scope.requestId, () => runTurnSignalsShadow(input));
}

// Shadow only, and selection for request context only: nothing is deleted,
// reordered or rewritten in storage by anything in this file.
import 'server-only';

import { recordSemanticDecisionComparison } from '@/lib/observability/metrics';

import { confidenceBin } from '../kinds';
import {
  buildMemoryRelevanceRequest,
  selectMemories,
  unpinnedCount,
  type MemoryCandidate,
} from '../questions/memory-relevance';
import {
  decisionGate,
  decisionIdFor,
  runShadowDecision,
  scheduleShadow,
  type SemanticDecisionScope,
} from '../shadow';
import { persistSemanticDecisionTraces, type SemanticDecisionTrace } from '../trace-service';

const KIND = 'memory_relevance' as const;

/** Chosen on the calibration split only. Below this the memory is kept. */
export const MEMORY_MINIMUM_CONFIDENCE = 0.6;

export interface MemoryRelevanceTurn {
  latestUserMessage: string;
  memories: readonly MemoryCandidate[];
}

export interface MemoryRelevanceShadowInput {
  scope: SemanticDecisionScope;
  /** Called past the response and only once the gate opens. */
  derive: () => MemoryRelevanceTurn;
}

function chars(memories: readonly MemoryCandidate[]): number {
  return memories.reduce((sum, memory) => sum + memory.content.length, 0);
}

export async function runMemoryRelevanceShadow(input: MemoryRelevanceShadowInput): Promise<void> {
  const gate = await decisionGate(input.scope, KIND);
  if (!gate.asks) return;

  const turn = input.derive();
  // Code first: a pinned row always passes and is never asked about.
  const asked = unpinnedCount(turn.memories);
  const result = await runShadowDecision({
    kind: KIND,
    scope: input.scope,
    gate,
    request: buildMemoryRelevanceRequest({
      latestUserMessage: turn.latestUserMessage,
      candidates: turn.memories,
    }),
    precondition:
      asked === 0
        ? 'no_candidates'
        : turn.latestUserMessage.trim().length === 0
          ? 'no_text'
          : undefined,
  });
  if (result.skipReason) return;

  const selection = selectMemories(result.outcome, turn.memories, MEMORY_MINIMUM_CONFIDENCE);
  const agree = selection.dropped.length === 0;
  const bin = confidenceBin(
    turn.memories.length === 0 ? 1 : selection.kept.length / turn.memories.length,
  );
  const trace: SemanticDecisionTrace = {
    decisionId: decisionIdFor(KIND, input.scope.requestId),
    requestId: input.scope.requestId,
    kind: KIND,
    mode: result.mode === 'enabled' ? 'served' : 'shadow',
    questionKey: 'memory_selection',
    baselineValue: `n${turn.memories.length}c${chars(turn.memories)}`,
    candidateValue: `n${selection.kept.length}c${chars(selection.kept)}`,
    agree,
    confidenceBin: bin,
    probabilityBin: confidenceBin(asked === 0 ? 0 : selection.standingInstructions / asked),
    fallbackReason: result.outcome.status === 'fallback' ? result.outcome.reason : null,
    model: result.model,
    latencyMs: result.outcome.latencyMs,
    inputTokens: result.outcome.status === 'fallback' ? null : result.outcome.result.inputTokens,
  };
  persistSemanticDecisionTraces([trace]);
  if (result.outcome.status !== 'fallback') {
    recordSemanticDecisionComparison({
      kind: KIND,
      question: 'memory_selection',
      agree,
      confidenceBin: bin,
    });
  }
}

export function scheduleMemoryRelevanceShadow(input: MemoryRelevanceShadowInput): void {
  scheduleShadow(KIND, input.scope.requestId, () => runMemoryRelevanceShadow(input));
}

// Shadow only: the regex gate still decides whether the extraction runs. This
// records what it would have decided, and what the extraction actually found.
import 'server-only';

import { recordSemanticDecisionComparison } from '@/lib/observability/metrics';

import { confidenceBin } from '../kinds';
import {
  buildMemoryWorthExtractingRequest,
  interpretWorthExtracting,
} from '../questions/memory-worth-extracting';
import {
  decisionGate,
  decisionIdFor,
  runShadowDecision,
  scheduleShadow,
  type SemanticDecisionScope,
} from '../shadow';
import { persistSemanticDecisionTraces, type SemanticDecisionTrace } from '../trace-service';

const KIND = 'memory_worth_extracting' as const;

/** Chosen on the calibration split only. */
export const WORTH_EXTRACTING_THRESHOLD = 0.5;

export interface WorthExtractingTurn {
  message: string;
  /** What `isMemoryExtractionWorthwhile` answered, which is what production did. */
  regexGate: boolean;
  /**
   * Whether the extraction that ran actually returned a fact. It is the ground
   * truth that turns agreement into a measured wasted-call rate, and it is only
   * known when the regex gate opened.
   */
  extractionFoundFact: boolean | null;
}

export interface WorthExtractingShadowInput {
  scope: SemanticDecisionScope;
  /** Re-reading the regex gate is itself work, so it waits for the gate. */
  derive: () => WorthExtractingTurn;
}

export async function runWorthExtractingShadow(input: WorthExtractingShadowInput): Promise<void> {
  const gate = await decisionGate(input.scope, KIND);
  if (!gate.asks) return;

  const turn = input.derive();
  const result = await runShadowDecision({
    kind: KIND,
    scope: input.scope,
    gate,
    request: buildMemoryWorthExtractingRequest(turn.message),
    precondition: turn.message.trim().length === 0 ? 'no_text' : undefined,
  });
  if (result.skipReason) return;

  const verdict = interpretWorthExtracting(
    result.outcome,
    WORTH_EXTRACTING_THRESHOLD,
    turn.regexGate,
  );
  const agree = verdict.status === 'answered' ? verdict.extract === turn.regexGate : null;
  const bin = verdict.probability === null ? null : confidenceBin(verdict.probability);
  const trace: SemanticDecisionTrace = {
    decisionId: decisionIdFor(KIND, input.scope.requestId),
    requestId: input.scope.requestId,
    kind: KIND,
    mode: result.mode === 'enabled' ? 'served' : 'shadow',
    questionKey: 'worth_extracting',
    baselineValue: turn.regexGate ? 'extract' : 'skip',
    candidateValue: verdict.status === 'fallback' ? null : verdict.extract ? 'extract' : 'skip',
    agree,
    confidenceBin: bin,
    // The outcome the gate is priced against: extraction ran and found nothing.
    probabilityBin:
      turn.extractionFoundFact === null ? null : turn.extractionFoundFact ? 'p80_100' : 'p00_20',
    fallbackReason: result.outcome.status === 'fallback' ? result.outcome.reason : null,
    model: result.model,
    latencyMs: result.outcome.latencyMs,
    inputTokens: result.outcome.status === 'fallback' ? null : result.outcome.result.inputTokens,
  };
  persistSemanticDecisionTraces([trace]);
  if (agree !== null && bin !== null) {
    recordSemanticDecisionComparison({
      kind: KIND,
      question: 'worth_extracting',
      agree,
      confidenceBin: bin,
    });
  }
}

export function scheduleWorthExtractingShadow(input: WorthExtractingShadowInput): void {
  scheduleShadow(KIND, input.scope.requestId, () => runWorthExtractingShadow(input));
}

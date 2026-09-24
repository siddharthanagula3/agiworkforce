// Shadow only: the lexical shortlist still builds the turn, and a tool this
// would have dropped is still one load_connector_tools call away.
import 'server-only';

import { recordSemanticDecisionComparison } from '@/lib/observability/metrics';

import { confidenceBin } from '../kinds';
import {
  buildToolShortlistRequest,
  partitionCandidates,
  selectShortlist,
  type ShortlistCandidate,
} from '../questions/connector-tool-shortlist';
import {
  decisionGate,
  decisionIdFor,
  runShadowDecision,
  scheduleShadow,
  type SemanticDecisionScope,
} from '../shadow';
import { persistSemanticDecisionTraces, type SemanticDecisionTrace } from '../trace-service';

const KIND = 'connector_tool_shortlist' as const;

/**
 * Chosen on the calibration split only. `maybe` is deliberately low: a tool
 * carried costs bytes, a tool missed costs the task.
 */
export const SHORTLIST_THRESHOLDS = { keep: 0.5, maybe: 0.2 } as const;

export interface ToolShortlistTurn {
  latestUserMessage: string;
  previousUserMessage: string | null;
  candidates: readonly ShortlistCandidate[];
  /** What the lexical ranking admitted, so the two are compared at one budget. */
  baselineQualifiedNames: readonly string[];
  budget: { maxTools: number; maxSchemaBytes: number };
  /** Tools already called in this conversation, which code passes untouched. */
  alreadyCalledQualifiedNames?: readonly string[];
  pinnedQualifiedNames?: readonly string[];
}

export interface ToolShortlistShadowInput {
  scope: SemanticDecisionScope;
  /**
   * Ranking the catalog a second time and counting every tool's schema bytes
   * is the expensive half of this kind, so the response path hands over a
   * closure and none of it runs until the gate opens.
   */
  derive: () => ToolShortlistTurn;
}

// First-party connector ids are a closed vocabulary this deployment ships. A
// custom MCP server's tool names are the customer's and are only ever counted.
function overlapCounts(
  baseline: readonly string[],
  candidate: readonly ShortlistCandidate[],
): { overlap: number; baselineOnly: number; candidateOnly: number } {
  const chosen = new Set(candidate.map((tool) => tool.qualifiedName));
  const before = new Set(baseline);
  let overlap = 0;
  for (const name of before) if (chosen.has(name)) overlap += 1;
  return {
    overlap,
    baselineOnly: before.size - overlap,
    candidateOnly: chosen.size - overlap,
  };
}

export async function runToolShortlistShadow(input: ToolShortlistShadowInput): Promise<void> {
  const gate = await decisionGate(input.scope, KIND);
  if (!gate.asks) return;

  const turn = input.derive();
  const { decided, asked } = partitionCandidates(
    turn.candidates,
    turn.latestUserMessage,
    turn.alreadyCalledQualifiedNames ?? [],
    turn.pinnedQualifiedNames ?? [],
  );
  const result = await runShadowDecision({
    kind: KIND,
    scope: input.scope,
    gate,
    request: buildToolShortlistRequest({
      latestUserMessage: turn.latestUserMessage,
      previousUserMessage: turn.previousUserMessage,
      candidates: asked,
    }),
    precondition: asked.length === 0 ? 'no_candidates' : undefined,
  });
  if (result.skipReason) return;

  const selection = selectShortlist(
    result.outcome,
    asked,
    SHORTLIST_THRESHOLDS,
    turn.budget,
    decided,
  );
  const counts = overlapCounts(turn.baselineQualifiedNames, selection.tools);
  const bin =
    result.outcome.status === 'fallback'
      ? null
      : confidenceBin(selection.tools.length / Math.max(1, turn.candidates.length));
  const trace: SemanticDecisionTrace = {
    decisionId: decisionIdFor(KIND, input.scope.requestId),
    requestId: input.scope.requestId,
    kind: KIND,
    mode: result.mode === 'enabled' ? 'served' : 'shadow',
    questionKey: 'tool_shortlist',
    baselineValue: `n${turn.baselineQualifiedNames.length}`,
    candidateValue: `n${selection.tools.length}`,
    agree: counts.baselineOnly === 0 && counts.candidateOnly === 0,
    confidenceBin: bin,
    probabilityBin: null,
    fallbackReason: result.outcome.status === 'fallback' ? result.outcome.reason : null,
    model: result.model,
    latencyMs: result.outcome.latencyMs,
    inputTokens: result.outcome.status === 'fallback' ? null : result.outcome.result.inputTokens,
  };
  persistSemanticDecisionTraces([trace]);
  if (result.outcome.status !== 'fallback') {
    recordSemanticDecisionComparison({
      kind: KIND,
      question: 'tool_shortlist',
      agree: trace.agree === true,
      confidenceBin: bin ?? 'p00_20',
    });
  }
}

export function scheduleToolShortlistShadow(input: ToolShortlistShadowInput): void {
  scheduleShadow(KIND, input.scope.requestId, () => runToolShortlistShadow(input));
}

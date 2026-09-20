import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import type { RolloutEvaluationConfig } from '@/lib/services/model-rollout/rollout-evaluation-service';

import type { DecisionConfidenceBin, DecisionKind } from './kinds';

export type DecisionTraceMode = 'served' | 'shadow';

// Bounded labels only, and no subject or tenant column of its own. It is not
// anonymous: request_id and decision_id join out. See audit.md.
export interface SemanticDecisionTrace {
  decisionId: string;
  requestId: string;
  kind: DecisionKind;
  mode: DecisionTraceMode;
  questionKey: string;
  baselineValue: string | null;
  candidateValue: string | null;
  agree: boolean | null;
  confidenceBin: DecisionConfidenceBin | null;
  probabilityBin: DecisionConfidenceBin | null;
  fallbackReason: string | null;
  model: string | null;
  latencyMs: number | null;
  inputTokens: number | null;
}

function nonNegativeInteger(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}

export async function recordSemanticDecisionTraces(
  traces: readonly SemanticDecisionTrace[],
  db: DatabaseAdapter = getNeonDb(),
): Promise<void> {
  for (const trace of traces) {
    await db.execute(
      `insert into public.semantic_decision_traces (
         decision_id, request_id, decision_kind, mode, question_key,
         baseline_value, candidate_value, agree, confidence_bin, probability_bin,
         fallback_reason, model, latency_ms, input_tokens
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       on conflict (decision_id, question_key) do nothing`,
      [
        trace.decisionId,
        trace.requestId,
        trace.kind,
        trace.mode,
        trace.questionKey,
        trace.baselineValue,
        trace.candidateValue,
        trace.agree,
        trace.confidenceBin,
        trace.probabilityBin,
        trace.fallbackReason,
        trace.model,
        nonNegativeInteger(trace.latencyMs),
        nonNegativeInteger(trace.inputTokens),
      ],
    );
  }
}

// Bounded: a long-lived instance serves unboundedly many turns, and a set that
// only grows is a leak wearing a cache's clothes.
const PENDING_TRACE_LIMIT = 2_000;
const pendingTraces = new Set<string>();

// Telemetry about a decision already discarded, so a failed write is logged
// and dropped: it must never fail, delay or reorder the turn.
export function persistSemanticDecisionTraces(traces: readonly SemanticDecisionTrace[]): void {
  if (traces.length === 0) return;
  const decisionId = traces[0]?.decisionId ?? '';
  if (pendingTraces.has(decisionId)) return;
  if (pendingTraces.size >= PENDING_TRACE_LIMIT) {
    pendingTraces.delete(pendingTraces.values().next().value ?? '');
  }
  pendingTraces.add(decisionId);
  void recordSemanticDecisionTraces(traces).catch((error: unknown) => {
    logger.warn(
      { error, decisionId, kind: traces[0]?.kind },
      '[semantic-decisions] trace was not persisted',
    );
  });
}

// The routing sweep's own window, not a second literal that happens to match:
// a rename or a retune there has to reach here.
export type SemanticDecisionRetention = Pick<
  RolloutEvaluationConfig,
  'traceRetentionDays' | 'retentionBatchSize'
>;

// Rows belong to no conversation, so they retire on a window rather than with
// one. Swept beside the routing traces so one dial governs both.
export async function purgeExpiredSemanticDecisionTraces(
  config: SemanticDecisionRetention,
  nowMs: number,
  db: DatabaseAdapter = getNeonDb(),
): Promise<number> {
  const cutoff = new Date(nowMs - config.traceRetentionDays * 24 * 60 * 60 * 1000);
  return db.execute(
    `delete from public.semantic_decision_traces
      where id in (
        select id from public.semantic_decision_traces
         where created_at < $1
         order by created_at
         limit $2
      )`,
    [cutoff.toISOString(), Math.round(config.retentionBatchSize)],
  );
}

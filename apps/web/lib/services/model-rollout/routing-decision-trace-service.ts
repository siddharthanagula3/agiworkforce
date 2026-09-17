import 'server-only';

import type { RoutingDecisionTrace } from '@agiworkforce/routing';

import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';

export type RoutingTraceKind = 'served' | 'shadow';

export interface RoutingDecisionRecord {
  trace: RoutingDecisionTrace;
  requestId: string;
  userId: string | null;
  organizationId: string | null;
  surface: string;
  kind: RoutingTraceKind;
  flagVariants: Readonly<Record<string, string>>;
}

export interface RoutingDecisionOutcome {
  requestId: string;
  kind: RoutingTraceKind;
  outcome: 'succeeded' | 'failed';
  errorCode?: string | null;
  ttftMs?: number | null;
  durationMs?: number | null;
  providerCostMicrousd?: number | null;
}

function nonNegativeInteger(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}

export async function recordRoutingDecision(record: RoutingDecisionRecord): Promise<void> {
  const { trace } = record;
  await getNeonDb().execute(
    `insert into public.routing_decision_traces (
       request_id, user_id, organization_id, surface, kind, status, selection, task_type,
       reason, code, model_key, provider, route_id, slot_id, cohort, lifecycle_stage, region,
       flag_variants, trace
     ) values ($1, $2, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
               $18::jsonb, $19::jsonb)
     on conflict (request_id, kind) do nothing`,
    [
      record.requestId,
      record.userId,
      record.organizationId,
      record.surface,
      record.kind,
      trace.status,
      trace.selection,
      trace.taskType,
      trace.reason,
      trace.code,
      trace.modelKey,
      trace.provider,
      trace.routeId,
      trace.slotId,
      trace.cohort,
      trace.lifecycleStage,
      trace.region,
      JSON.stringify(record.flagVariants),
      JSON.stringify(trace),
    ],
  );
}

export async function completeRoutingDecision(outcome: RoutingDecisionOutcome): Promise<void> {
  await getNeonDb().execute(
    `update public.routing_decision_traces
        set outcome = $3, error_code = $4, ttft_ms = $5, duration_ms = $6,
            provider_cost_microusd = coalesce($7, provider_cost_microusd), completed_at = now()
      where request_id = $1 and kind = $2
        and (completed_at is null or (outcome = 'failed' and $3 = 'succeeded'))`,
    [
      outcome.requestId,
      outcome.kind,
      outcome.outcome,
      outcome.errorCode?.slice(0, 100) ?? null,
      nonNegativeInteger(outcome.ttftMs),
      nonNegativeInteger(outcome.durationMs),
      nonNegativeInteger(outcome.providerCostMicrousd),
    ],
  );
}

/**
 * The decisions this process wrote a row for, so the completion of a turn whose
 * decision was never traced costs no statement. Bounded, because a long-lived
 * instance serves an unbounded number of turns.
 */
const PENDING_TRACE_LIMIT = 2_000;
const pendingTraces = new Set<string>();

function traceKey(requestId: string, kind: RoutingTraceKind): string {
  return `${kind}:${requestId}`;
}

/**
 * The trace is telemetry about a decision already made, so a write that fails
 * is logged and dropped: it must never fail, delay or reorder the turn itself.
 */
export function persistRoutingDecision(record: RoutingDecisionRecord): void {
  if (pendingTraces.size >= PENDING_TRACE_LIMIT) {
    pendingTraces.delete(pendingTraces.values().next().value ?? '');
  }
  pendingTraces.add(traceKey(record.requestId, record.kind));
  void recordRoutingDecision(record).catch((error: unknown) => {
    logger.warn(
      { error, requestId: record.requestId, kind: record.kind },
      '[routing-trace] decision was not persisted',
    );
  });
}

export function persistRoutingDecisionOutcome(outcome: RoutingDecisionOutcome): void {
  const key = traceKey(outcome.requestId, outcome.kind);
  if (!pendingTraces.has(key)) return;
  if (outcome.outcome === 'succeeded') pendingTraces.delete(key);
  void completeRoutingDecision(outcome).catch((error: unknown) => {
    logger.warn(
      { error, requestId: outcome.requestId, kind: outcome.kind },
      '[routing-trace] outcome was not persisted',
    );
  });
}

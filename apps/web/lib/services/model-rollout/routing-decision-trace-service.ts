import 'server-only';

import type { RoutingDecisionTrace } from '@agiworkforce/routing';

import { logger } from '@/lib/logger';
import {
  recordRoutingDecision as recordRoutingDecisionMetric,
  recordTurnOutcome,
  type WorkspaceKind,
} from '@/lib/observability/metrics';
import { normalizePromptStamps } from '@/lib/prompts/prompt-stamp';
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
  /** Prompt manifest stamps (`id@version`) in force for this decision. */
  promptIds?: readonly string[];
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
       flag_variants, trace, prompt_ids
     ) values ($1, $2, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
               $18::jsonb, $19::jsonb, $20::text[])
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
      normalizePromptStamps(record.promptIds),
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

/**
 * The dimensions a turn is attributed along live on the decision; the timings
 * and the cost arrive with the outcome. The turn metric needs both, so the
 * decision's facts are held until the outcome joins them.
 */
interface ServedTurnFacts {
  surface: string;
  provider: string | null;
  modelKey: string | null;
  routeId: string | null;
  mode: string;
  trustMode: string;
  workspaceKind: WorkspaceKind;
  cohort: string | null;
  fallbacks: number;
}

const COHORT_VARIANT_LIMIT = 4;

/**
 * The arm a turn was served under, as one label. The rollout cohort alone says
 * control or canary; the flag variants say which build of the product the
 * account actually saw, and release health is the join of the two. Sorted and
 * capped so the same set of variants is always the same series.
 */
function servedCohort(
  cohort: string | null,
  flagVariants: Readonly<Record<string, string>>,
): string | null {
  const variants = Object.entries(flagVariants)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, COHORT_VARIANT_LIMIT)
    .map(([flag, variant]) => `${flag}=${variant}`);
  const parts = [...(cohort ? [cohort] : []), ...variants];
  return parts.length > 0 ? parts.join(',') : null;
}

const pendingTraces = new Map<string, ServedTurnFacts | null>();

function traceKey(requestId: string, kind: RoutingTraceKind): string {
  return `${kind}:${requestId}`;
}

function servedTurnFacts(record: RoutingDecisionRecord): ServedTurnFacts {
  const { trace } = record;
  return {
    surface: record.surface,
    provider: trace.provider,
    modelKey: trace.modelKey,
    routeId: trace.routeId,
    mode: trace.taskType,
    trustMode: trace.trustMode,
    workspaceKind: record.organizationId ? 'organization' : 'personal',
    cohort: servedCohort(trace.cohort, record.flagVariants),
    fallbacks: trace.fallbacks.length,
  };
}

/**
 * The trace is telemetry about a decision already made, so a write that fails
 * is logged and dropped: it must never fail, delay or reorder the turn itself.
 */
export function persistRoutingDecision(record: RoutingDecisionRecord): void {
  // Emitted before the write and only for a served turn: the metric describes
  // the decision, which happened whether or not its row lands, and a shadow
  // turn is never delivered to anyone.
  if (record.kind === 'served') {
    const { trace } = record;
    recordRoutingDecisionMetric({
      status: trace.status,
      routeId: trace.routeId,
      provider: trace.provider,
      modelKey: trace.modelKey,
      cohort: trace.cohort,
      trustMode: trace.trustMode,
      region: trace.region,
      surface: record.surface,
    });
  }
  if (pendingTraces.size >= PENDING_TRACE_LIMIT) {
    pendingTraces.delete(pendingTraces.keys().next().value ?? '');
  }
  pendingTraces.set(
    traceKey(record.requestId, record.kind),
    record.kind === 'served' ? servedTurnFacts(record) : null,
  );
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
  const facts = pendingTraces.get(key) ?? null;
  if (outcome.outcome === 'succeeded') pendingTraces.delete(key);
  if (facts) {
    recordTurnOutcome({
      outcome: outcome.outcome,
      surface: facts.surface,
      provider: facts.provider,
      modelKey: facts.modelKey,
      routeId: facts.routeId,
      mode: facts.mode,
      trustMode: facts.trustMode,
      workspaceKind: facts.workspaceKind,
      cohort: facts.cohort,
      timeToFirstTokenMs: outcome.ttftMs,
      durationMs: outcome.durationMs,
      costMicroUsd: outcome.providerCostMicrousd,
      retries: facts.fallbacks,
      ...(outcome.errorCode ? { errorType: outcome.errorCode } : {}),
    });
  }
  void completeRoutingDecision(outcome).catch((error: unknown) => {
    logger.warn(
      { error, requestId: outcome.requestId, kind: outcome.kind },
      '[routing-trace] outcome was not persisted',
    );
  });
}

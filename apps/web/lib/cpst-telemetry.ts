import 'server-only';

/**
 * CPST (Cost Per Successful Task) — Stage 0 telemetry fields.
 *
 * Design source of truth:
 * `docs/design/execution-plan-contract-and-cpst-2026-08-05.md` §4.2 (the six
 * required fields) and §4.3 ("Phase 1 — no migration": every field lands in the
 * existing `usage jsonb` on `public.managed_usage_requests`, written through the
 * `usage` argument of `finalizeManagedUsageRequest`).
 *
 * SCOPE — MANAGED CLOUD ONLY. The managed-usage ledger is the only durable
 * per-request cost record in the repo, and it exists solely for the hosted
 * managed-cloud path. Nothing here runs for Local or BYOK execution, and nothing
 * here may be extended to those surfaces without the separate trust-boundary
 * decision tracked as OQ-8 in the design document. No user content, prompt text,
 * credential, or base URL is ever placed in these fields.
 *
 * CONTRACT for consumers: the `usage` column has no schema enforcement, so every
 * key below is OPTIONAL and absent-until-populated. A missing key means UNKNOWN.
 * It never means zero, never means false, and never means success. Rows written
 * before this module shipped carry none of these keys at all.
 *
 * NAMING (design doc §4.2 "Naming rule" and "Collision warning"): the jsonb
 * payload is camelCase; a future promoted SQL column is snake_case; the two
 * spellings are not interchangeable. `outcome` is already taken by
 * `finalizeManagedUsageRequest` (and `status` on the row) and describes the
 * CHARGE, not the task — hence `taskOutcome`, which must never be collapsed
 * back onto it.
 *
 * WHAT IS DELIBERATELY NOT PRODUCED YET:
 *  - `taskOutcome: 'success'` is never emitted. No verifier seam and no task
 *    identity exist yet (design doc OQ-4 / OQ-6), so a completed CHARGE is not
 *    evidence of a completed TASK. Billing success maps to `unknown`, which the
 *    design document calls a first-class value that must not be coerced.
 *  - `verifierResult` is the constant `'skipped'` until a verifier seam exists
 *    (OQ-4). The design document requires it to be recorded rather than omitted.
 *  - `retries` is present only when at least one in-request provider rotation
 *    actually happened (see `managed-failover.ts`). Task-scoped retry counting
 *    needs the task identifier that OQ-6 leaves undecided, so a request that
 *    never rotated reports the key as absent (unknown) rather than asserting a
 *    task-level zero it cannot know.
 *  - `routePlanId` is an INTERIM value, not an `ExecutionPlan` id. `ExecutionPlan`
 *    (design doc §3) does not exist yet, so the id is built from the resolver's
 *    own selected-route identity and is self-labelled `interim:` so no consumer
 *    mistakes it for a real plan id.
 */

/** Design doc §4.2 vocabulary for the task-level (not billing) outcome. */
export type CpstTaskOutcome = 'success' | 'failure' | 'abandoned' | 'unknown';

/** Design doc §4.2 vocabulary for the verifier result. */
export type CpstVerifierResult = 'pass' | 'fail' | 'skipped' | 'unavailable';

/**
 * The only verifier result this repo can honestly produce today. No verifier,
 * judge, or grader exists in the routing or usage paths (design doc §3 field 10,
 * OQ-4), so the field records "we did not check" rather than being omitted.
 */
export const CPST_VERIFIER_RESULT_NO_SEAM = 'skipped' satisfies CpstVerifierResult;

/**
 * The camelCase keys added to the managed-usage `usage` jsonb. Every key is
 * optional; absent means unknown.
 */
export interface CpstUsageFields {
  /** Task-level outcome. NEVER the billing outcome. */
  taskOutcome?: CpstTaskOutcome;
  /** Additional provider attempts inside this one billed request. */
  retries?: number;
  /** True when this request was served by something other than the first route. */
  fallbackUsed?: boolean;
  /** Human-readable reason the fallback happened; only present with fallbackUsed. */
  fallbackReason?: string;
  /** Always 'skipped' until a verifier seam exists (OQ-4). */
  verifierResult?: CpstVerifierResult;
  /** Interim route identity; see the `interim:` prefix note above. */
  routePlanId?: string;
  /** Canonical `RoutingTaskType` the classifier resolved for this request. */
  taskFamily?: string;
  /**
   * Classifier confidence for `taskFamily`. Design doc §4.2 requires it so that
   * low-confidence rows can be excluded from any later gate.
   */
  taskFamilyConfidence?: number;
}

/** Terminal signals the caller genuinely knows at a finalize call site. */
export interface CpstTerminalSignals {
  /**
   * The BILLING outcome passed to `finalizeManagedUsageRequest` — 'completed'
   * means charged, not succeeded.
   */
  billingOutcome: 'completed' | 'failed';
  /**
   * True only for an unambiguous abandonment: the client aborted the stream or
   * cancelled the run before a terminal answer existed.
   */
  cancelled?: boolean;
}

/**
 * Structural view of the fields a processed managed-cloud request already
 * carries. Declared structurally (not as an import of `ProcessedRequest`) so
 * this module stays free of any dependency on the chat-completions route.
 */
export interface CpstRequestView {
  usedFallback?: boolean | undefined;
  fallbackReason?: string | undefined;
  routePlanId?: string | undefined;
  resolvedTaskType?: string | undefined;
  classifierConfidence?: number | undefined;
  retries?: number | undefined;
}

/**
 * Interim `routePlanId`. `ExecutionPlan` does not exist yet (design doc §3), so
 * this composes the resolver's own selected-route identity: the harness that
 * will execute it, the registry route id, and the resolver's selection reason.
 *
 * Note for readers of the design doc: §4.2 suggests `routeDecision.code`, but
 * `code` exists only on `UnavailableAutoRoute` (packages/ai/routing/src/auto.ts).
 * An unavailable route is rejected with 422 before any reservation exists, so it
 * can never reach a finalize call. `SelectedAutoRoute` carries `routeId` and
 * `reason` instead, and those are what this id records.
 */
export function buildInterimRoutePlanId(route: {
  harnessId: string;
  routeId: string;
  reason: string;
}): string {
  return `interim:${route.harnessId}:${route.routeId}:${route.reason}`;
}

/**
 * Map the signals a finalize call site actually has onto the task outcome.
 *
 * `success` is intentionally unreachable: nothing in the repo can prove a task
 * succeeded (OQ-4/OQ-6). Producing it from a successful charge is exactly the
 * conflation the design document forbids.
 */
export function resolveCpstTaskOutcome(signals: CpstTerminalSignals): CpstTaskOutcome {
  if (signals.cancelled === true) return 'abandoned';
  if (signals.billingOutcome === 'failed') return 'failure';
  return 'unknown';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Build the additive CPST keys for one managed-usage finalize call.
 *
 * Only keys whose values are genuinely known are returned; everything else is
 * omitted so the consumer contract ("absent means unknown") holds. The result is
 * meant to be spread into the SAME `usage` object the call site already builds:
 * `finalize_managed_usage_request` REPLACES the row's `usage` jsonb wholesale
 * (apps/web/db/neon/0056_managed_usage_request_lifecycle.sql), so a second
 * follow-up write would erase the accounting keys instead of adding to them.
 */
export function buildCpstUsageFields(
  view: CpstRequestView,
  signals: CpstTerminalSignals,
): CpstUsageFields {
  const fields: CpstUsageFields = {
    taskOutcome: resolveCpstTaskOutcome(signals),
    verifierResult: CPST_VERIFIER_RESULT_NO_SEAM,
  };

  if (typeof view.usedFallback === 'boolean') {
    fields.fallbackUsed = view.usedFallback;
    if (view.usedFallback && isNonEmptyString(view.fallbackReason)) {
      fields.fallbackReason = view.fallbackReason;
    }
  }

  if (typeof view.retries === 'number' && Number.isInteger(view.retries) && view.retries >= 0) {
    fields.retries = view.retries;
  }

  if (isNonEmptyString(view.routePlanId)) {
    fields.routePlanId = view.routePlanId;
  }

  if (isNonEmptyString(view.resolvedTaskType)) {
    fields.taskFamily = view.resolvedTaskType;
    if (
      typeof view.classifierConfidence === 'number' &&
      Number.isFinite(view.classifierConfidence)
    ) {
      fields.taskFamilyConfidence = view.classifierConfidence;
    }
  }

  return fields;
}

import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { CloudCodeSession, ProviderMessage } from '@agiworkforce/types';
import { SLOT_REGISTRY, normalizeModelId } from '@agiworkforce/types';
import { getE2BExecutor } from '@/lib/e2b/runtime';
import { managedCloudCodeSessionScope } from '@/lib/e2b/session-store';
import { logger } from '@/lib/logger';
import { buildServerProviderAdapter, resolveProviderFromModel } from './provider-adapter-service';
import {
  finalizeManagedUsageRequest,
  fingerprintManagedUsageRequest,
  reserveManagedUsageProviderStep,
  reserveManagedUsageRequest,
  type ManagedUsageRequestReservation,
} from './managed-usage-request-service';
import { createCloudCodeToolRunner } from './cloud-code-agent-runner';
import { LLMCostCalculator } from './llm-cost-calculator';
import {
  runCloudCodeAgentTurn,
  type CloudCodeAgentEvent,
  type CloudCodeAgentResult,
  type CloudCodeTurnUsage,
} from './cloud-code-agent-loop';
import {
  CloudCodeConflictError,
  CloudCodeUnavailableError,
  getCloudCodeSession,
  type CloudCodeOwner,
} from './cloud-code-session-service';

/**
 * Cloud Code agent turn — the metered, persisted orchestration.
 *
 * This is the layer that makes the agent loop safe to expose:
 *
 *  - **Metering.** A reservation is taken BEFORE the first provider call and
 *    settled on every exit path, including failure and cancellation. Each
 *    provider call extends the lease through `onStepCommitted`. Without this
 *    the agent would be exactly the unmetered-paid-inference defect that
 *    `GATEWAY-PROVIDER-STREAM-UNMETERED-01` closed on the gateway.
 *  - **Idempotency.** The caller's `Idempotency-Key` is the reservation key and
 *    the turn's unique key (0082), so a retried request resumes the same turn
 *    instead of starting a second billable one.
 *  - **Session state.** A turn refuses to start unless the session reads
 *    `ready`. That is a precondition check, not a lock: this path does not
 *    claim the session the way `runCloudCodeCommand` does, so it does not by
 *    itself prevent a typed command from starting alongside an agent turn.
 *  - **Durable approvals.** A suspended turn is persisted as
 *    `awaiting_approval` with its pending row, so the gate survives a reload.
 *    The decision and resume side lives in `cloud-code-agent-approval-service`,
 *    which re-enters this file through `executePersistedAgentTurn`.
 */

/**
 * Conservative per-turn RESERVATION. This is what we hold against the user's
 * balance before the turn runs; it is not what the turn is billed.
 */
const ESTIMATED_TURN_COST_CENTS = 25;

/**
 * Floor for a turn that did real provider work. A turn that reached the
 * provider is never free, so a zero here means the provider did not report
 * usage — not that nothing was consumed.
 */
const MINIMUM_BILLED_TURN_CENTS = 1;

/**
 * What a completed turn actually costs.
 *
 * WHY THIS EXISTS. Settlement used to pass `ESTIMATED_TURN_COST_CENTS`
 * straight through, so EVERY Cloud Code turn billed a flat 25c no matter what
 * it consumed — while the constant's own comment claimed it was "refined by
 * real usage at settle time". It was not, and it could not be: the provider's
 * `usage` chunk was being dropped by the `default: break` in
 * `drainAssistantTurn`, so no real usage ever reached this file.
 *
 * The exposure ran both ways and was unbounded on one side. A one-tool-call
 * turn overcharged at 25c; a long multi-step turn on a flagship model against
 * a large repository context also billed 25c, and nothing capped how far that
 * could diverge. Cloud Code turns are agentic — many provider calls per turn
 * is the normal case, not the tail.
 *
 * Real usage now flows through `CloudCodeAgentResult.usage`, summed across
 * every provider call, and is priced with the same `LLMCostCalculator` the
 * rest of the managed surface uses, so the two paths cannot drift.
 *
 * When the provider reported nothing, we fall back to the reservation rather
 * than to zero. Unknown usage must not be free — that is the direction of the
 * error that costs money.
 */
function settledTurnCostCents(provider: string, model: string, usage: CloudCodeTurnUsage): number {
  const reportedTokens =
    usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  if (reportedTokens <= 0) return ESTIMATED_TURN_COST_CENTS;

  // calculateCost already returns whole cents, ceil'd with a one-cent floor,
  // and its rounding is deliberately identical to the gateway's
  // `dollarsToLedgerCents`. Re-rounding here would be the drift this is meant
  // to avoid, so the only thing left to enforce is that a turn which reached
  // the provider is never settled at zero.
  const costCents = LLMCostCalculator.calculateCost(provider, model, {
    promptTokens: usage.inputTokens,
    completionTokens: usage.outputTokens,
    totalTokens: usage.inputTokens + usage.outputTokens,
    cacheReadInputTokens: usage.cacheReadTokens,
    cacheCreationInputTokens: usage.cacheWriteTokens,
  });
  return Math.max(MINIMUM_BILLED_TURN_CENTS, costCents);
}

/**
 * Every model a flagship routing slot points at.
 *
 * Built from the slot registry rather than listing slot names, because the
 * flagship model is reached through more than one slot (`flagship_coding` and
 * `flagship_coding_pro_plus` are the same model) and `getSlotForModel` returns
 * only the FIRST declared slot for a model. A predicate written against the
 * `_pro_plus` slot names alone therefore never fires for the model IDs the
 * client actually sends, which is how a flagship model reaches a provider
 * flagged as standard.
 */
const FLAGSHIP_MODEL_IDS: ReadonlySet<string> = new Set(
  Object.values(SLOT_REGISTRY)
    .filter((definition) => definition.slot.startsWith('flagship_'))
    .map((definition) => definition.modelId),
);

/**
 * Whether the turn's model counts against the rolling flagship weekly cap.
 *
 * WHY THIS IS DERIVED HERE. `is_flagship` used to come from an optional
 * caller-supplied flag that no caller ever set, so every Cloud Code turn
 * reserved as `false` and the flagship weekly ceiling was never consulted — on
 * a surface that makes up to `CLOUD_CODE_AGENT_MAX_STEPS` provider calls per
 * turn. The cap has to key off the model actually sent to the provider, which
 * is this turn's `model`, not off a caller's claim about it.
 */
function isFlagshipModel(model: string): boolean {
  return FLAGSHIP_MODEL_IDS.has(normalizeModelId(model) ?? model);
}

export interface StartCloudCodeAgentTurnInput {
  db: DatabaseAdapter;
  owner: CloudCodeOwner;
  sessionId: string;
  goal: string;
  model: string;
  planTier: string;
  idempotencyKey: string;
  signal: AbortSignal;
}

export interface CloudCodeAgentTurnRecord {
  turnId: string;
  stopReason: CloudCodeAgentResult['stopReason'];
  stepsUsed: number;
  finalMessage: string;
  pendingApproval?: CloudCodeAgentResult['pendingApproval'];
  errorMessage?: string;
}

function turnStateFor(stopReason: CloudCodeAgentResult['stopReason']): string {
  switch (stopReason) {
    case 'done':
      return 'completed';
    case 'awaiting_approval':
      return 'awaiting_approval';
    case 'cancelled':
      return 'cancelled';
    case 'error':
      return 'failed';
    default:
      // max_steps / timeout / denied are completions that stopped early — the
      // turn produced work and must not be reported as a crash.
      return 'completed';
  }
}

/**
 * One execution of a persisted turn — the shared body of "start a new turn" and
 * "resume a suspended one".
 *
 * Resume exists because a turn that stops at the approval boundary has to be
 * continued by a SECOND request, made after the user decides. That request has
 * no goal, no reservation, and no transcript of its own: it carries a turn id,
 * and everything else is read back from the rows this function wrote. So the
 * two entries differ only in what they hand in here.
 */
export interface PersistedAgentTurnExecution {
  db: DatabaseAdapter;
  owner: CloudCodeOwner;
  session: CloudCodeSession;
  sessionId: string;
  /** The `cloud_code_agent_turns` row this execution writes into. */
  turnId: string;
  goal: string;
  model: string;
  provider: string;
  planTier: string;
  /** Reservation key. Resume derives its own so it cannot reuse the start key. */
  idempotencyKey: string;
  signal: AbortSignal;
  /** Resume only: transcript rebuilt from this turn's persisted steps. */
  priorMessages?: ProviderMessage[];
  /** Resume only: the decision recorded for the command that suspended it. */
  preApproved?: { toolUseId: string; command: string; approved: boolean };
  /**
   * Resume only: the highest `step_index` already stored for this turn. New
   * steps continue above it — without this the resumed steps would collide with
   * the originals and be swallowed by `on conflict do nothing`.
   */
  initialStepIndex?: number;
}

export async function executePersistedAgentTurn(
  input: PersistedAgentTurnExecution,
): Promise<CloudCodeAgentTurnRecord> {
  const { db, owner, session, sessionId, turnId, goal, model, provider, planTier, idempotencyKey } =
    input;
  const isFlagship = isFlagshipModel(model);
  const initialStepIndex = input.initialStepIndex ?? 0;

  // Reserve BEFORE any provider work. A failure here must prevent the turn.
  //
  // The turn row already exists at this point (start inserted it; resume claimed
  // it), so a denial here would otherwise strand it in a non-terminal state
  // forever — `running` for a new turn, and for a resume a turn whose approval
  // is already spent and can never be decided again.
  let reservation: ManagedUsageRequestReservation;
  try {
    reservation = await reserveManagedUsageRequest({
      db,
      userId: owner.userId,
      idempotencyKey,
      requestHash: fingerprintManagedUsageRequest({ sessionId, goal, model, turnId }),
      provider,
      model,
      estimatedCostCents: ESTIMATED_TURN_COST_CENTS,
      planTier,
      isFlagship,
    });
  } catch (error) {
    await db.query(
      `update cloud_code_agent_turns set state = 'failed', error_message = $2, updated_at = now()
        where id = $1`,
      [turnId, error instanceof Error ? error.message.slice(0, 2000) : 'Usage reservation failed'],
    );
    throw error;
  }

  const scope = managedCloudCodeSessionScope(
    owner.userId,
    sessionId,
    session.networkAccess,
    planTier,
  );
  const executor = await getE2BExecutor(scope);
  if (!executor) {
    await finalizeManagedUsageRequest({ ...reservation, outcome: 'failed', actualCostCents: 0 });
    await db.query(
      `update cloud_code_agent_turns set state = 'failed', error_message = $2, updated_at = now()
        where id = $1`,
      [turnId, 'Managed Code environment could not be attached'],
    );
    throw new CloudCodeUnavailableError('Managed Code environment could not be attached');
  }

  let result: CloudCodeAgentResult | undefined;
  // Seeded from what is already stored, so a resumed turn's steps land ABOVE the
  // originals instead of colliding with them.
  let stepIndex = initialStepIndex;

  try {
    result = await runCloudCodeAgentTurn({
      adapter: buildServerProviderAdapter(provider),
      model,
      goal,
      runner: createCloudCodeToolRunner(executor, session.workspacePath),
      signal: input.signal,
      repositoryUrl: session.repositoryUrl,
      workspacePath: session.workspacePath,
      ...(input.priorMessages ? { priorMessages: input.priorMessages } : {}),
      ...(input.preApproved ? { preApproved: input.preApproved } : {}),
      onStepCommitted: async (step: number) => {
        // Extend the lease before every provider call, mirroring the metered
        // chat path's per-step reservation. The operation key is 1-based and
        // must match `provider:<n>`, so a retry of the same step reuses its key
        // rather than reserving twice.
        await reserveManagedUsageProviderStep({
          reservation,
          operationKey: `provider:${step + 1}`,
          estimatedCostCents: ESTIMATED_TURN_COST_CENTS,
          planTier,
          isFlagship,
        });
      },
      onEvent: async (event: CloudCodeAgentEvent) => {
        if (event.type !== 'tool-end') return;
        stepIndex += 1;
        await db.query(
          `insert into cloud_code_agent_steps
             (turn_id, step_index, tool_name, tool_args, output, is_error, completed_at)
           values ($1, $2, $3, $4::jsonb, $5, $6, now())
           on conflict (turn_id, step_index) do nothing`,
          [
            turnId,
            stepIndex,
            event.toolName ?? 'unknown',
            JSON.stringify(event.toolArgs ?? {}),
            (event.output ?? '').slice(0, 100_000),
            event.isError ?? false,
          ],
        );
      },
    });
  } catch (error) {
    await finalizeManagedUsageRequest({ ...reservation, outcome: 'failed', actualCostCents: 0 });
    await db.query(
      `update cloud_code_agent_turns set state = 'failed', error_message = $2, updated_at = now()
        where id = $1`,
      [turnId, error instanceof Error ? error.message.slice(0, 2000) : 'Agent turn failed'],
    );
    throw error;
  } finally {
    await executor.pause?.();
    await executor.dispose();
  }

  const state = turnStateFor(result.stopReason);
  const cumulativeSteps = initialStepIndex + result.stepsUsed;

  await db.query(
    `update cloud_code_agent_turns
        set state = $2, steps_used = greatest(steps_used, $3), stop_reason = $4,
            final_message = $5, error_message = $6, updated_at = now()
      where id = $1`,
    [
      turnId,
      state,
      cumulativeSteps,
      result.stopReason === 'awaiting_approval' ? null : result.stopReason,
      result.finalMessage.slice(0, 100_000) || null,
      result.errorMessage?.slice(0, 2000) ?? null,
    ],
  );

  let pendingApproval = result.pendingApproval;
  if (pendingApproval) {
    // The step index is allocated by the DATABASE, not by the loop's per-run
    // counter. A resumed turn restarts that counter at zero, so a second
    // suspension would otherwise reuse the index of the approval that was just
    // decided; `on conflict do nothing` would drop the new row and leave the
    // turn parked in `awaiting_approval` with nothing left to decide.
    const approvalRows = await db.query<{ step_index: number }>(
      `insert into cloud_code_agent_approvals
         (turn_id, step_index, command, reason, expires_at)
       select $1, coalesce(max(step_index), -1) + 1, $2, $3, now() + interval '30 minutes'
         from cloud_code_agent_approvals
        where turn_id = $1
       returning step_index`,
      [turnId, pendingApproval.command, pendingApproval.reason],
    );
    const allocated = approvalRows[0]?.step_index;
    if (allocated === undefined) {
      // No pending row means no way to decide, so the turn is not really
      // suspended — it is stuck. Fail it rather than advertise a gate that
      // cannot be answered.
      await db.query(
        `update cloud_code_agent_turns
            set state = 'failed', stop_reason = 'error', error_message = $2, updated_at = now()
          where id = $1`,
        [turnId, 'Approval request could not be recorded'],
      );
      await finalizeManagedUsageRequest({
        ...reservation,
        outcome: 'failed',
        actualCostCents: 0,
      });
      throw new CloudCodeUnavailableError('Approval request could not be recorded');
    }
    pendingApproval = { ...pendingApproval, stepIndex: allocated };
  }

  // Settle on every non-throwing exit, including early stops. A turn that ran
  // provider calls and was never settled is a leaked reservation.
  await finalizeManagedUsageRequest({
    ...reservation,
    outcome: result.stopReason === 'error' ? 'failed' : 'completed',
    actualCostCents:
      result.stopReason === 'error' ? 0 : settledTurnCostCents(provider, model, result.usage),
    usage: { steps: cumulativeSteps, stopReason: result.stopReason },
  });

  logger.info(
    { turnId, sessionId, stopReason: result.stopReason, steps: cumulativeSteps },
    'Cloud Code agent turn finished',
  );

  return {
    turnId,
    stopReason: result.stopReason,
    stepsUsed: cumulativeSteps,
    finalMessage: result.finalMessage,
    ...(pendingApproval ? { pendingApproval } : {}),
    ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
  };
}

export async function startCloudCodeAgentTurn(
  input: StartCloudCodeAgentTurnInput,
): Promise<CloudCodeAgentTurnRecord> {
  const { db, owner, sessionId, goal, model, planTier, idempotencyKey } = input;

  const session = await getCloudCodeSession(db, owner, sessionId);
  if (session.state === 'closed') {
    throw new CloudCodeConflictError('Closed Code sessions cannot run agent turns');
  }
  if (session.state !== 'ready') {
    throw new CloudCodeConflictError('Code session is busy; wait and try again');
  }

  const provider = resolveProviderFromModel(model);

  const turnRows = await db.query<{ id: string }>(
    `insert into cloud_code_agent_turns
       (session_id, user_id, organization_id, goal, idempotency_key, model, provider, state)
     values ($1, $2, $3, $4, $5, $6, $7, 'running')
     on conflict (user_id, idempotency_key) do update set updated_at = now()
     returning id`,
    [sessionId, owner.userId, owner.organizationId, goal, idempotencyKey, model, provider],
  );
  const turnId = turnRows[0]?.id;
  if (!turnId) throw new CloudCodeUnavailableError('Could not open an agent turn');

  return executePersistedAgentTurn({
    db,
    owner,
    session,
    sessionId,
    turnId,
    goal,
    model,
    provider,
    planTier,
    idempotencyKey,
    signal: input.signal,
  });
}

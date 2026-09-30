import 'server-only';

import type { AgentTaskState } from '@agiworkforce/types/protocol';

import { managedCloudAgentRunPath } from '@agiworkforce/cloud-contracts';

import {
  canPersistAssistantTurn,
  persistAssistantTurn,
} from '@/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence';
import {
  buildPersistedTurnResearch,
  type PersistedTurnResearch,
} from '@/app/api/llm/v1/chat/completions/lib/assistant-turn-research';
import {
  readRunResearchReport,
  recordResearchRunSettledCost,
} from '@/lib/services/research-report-settlement';
import type { ProcessedRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import {
  getCloudAgentExecutionUsage,
  summarizeCloudAgentRunOutcome,
  type CloudAgentOperationOutcome,
} from '@/lib/services/cloud-agent-execution-service';
import {
  finalizeObservedManagedUsage,
  observedTurnCost,
} from '@/lib/services/managed-usage-accounting-service';
import { settleFreeTrialRequest } from '@/lib/services/free-trial-service';
import {
  completeCloudAgentApprovalCheckpoint,
  readCloudAgentRunAssistantText,
  recordCloudAgentRunSettledUsage,
  transitionCloudAgentRun,
} from '@/lib/services/cloud-agent-run-service';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { recordManagedAutoMemoryTurn } from '@/lib/services/managed-auto-memory-service';
import {
  cloudAgentWorkflowBillingKey,
  type CloudAgentWorkflowBilling,
  type CloudAgentWorkflowInput,
} from '../cloud-agent-workflow-input';

export type WorkflowTerminalOutcome =
  'completed' | 'failed' | 'cancelled' | 'awaiting_input' | 'paused';

export function terminalState(outcome: WorkflowTerminalOutcome): AgentTaskState | null {
  switch (outcome) {
    case 'completed':
      return 'ready_for_review';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'awaiting_input':
    case 'paused':
      return null;
  }
}

export const PARTIAL_COMPLETION_HEADING = 'Some steps of this run did not finish:';

/**
 * The per-step reasons the durable receipts already hold. Without this the user
 * is told the run ended and never which parts of it did not.
 */
function partialCompletionNote(failures: readonly CloudAgentOperationOutcome[]): string {
  const reasons = failures
    .map((failure) => failure.reason)
    .filter((reason): reason is string => Boolean(reason));
  if (reasons.length === 0) return '';
  const unique = [...new Set(reasons)];
  return `\n\n${PARTIAL_COMPLETION_HEADING}\n${unique.map((reason) => `- ${reason}`).join('\n')}`;
}

async function persistWorkflowAssistantTurn(
  db: ReturnType<typeof getNeonDb>,
  input: CloudAgentWorkflowInput,
  serving: ProcessedRequest,
  outcome: WorkflowTerminalOutcome,
  usage: { inputTokens: number; outputTokens: number },
  settlement: { state: AgentTaskState | null; note: string },
  research: PersistedTurnResearch | null,
): Promise<void> {
  const processed = input.processed as ProcessedRequest;
  if (!canPersistAssistantTurn(processed)) return;

  const journal = await readCloudAgentRunAssistantText(db, {
    userId: input.userId,
    runId: input.runId,
  });
  await persistAssistantTurn({
    processed,
    userId: input.userId,
    snapshot: {
      content: `${journal.text}${settlement.note}`,
      model: serving.chatRequest.model,
      provider: serving.provider,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      truncated: outcome === 'cancelled',
      interactiveCards: journal.interactiveCards,
      ...(research ? { research } : {}),
      runReference: {
        runId: input.runId,
        runPath: managedCloudAgentRunPath(input.runId),
        lastSequence: journal.lastSequence,
        state: settlement.state ?? (outcome === 'paused' ? 'paused' : 'awaiting_input'),
      },
    },
  });
}

/**
 * A finished turn is only `completed` when every step of it was. The receipts
 * already record which steps failed, so the run ends in the `partial` state
 * 0196 allows rather than claiming work that did not land.
 */
async function resolveSettlement(
  db: ReturnType<typeof getNeonDb>,
  input: CloudAgentWorkflowInput,
  outcome: WorkflowTerminalOutcome,
): Promise<{ state: AgentTaskState | null; note: string }> {
  const state = terminalState(outcome);
  if (state !== 'ready_for_review') return { state, note: '' };

  const summary = await summarizeCloudAgentRunOutcome(db, {
    userId: input.userId,
    runId: input.runId,
  });
  if (summary.status !== 'completed_partial') return { state, note: '' };
  return {
    state: 'partial',
    note: partialCompletionNote([...summary.failures, ...summary.unresolved]),
  };
}

/**
 * Release whichever reservation paid for this invocation.
 *
 * Mirrors `buildManagedAgentStream`'s inline settle so a turn is metered the same
 * way on either transport: managed reservations finalize against observed usage
 * and yield a charged cost; free-trial reservations settle their reserved
 * micro-USD against measured provider cost and record no cents on the run (the
 * free tier is budgeted in micro-USD, not billed in cents).
 */
async function settleBilling(
  db: ReturnType<typeof getNeonDb>,
  billing: CloudAgentWorkflowBilling,
  input: CloudAgentWorkflowInput,
  serving: ProcessedRequest,
  outcome: WorkflowTerminalOutcome,
  usage: Awaited<ReturnType<typeof getCloudAgentExecutionUsage>>,
  errorClass: string | undefined,
): Promise<{ costCents: number | null; costMicrousd: number | null }> {
  const provider = serving.provider;
  const model = serving.chatRequest.model;

  const attempt =
    outcome === 'completed' || outcome === 'failed' || outcome === 'cancelled'
      ? { outcome, errorClass }
      : null;
  if (billing.kind === 'managed') {
    const { kind: _kind, ...reservation } = billing;
    const managedUsageDb = createClaimedUserScopedDb(db, {
      userId: input.userId,
      organizationId: input.processed.organizationId ?? null,
    });
    const finalization = await finalizeObservedManagedUsage({
      reservation: { db: managedUsageDb, ...reservation },
      provider,
      model,
      usage,
      reason: `cloud_agent_workflow_${outcome}`,
      cancelled: outcome === 'cancelled',
      attempt,
    });
    return {
      costCents: finalization.actualCostCents,
      costMicrousd: finalization.actualCostMicrousd ?? null,
    };
  }

  await settleFreeTrialRequest({
    reservation: billing,
    // A turn parked on an approval has finished this invocation's work; the
    // resume reserves again. Settling it as anything but a normal completion
    // would leave free budget reserved against a turn that is no longer running.
    outcome: outcome === 'awaiting_input' || outcome === 'paused' ? 'completed' : outcome,
    attempt,
    provider,
    model,
    cost: observedTurnCost(usage, { provider, model }),
    usage: {
      promptTokens: usage.inputTokens,
      completionTokens: usage.outputTokens,
      totalTokens: usage.inputTokens + usage.outputTokens,
      cacheReadInputTokens: usage.cacheReadTokens,
      cacheCreationInputTokens: usage.cacheWriteTokens,
      cacheCreation1hInputTokens: usage.cacheWrite1hTokens,
    },
  });
  return { costCents: null, costMicrousd: null };
}

async function settledResearch(
  db: ReturnType<typeof getNeonDb>,
  input: CloudAgentWorkflowInput,
  costMicrousd: number | null,
): Promise<PersistedTurnResearch | null> {
  if (!input.research) return null;
  const scopedDb = createClaimedUserScopedDb(db, {
    userId: input.userId,
    organizationId: input.processed.organizationId ?? null,
  });
  const report = await readRunResearchReport(scopedDb, {
    userId: input.userId,
    requestId: input.processed.requestId,
  });
  if (!report) return null;
  const recorded =
    costMicrousd !== null &&
    (await recordResearchRunSettledCost(scopedDb, {
      userId: input.userId,
      requestId: input.processed.requestId,
      settledCostMicrousd: costMicrousd,
    }));
  return buildPersistedTurnResearch(
    report,
    recorded && costMicrousd !== null ? { settledCostMicrousd: costMicrousd } : {},
  );
}

/** Exported for tests; not a Workflow step. `serving` is the route that answered, the opening one until failover rotates. */
export async function settleWorkflowInvocation(
  input: CloudAgentWorkflowInput,
  outcome: WorkflowTerminalOutcome,
  serving?: ProcessedRequest,
  errorClass?: string,
): Promise<void> {
  const db = getNeonDb();
  const servingRequest = serving ?? (input.processed as ProcessedRequest);
  const billingLedgerKey = cloudAgentWorkflowBillingKey(input.billing);
  const usage = await getCloudAgentExecutionUsage(db, {
    userId: input.userId,
    runId: input.runId,
    billingIdempotencyKey: billingLedgerKey,
  });
  const { costCents, costMicrousd } = await settleBilling(
    db,
    input.billing,
    input,
    servingRequest,
    outcome,
    usage,
    errorClass,
  );

  await recordCloudAgentRunSettledUsage(db, {
    userId: input.userId,
    runId: input.runId,
    billingIdempotencyKey: billingLedgerKey,
    usage: {
      providerCalls: usage.providerCalls,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      reasoningTokens: usage.reasoningTokens,
      costCents,
    },
  });

  const settlement = await resolveSettlement(db, input, outcome);

  const research = await settledResearch(db, input, costMicrousd);

  await persistWorkflowAssistantTurn(
    db,
    input,
    servingRequest,
    outcome,
    usage,
    settlement,
    research,
  );

  await recordManagedAutoMemoryTurn({
    db,
    userId: input.userId,
    processed: input.processed as ProcessedRequest,
    outcome: outcome === 'awaiting_input' || outcome === 'paused' ? 'cancelled' : outcome,
  });

  if (input.predecessorApproval) {
    await completeCloudAgentApprovalCheckpoint(db, {
      userId: input.userId,
      checkpointId: input.predecessorApproval.checkpointId,
      leaseToken: input.predecessorApproval.leaseToken,
      outcome: outcome === 'failed' || outcome === 'cancelled' ? 'failed' : 'resolved',
    });
  }

  if (settlement.state) {
    await transitionCloudAgentRun(db, {
      userId: input.userId,
      runId: input.runId,
      state: settlement.state,
    });
  }
}

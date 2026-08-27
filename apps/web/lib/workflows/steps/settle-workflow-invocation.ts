import 'server-only';

import type { AgentTaskState } from '@agiworkforce/types/protocol';

import { managedCloudAgentRunPath } from '@agiworkforce/cloud-contracts';

import {
  canPersistAssistantTurn,
  persistAssistantTurn,
} from '@/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence';
import type { ProcessedRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import { getCloudAgentExecutionUsage } from '@/lib/services/cloud-agent-execution-service';
import {
  calculateObservedProviderUsageCostDollars,
  finalizeObservedManagedUsage,
} from '@/lib/services/managed-usage-accounting-service';
import { settleFreeTrialRequest } from '@/lib/services/free-trial-service';
import {
  completeCloudAgentApprovalCheckpoint,
  readCloudAgentRunAssistantText,
  recordCloudAgentRunSettledUsage,
  transitionCloudAgentRun,
} from '@/lib/services/cloud-agent-run-service';
import { getNeonDb } from '@/lib/server/neon-db';
import { recordManagedAutoMemoryTurn } from '@/lib/services/managed-auto-memory-service';
import {
  cloudAgentWorkflowBillingKey,
  type CloudAgentWorkflowBilling,
  type CloudAgentWorkflowInput,
} from '../cloud-agent-workflow-input';

export type WorkflowTerminalOutcome = 'completed' | 'failed' | 'cancelled' | 'awaiting_input';

export function terminalState(outcome: WorkflowTerminalOutcome): AgentTaskState | null {
  switch (outcome) {
    case 'completed':
      return 'ready_for_review';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'awaiting_input':
      return null;
  }
}

async function persistWorkflowAssistantTurn(
  db: ReturnType<typeof getNeonDb>,
  input: CloudAgentWorkflowInput,
  outcome: WorkflowTerminalOutcome,
  usage: { inputTokens: number; outputTokens: number },
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
      content: journal.text,
      model: input.processed.chatRequest.model,
      provider: input.processed.provider,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      truncated: outcome === 'cancelled',
      interactiveCards: journal.interactiveCards,
      runReference: {
        runId: input.runId,
        runPath: managedCloudAgentRunPath(input.runId),
        lastSequence: journal.lastSequence,
        state: terminalState(outcome) ?? 'awaiting_input',
      },
    },
  });
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
  outcome: WorkflowTerminalOutcome,
  usage: Awaited<ReturnType<typeof getCloudAgentExecutionUsage>>,
): Promise<number | null> {
  const provider = input.processed.provider;
  const model = input.processed.chatRequest.model;

  if (billing.kind === 'managed') {
    const { kind: _kind, ...reservation } = billing;
    const finalization = await finalizeObservedManagedUsage({
      reservation: { db, ...reservation },
      provider,
      model,
      usage,
      reason: `cloud_agent_workflow_${outcome}`,
      cancelled: outcome === 'cancelled',
    });
    return finalization.actualCostCents;
  }

  await settleFreeTrialRequest({
    reservation: billing,
    // A turn parked on an approval has finished this invocation's work; the
    // resume reserves again. Settling it as anything but a normal completion
    // would leave free budget reserved against a turn that is no longer running.
    outcome: outcome === 'awaiting_input' ? 'completed' : outcome,
    provider,
    model,
    measuredCostDollars: calculateObservedProviderUsageCostDollars(usage, { provider, model }),
    usage: {
      promptTokens: usage.inputTokens,
      completionTokens: usage.outputTokens,
      totalTokens: usage.inputTokens + usage.outputTokens,
      cacheReadInputTokens: usage.cacheReadTokens,
      cacheCreationInputTokens: usage.cacheWriteTokens,
      cacheCreation1hInputTokens: usage.cacheWrite1hTokens,
    },
  });
  return null;
}

/** Exported for tests; not a Workflow step and not part of the public surface. */
export async function settleWorkflowInvocation(
  input: CloudAgentWorkflowInput,
  outcome: WorkflowTerminalOutcome,
): Promise<void> {
  const db = getNeonDb();
  const billingLedgerKey = cloudAgentWorkflowBillingKey(input.billing);
  const usage = await getCloudAgentExecutionUsage(db, {
    userId: input.userId,
    runId: input.runId,
    billingIdempotencyKey: billingLedgerKey,
  });
  const costCents = await settleBilling(db, input.billing, input, outcome, usage);

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

  await persistWorkflowAssistantTurn(db, input, outcome, usage);

  await recordManagedAutoMemoryTurn({
    db,
    userId: input.userId,
    processed: input.processed as ProcessedRequest,
    outcome: outcome === 'awaiting_input' ? 'cancelled' : outcome,
  });

  if (input.predecessorApproval) {
    await completeCloudAgentApprovalCheckpoint(db, {
      userId: input.userId,
      checkpointId: input.predecessorApproval.checkpointId,
      leaseToken: input.predecessorApproval.leaseToken,
      outcome: outcome === 'failed' || outcome === 'cancelled' ? 'failed' : 'resolved',
    });
  }

  const state = terminalState(outcome);
  if (state) {
    await transitionCloudAgentRun(db, { userId: input.userId, runId: input.runId, state });
  }
}

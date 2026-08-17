import 'server-only';

import type { AgentTaskState } from '@agiworkforce/types/protocol';

import { managedCloudAgentRunPath } from '@agiworkforce/cloud-contracts';

import {
  canPersistAssistantTurn,
  persistAssistantTurn,
} from '@/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence';
import type { ProcessedRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import { getCloudAgentExecutionUsage } from '@/lib/services/cloud-agent-execution-service';
import { finalizeObservedManagedUsage } from '@/lib/services/managed-usage-accounting-service';
import {
  completeCloudAgentApprovalCheckpoint,
  readCloudAgentRunAssistantText,
  recordCloudAgentRunSettledUsage,
  transitionCloudAgentRun,
} from '@/lib/services/cloud-agent-run-service';
import { getNeonDb } from '@/lib/server/neon-db';
import { recordManagedAutoMemoryTurn } from '@/lib/services/managed-auto-memory-service';
import type { CloudAgentWorkflowInput } from '../cloud-agent-workflow-input';

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

/** Exported for tests; not a Workflow step and not part of the public surface. */
export async function settleWorkflowInvocation(
  input: CloudAgentWorkflowInput,
  outcome: WorkflowTerminalOutcome,
): Promise<void> {
  const db = getNeonDb();
  const usage = await getCloudAgentExecutionUsage(db, {
    userId: input.userId,
    runId: input.runId,
    billingIdempotencyKey: input.billing.idempotencyKey,
  });
  const finalization = await finalizeObservedManagedUsage({
    reservation: { db, ...input.billing },
    provider: input.processed.provider,
    model: input.processed.chatRequest.model,
    usage,
    reason: `cloud_agent_workflow_${outcome}`,
    cancelled: outcome === 'cancelled',
  });

  await recordCloudAgentRunSettledUsage(db, {
    userId: input.userId,
    runId: input.runId,
    billingIdempotencyKey: input.billing.idempotencyKey,
    usage: {
      providerCalls: usage.providerCalls,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      reasoningTokens: usage.reasoningTokens,
      costCents: finalization.actualCostCents,
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

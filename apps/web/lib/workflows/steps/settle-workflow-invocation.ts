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
  transitionCloudAgentRun,
} from '@/lib/services/cloud-agent-run-service';
import { getNeonDb } from '@/lib/server/neon-db';
import { recordManagedAutoMemoryTurn } from '@/lib/services/managed-auto-memory-service';
import type { CloudAgentWorkflowInput } from '../cloud-agent-workflow-input';

/**
 * Step-side settlement for a durable cloud agent invocation.
 *
 * WHY THIS FILE EXISTS SEPARATELY: everything under `lib/workflows/steps/` runs
 * inside a `"use step"` invocation, which is an ordinary serverless Node.js
 * invocation and may reach for Node APIs freely. The module that declares
 * `"use workflow"` may not: the Workflow compiler bundles that module's live
 * module graph for a deterministic VM sandbox and fails the build on any
 * transitive `node:*`/native dependency it can still reach after step bodies
 * have been replaced with dispatch stubs. Settlement is not a step itself — it
 * is called from inside two steps — so a plain function left in the workflow
 * module stayed live in that graph and dragged pino, argon2, jsonwebtoken,
 * `node:crypto` and `node:path` into the sandbox bundle. Nothing here is
 * conditional on the boundary: the same functions run with the same inputs, on
 * the step side of it.
 */

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

/**
 * Save the assistant turn the durable run produced, using the journal as the
 * source of truth for its text.
 *
 * WHY THIS EXISTS: before durable runs, the only writer of an assistant message
 * was the client that watched the stream. That is exactly the assumption
 * detachment breaks — the laptop is closed, the tab is gone, and nobody is
 * holding the bytes. Without this the work is done, billed, and journalled, yet
 * the conversation shows no reply at all when the user comes back.
 *
 * `awaiting_input` persists its partial text WITHOUT the truncated marker: the
 * turn is not cut off, it is mid-flight waiting on a human, and the row is what
 * lets an unattended approval card be reconstructed later.
 *
 * Idempotency comes from the message id: the upsert keys on
 * `assistant_message_id`, so a retried Workflow step and the original client's
 * own save collapse onto one row instead of duplicating the turn.
 */
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
  await finalizeObservedManagedUsage({
    reservation: { db, ...input.billing },
    provider: input.processed.provider,
    model: input.processed.chatRequest.model,
    usage,
    reason: `cloud_agent_workflow_${outcome}`,
    cancelled: outcome === 'cancelled',
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

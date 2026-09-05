import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { start, type WorkflowReadableStream } from 'workflow/api';

import { buildApprovalCheckpointRequest } from '@/app/api/llm/v1/chat/completions/lib/approval-checkpoint-request';
import { ADAPTER_PROVIDERS } from '@/app/api/llm/v1/chat/completions/lib/adapter-providers';
import { buildManagedAgentStream } from '@/app/api/llm/v1/chat/completions/lib/managed-agent-stream';
import { createFailoverPlan } from '@/app/api/llm/v1/chat/completions/lib/managed-failover';
import type { ProcessedRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import { runToolLoop, type ApprovalMode } from '@/app/api/llm/v1/chat/completions/lib/tool-loop';
import { logger } from '@/lib/logger';
import { claimLiveDurableStream, isDurableTransportCoolingDown } from './durable-stream-liveness';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import { createObservedProviderUsage } from '@/lib/services/managed-usage-accounting-service';
import { recordManagedAutoMemoryTurn } from '@/lib/services/managed-auto-memory-service';
import {
  completeCloudAgentApprovalCheckpoint,
  isCloudAgentRunCancellationRequested,
  saveCloudAgentApprovalCheckpoint,
  saveCloudAgentInputCheckpoint,
} from '@/lib/services/cloud-agent-run-service';
import { makeUserConnectorExecutor } from '@/lib/user-connector-tools';
import type { ToolApprovalPolicy } from '@shared/types/toolApprovalPolicy';
import { attachCloudAgentWorkflow } from '@/lib/services/cloud-agent-execution-service';
import { cloudAgentWorkflow } from './cloud-agent-workflow';
import {
  buildCloudAgentWorkflowInput,
  CloudAgentWorkflowBillingUnavailableError,
  type CloudAgentWorkflowInput,
} from './cloud-agent-workflow-input';
import { areDurableInitialTurnsEnabled } from './durable-initial-turns';
import type { ConnectorToolPermissions } from '@/app/api/llm/v1/chat/completions/lib/connector-tool-permissions';

export interface StartCloudAgentWorkflowExecutionInput {
  db: DatabaseAdapter;
  runId: string;
  userId: string;
  processed: ProcessedRequest;
  mcpTools: WebMcpToolDef[];
  approvalMode: ApprovalMode;
  toolApprovalPolicy?: ToolApprovalPolicy;
  connectorPermissions?: ConnectorToolPermissions;
  continuation?: CloudAgentWorkflowInput['continuation'];
  predecessorApproval?: CloudAgentWorkflowInput['predecessorApproval'];
}

/**
 * The durable primitive: hand this turn to the Workflow platform and attach the
 * run to it. Throws when the platform refuses, when the turn carries no
 * reservation to replay, or when the durable attachment cannot be recorded.
 *
 * Prefer {@link runCloudAgentTurn} at an entry point; this export stays because
 * "start durably, no fallback" is still a meaningful thing to ask for.
 */
export async function startCloudAgentWorkflowExecution(
  input: StartCloudAgentWorkflowExecutionInput,
): Promise<{
  workflowRunId: string;
  readable: WorkflowReadableStream<Uint8Array>;
  cancel: () => Promise<void>;
}> {
  const workflowInput = buildCloudAgentWorkflowInput(input);
  const workflowRun = await start(cloudAgentWorkflow, [workflowInput]);
  try {
    await attachCloudAgentWorkflow(input.db, {
      userId: input.userId,
      runId: input.runId,
      workflowRunId: workflowRun.runId,
    });
  } catch (error) {
    await workflowRun.cancel();
    throw error;
  }

  return {
    workflowRunId: workflowRun.runId,
    readable: workflowRun.getReadable<Uint8Array>(),
    cancel: async () => {
      await workflowRun.cancel();
    },
  };
}

export type CloudAgentTransportKind = 'durable' | 'inline';

/**
 * Why a turn that asked for the durable transport did not get it. Carried on the
 * result so a degraded turn is reportable rather than silently indistinguishable
 * from a durable one.
 */
export type CloudAgentTransportDegradeReason =
  | 'kill_switch'
  | 'no_reservation'
  | 'workflow_start_failed'
  | 'workflow_stream_stalled'
  | 'transport_cooling_down';

export interface RunCloudAgentTurnInput extends StartCloudAgentWorkflowExecutionInput {
  /**
   * What to do when the durable transport is unavailable.
   *
   * `'inline'`, run the turn request-scoped instead: same SSE wire, same run
   * journal, same checkpoints, same settlement. The turn is merely no longer
   * detachable.
   * `'fail'`, rethrow and let the caller answer for it.
   *
   * This degrades the TRANSPORT ONLY. Every authorization gate an entry point
   * runs, auth, managed compute, organization policy, spend limit, checkpoint
   * ownership, connector permissions, runs before a transport is chosen and is
   * unaffected by which one is picked.
   */
  onDurableUnavailable: 'inline' | 'fail';
  /**
   * The entry request's abort signal. Required, because the inline transport
   * must be able to abort the in-flight provider call when the client goes away
   * rather than bill a whole agentic turn nobody sees.
   */
  signal: AbortSignal;
  /** Settlement reason recorded when an inline turn ends normally. */
  completionReason: string;
  /** Settlement reason recorded when an inline turn is cancelled. */
  cancellationReason: string;
  /** Bind a connector executor for the inline loop only when connectors are in play. */
  hasConnectorTools?: boolean;
}

export interface CloudAgentTurnTransport {
  transport: CloudAgentTransportKind;
  /** Null on the inline transport: there is no durable run to reattach to. */
  workflowRunId: string | null;
  readable: ReadableStream<Uint8Array>;
  degradedReason?: CloudAgentTransportDegradeReason;
}

/**
 * Run one agent turn on the best transport available.
 *
 * This is the single execution entry every agent turn passes through, an
 * initial turn, an approval resume, an input resume. Durability used to be
 * decided ad hoc at each entry point, which produced the two defects this
 * function exists to remove:
 *
 *  - AGI-126: the initial turn went durable only when it held a MANAGED usage
 *    reservation, so a free-trial turn got a `cloud_agent_runs` row that LOOKED
 *    durable, listed by the runs API, claimable by the approval APIs, and then
 *    died with the client connection, and a pause it recorded could never be
 *    resumed. Both reservations now cross the invocation boundary (see
 *    `CloudAgentWorkflowBilling`), so the tier no longer decides the transport.
 *    Durable is not unmetered: the workflow rehydrates a free-trial reservation
 *    onto `processed.freeTrial`, so the tool loop applies the same per-step free
 *    output-budget cap it applies inline, and settlement releases that same free
 *    reservation row.
 *
 *  - AGI-39: the resume entry points always started the durable workflow with no
 *    fallback, so a Workflow-platform outage, or the AGI_DURABLE_INITIAL_TURNS
 *    kill-switch being engaged, turned every pending approval and input resume
 *    into a 503, even though `runToolLoop` has always been able to run that same
 *    resume request-scoped. `onDurableUnavailable: 'inline'` reaches that path.
 */
export async function runCloudAgentTurn(
  input: RunCloudAgentTurnInput,
): Promise<CloudAgentTurnTransport> {
  const degrade = async (
    reason: CloudAgentTransportDegradeReason,
    error?: unknown,
  ): Promise<CloudAgentTurnTransport> => {
    if (input.onDurableUnavailable === 'fail') {
      throw error instanceof Error ? error : new Error(`Durable transport unavailable: ${reason}`);
    }
    logger.warn(
      {
        ...(error ? { error } : {}),
        reason,
        userId: input.userId,
        runId: input.runId,
        requestId: input.processed.requestId,
        resume: Boolean(input.continuation?.resume),
      },
      'Durable agent transport unavailable; running this turn request-scoped',
    );
    return {
      transport: 'inline',
      workflowRunId: null,
      readable: buildInlineCloudAgentTurn(input),
      degradedReason: reason,
    };
  };

  if (!areDurableInitialTurnsEnabled()) return degrade('kill_switch');
  if (isDurableTransportCoolingDown()) return degrade('transport_cooling_down');

  try {
    const workflow = await startCloudAgentWorkflowExecution(input);
    const live = await claimLiveDurableStream(workflow.readable);
    if (!live) {
      // Correctness: the inline turn must not start until this cancel is issued,
      // or the same turn runs twice and settles twice.
      await workflow.cancel().catch(() => undefined);
      return degrade('workflow_stream_stalled');
    }
    return {
      transport: 'durable',
      workflowRunId: workflow.workflowRunId,
      readable: live,
    };
  } catch (error) {
    return degrade(
      error instanceof CloudAgentWorkflowBillingUnavailableError
        ? 'no_reservation'
        : 'workflow_start_failed',
      error,
    );
  }
}

/**
 * The request-scoped twin of the durable workflow: the same tool loop, the same
 * SSE projection, the same run journal, the same settlement.
 *
 * Every non-terminal exit still records its boundary. An approval pause writes an
 * approval checkpoint; an MCP `input_required` pause writes an input checkpoint;
 * and a resume that carried a predecessor lease resolves that lease on the way
 * out. A turn never ends with work done and nothing recorded.
 */
function buildInlineCloudAgentTurn(input: RunCloudAgentTurnInput): ReadableStream<Uint8Array> {
  const { processed } = input;
  const usage = createObservedProviderUsage();
  let pauseCheckpointSaved = false;
  // The tool loop can rotate to a managed-failover candidate mid-run; keep the
  // serving view so attribution and settlement follow what actually answered.
  let serving: ProcessedRequest = processed;
  const failover = createFailoverPlan(processed, {
    signal: input.signal,
    isProviderDispatchable: (candidate) => Boolean(ADAPTER_PROVIDERS[candidate]),
    modelPolicy: processed.modelPolicy ?? null,
  });

  const generator = runToolLoop(processed, {
    mcpTools: input.mcpTools,
    approvalMode: input.approvalMode,
    ...(input.toolApprovalPolicy ? { toolApprovalPolicy: input.toolApprovalPolicy } : {}),
    ...(input.connectorPermissions ? { connectorPermissions: input.connectorPermissions } : {}),
    userId: input.userId,
    ...(input.hasConnectorTools
      ? { connectorExecutor: makeUserConnectorExecutor(input.userId, processed.organizationId) }
      : {}),
    usage,
    signal: input.signal,
    // The durable transport replays a resume through these same options. The
    // inline one is not a lesser resume, it is the same resume, minus the
    // detachment.
    ...(input.continuation
      ? {
          ...(input.continuation.resume ? { resume: input.continuation.resume } : {}),
          eventSessionId: input.continuation.eventSessionId,
          eventTurnId: input.continuation.eventTurnId,
          initialEventSequence: input.continuation.initialEventSequence,
          initialCompletedSteps: input.continuation.initialCompletedSteps,
          invocationContinuation: input.continuation.invocationContinuation,
        }
      : {}),
    failover: {
      next: (error, context) => {
        const attempt = failover.next(error, context);
        if (attempt) serving = attempt.processed;
        return attempt;
      },
    },
    isCancellationRequested: () =>
      isCloudAgentRunCancellationRequested(input.db, {
        userId: input.userId,
        runId: input.runId,
      }),
    onApprovalCheckpoint: async (checkpoint) => {
      await saveCloudAgentApprovalCheckpoint(input.db, {
        userId: input.userId,
        runId: input.runId,
        sessionId: checkpoint.sessionId,
        turnId: checkpoint.turnId,
        nextEventSequence: checkpoint.nextEventSequence,
        completedSteps: checkpoint.completedSteps,
        request: buildApprovalCheckpointRequest(processed.chatRequest),
        messages: checkpoint.messages,
        pendingToolCalls: checkpoint.pendingToolCalls,
        events: checkpoint.events,
      });
      pauseCheckpointSaved = true;
    },
    onInputCheckpoint: async (checkpoint) => {
      await saveCloudAgentInputCheckpoint(input.db, {
        userId: input.userId,
        runId: input.runId,
        sessionId: checkpoint.sessionId,
        turnId: checkpoint.turnId,
        nextEventSequence: checkpoint.nextEventSequence,
        completedSteps: checkpoint.completedSteps,
        request: buildApprovalCheckpointRequest(processed.chatRequest),
        messages: checkpoint.messages,
        pendingToolCalls: checkpoint.pendingToolCalls,
        inputRequests: checkpoint.inputRequests,
        requestState: checkpoint.requestState,
        events: checkpoint.events,
      });
      pauseCheckpointSaved = true;
    },
  });

  return buildManagedAgentStream({
    generator,
    processed,
    usage,
    userId: input.userId,
    getServingRequest: () => serving,
    completionReason: input.completionReason,
    cancellationReason: input.cancellationReason,
    runJournal: { db: input.db, userId: input.userId, runId: input.runId },
    onTerminal: async (outcome) => {
      // The durable transport resolves the predecessor lease inside
      // settleWorkflowInvocation. Inline owes the same write: without it the
      // resumed checkpoint stays leased and its run can never be resumed again.
      if (input.predecessorApproval) {
        await completeCloudAgentApprovalCheckpoint(input.db, {
          userId: input.userId,
          checkpointId: input.predecessorApproval.checkpointId,
          leaseToken: input.predecessorApproval.leaseToken,
          outcome: outcome === 'failed' || outcome === 'cancelled' ? 'failed' : 'resolved',
        }).catch((error) => {
          logger.error(
            { error, userId: input.userId, runId: input.runId },
            'Inline agent turn could not resolve the predecessor approval lease',
          );
        });
      }
      await recordManagedAutoMemoryTurn({
        db: input.db,
        userId: input.userId,
        processed,
        outcome,
      });
    },
    preserveAwaitingInputOnCancel: () => pauseCheckpointSaved,
  });
}

import 'server-only';

import { parseInteractiveCardDelta } from '@agiworkforce/cloud-contracts';
import type { InteractiveCard } from '@agiworkforce/types';
import type { AgentTaskState } from '@agiworkforce/types/protocol';
import { z } from 'zod';
import { FatalError, RetryableError, getWritable } from 'workflow';

import { buildApprovalCheckpointRequest } from '@/app/api/llm/v1/chat/completions/lib/approval-checkpoint-request';
import { createAgentEventStreamEmitter } from '@/app/api/llm/v1/chat/completions/lib/agent-event-stream';
import type { ProcessedRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import {
  runToolLoop,
  type ToolLoopProviderStepResult,
  type ToolLoopToolResult,
} from '@/app/api/llm/v1/chat/completions/lib/tool-loop';
import { makeUserConnectorExecutor } from '@/lib/user-connector-tools';
import {
  appendCloudAgentEvent,
  getCloudAgentRun,
  isCloudAgentRunCancellationRequested,
  saveCloudAgentApprovalCheckpoint,
} from '@/lib/services/cloud-agent-run-service';
import { getNeonDb } from '@/lib/server/neon-db';
import { executeCloudAgentOperation } from './cloud-agent-operation-executor';
import {
  parseCloudAgentWorkflowInput,
  type CloudAgentWorkflowInput,
} from './cloud-agent-workflow-input';
import { projectCloudAgentWorkflowChunk } from './cloud-agent-workflow-stream';
import {
  settleWorkflowInvocation,
  type WorkflowTerminalOutcome,
} from './steps/settle-workflow-invocation';

const ProviderCallObservationSchema = z
  .object({
    inputTokens: z.number().nonnegative(),
    outputTokens: z.number().nonnegative(),
    cacheReadTokens: z.number().nonnegative(),
    cacheWriteTokens: z.number().nonnegative(),
    cacheWrite1hTokens: z.number().nonnegative(),
    reasoningTokens: z.number().nonnegative(),
    provider: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    costDollars: z.number().finite().nonnegative().optional(),
  })
  .strict();

const UsageSchema = z
  .object({
    providerCalls: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cacheReadTokens: z.number().int().nonnegative(),
    cacheWriteTokens: z.number().int().nonnegative(),
    cacheWrite1hTokens: z.number().int().nonnegative(),
    reasoningTokens: z.number().int().nonnegative(),
    providerCostDollars: z.number().finite().nonnegative().optional(),
    providerCallObservations: z.array(ProviderCallObservationSchema).optional(),
  })
  .strict();

const PendingToolCallSchema = z
  .object({
    id: z.string().min(1),
    qualifiedName: z.string().min(1),
    args: z.record(z.string(), z.unknown()),
  })
  .strict();

const SourceSchema = z
  .object({
    url: z.string(),
    title: z.string(),
    snippet: z.string().optional(),
  })
  .strict();

const GeneratedFileRefSchema = z
  .object({
    provider: z.enum(['openai', 'anthropic', 'google']),
    filename: z.string().optional(),
    containerId: z.string().optional(),
    fileId: z.string().optional(),
  })
  .strict();

const ProviderStepResultSchema = z
  .object({
    lines: z.array(z.object({ line: z.string(), publicTextDelta: z.string().optional() }).strict()),
    finishReason: z.string().nullable(),
    pendingToolCalls: z.array(PendingToolCallSchema),
    textContent: z.string(),
    publicTextTail: z.string(),
    generatedFileRefs: z.array(GeneratedFileRefSchema),
    thinkingBlocks: z.array(
      z
        .object({
          type: z.literal('thinking'),
          thinking: z.string(),
          signature: z.string().optional(),
        })
        .strict(),
    ),
    canonicalText: z.string(),
    usage: UsageSchema,
  })
  .strict();

const ToolResultSchema = z
  .object({
    content: z.string(),
    isError: z.boolean(),
    interactiveCard: z
      .custom<InteractiveCard>((value) => parseInteractiveCardDelta({ card: value }) !== null)
      .optional(),
    source: SourceSchema.optional(),
    sources: z.array(SourceSchema).optional(),
    pngResults: z.array(z.string()).optional(),
  })
  .strict();

type WorkflowInvocationResult =
  | { kind: 'continue'; input: CloudAgentWorkflowInput }
  | { kind: 'terminal'; outcome: WorkflowTerminalOutcome };

function workflowContinuation(
  input: CloudAgentWorkflowInput,
  checkpoint: {
    sessionId: string;
    turnId: string;
    nextEventSequence: number;
    completedSteps: number;
    messages: ProcessedRequest['llmRequest']['messages'];
  },
): CloudAgentWorkflowInput {
  return parseCloudAgentWorkflowInput(
    JSON.parse(
      JSON.stringify({
        ...input,
        processed: {
          ...input.processed,
          llmRequest: { ...input.processed.llmRequest, messages: checkpoint.messages },
        },
        continuation: {
          eventSessionId: checkpoint.sessionId,
          eventTurnId: checkpoint.turnId,
          initialEventSequence: checkpoint.nextEventSequence,
          initialCompletedSteps: checkpoint.completedSteps,
          invocationContinuation: true,
        },
      }),
    ),
  );
}

export async function executeCloudAgentWorkflowInvocation(
  rawInput: CloudAgentWorkflowInput,
): Promise<WorkflowInvocationResult> {
  'use step';

  const input = parseCloudAgentWorkflowInput(rawInput);
  const db = getNeonDb();
  const processed = {
    ...input.processed,
    managedUsage: { db, ...input.billing },
  } as ProcessedRequest;
  const connectorExecutor = input.mcpTools.some((tool) => tool.origin === 'connector')
    ? makeUserConnectorExecutor(input.userId, input.processed.organizationId ?? null)
    : undefined;
  let nextInput: CloudAgentWorkflowInput | null = null;
  let approvalCheckpointSaved = false;
  let reportedFailure = false;
  let lastTaskState: AgentTaskState | undefined;

  const generator = runToolLoop(processed, {
    mcpTools: input.mcpTools,
    approvalMode: input.approvalMode,
    userId: input.userId,
    connectorExecutor,
    resume: input.continuation?.resume,
    eventSessionId: input.continuation?.eventSessionId,
    eventTurnId: input.continuation?.eventTurnId,
    initialEventSequence: input.continuation?.initialEventSequence,
    initialCompletedSteps: input.continuation?.initialCompletedSteps,
    invocationContinuation: input.continuation?.invocationContinuation,
    maxDurationMs: 210_000,
    isCancellationRequested: () =>
      isCloudAgentRunCancellationRequested(db, { userId: input.userId, runId: input.runId }),
    shouldPropagateExecutionError: (error) =>
      error instanceof FatalError || error instanceof RetryableError,
    providerExecutor: ({ operationKey, step, request, execute }) =>
      executeCloudAgentOperation<ToolLoopProviderStepResult>(db, {
        userId: input.userId,
        runId: input.runId,
        billingIdempotencyKey: input.billing.idempotencyKey,
        operationKey,
        operationKind: 'provider',
        retrySafety: 'unsafe',
        payload: { step, request },
        resultSchema: ProviderStepResultSchema,
        execute,
        usage: (result) => ({ ...result.usage }),
      }),
    toolExecutor: ({ operationKey, retrySafety, toolCall, execute }) =>
      executeCloudAgentOperation<ToolLoopToolResult>(db, {
        userId: input.userId,
        runId: input.runId,
        billingIdempotencyKey: input.billing.idempotencyKey,
        operationKey,
        operationKind: 'tool',
        retrySafety,
        payload: toolCall,
        resultSchema: ToolResultSchema,
        execute,
      }),
    onInvocationCheckpoint: async (checkpoint) => {
      nextInput = workflowContinuation(input, checkpoint);
    },
    onApprovalCheckpoint: async (checkpoint) => {
      await saveCloudAgentApprovalCheckpoint(db, {
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
      approvalCheckpointSaved = true;
    },
  });

  const writer = getWritable<Uint8Array>().getWriter();
  try {
    for await (const chunk of generator) {
      for (const projected of projectCloudAgentWorkflowChunk(chunk)) {
        await writer.write(new TextEncoder().encode(projected.sse));
        if (projected.envelope) {
          await appendCloudAgentEvent(db, {
            userId: input.userId,
            runId: input.runId,
            envelope: projected.envelope,
          });
          if (projected.envelope.event.type === 'error') reportedFailure = true;
          if (projected.envelope.event.type === 'task-state-changed') {
            lastTaskState = projected.envelope.event.state;
          }
        }
      }
    }
  } finally {
    writer.releaseLock();
  }

  if (nextInput) return { kind: 'continue', input: nextInput };

  const outcome: WorkflowTerminalOutcome = approvalCheckpointSaved
    ? 'awaiting_input'
    : lastTaskState === 'cancelled'
      ? 'cancelled'
      : reportedFailure || lastTaskState === 'failed'
        ? 'failed'
        : 'completed';
  await settleWorkflowInvocation(input, outcome);
  return { kind: 'terminal', outcome };
}

export async function failCloudAgentWorkflow(
  rawInput: CloudAgentWorkflowInput,
  message: string,
): Promise<void> {
  'use step';

  const input = parseCloudAgentWorkflowInput(rawInput);
  const db = getNeonDb();
  const snapshot = await getCloudAgentRun(db, {
    userId: input.userId,
    runId: input.runId,
    afterSequence: Number.MAX_SAFE_INTEGER,
    limit: 1,
  });
  const continuation = input.continuation;
  const turnId = continuation?.eventTurnId ?? input.processed.requestId;
  const emitter = createAgentEventStreamEmitter({
    sessionId: continuation?.eventSessionId ?? input.processed.conversationId ?? turnId,
    turnId,
    responseModel: input.processed.requestedModel,
    initialSequence: (snapshot?.run.lastEventSequence ?? -1) + 1,
  });
  const events = [
    emitter.emitWithEnvelope({
      type: 'error',
      message: message || 'The durable agent workflow failed.',
      code: 'cloud_agent_workflow_failed',
      retryable: false,
    }),
    emitter.emitWithEnvelope({
      type: 'task-state-changed',
      taskId: turnId,
      state: 'failed',
      summary: 'Agent work ended with an error.',
    }),
    emitter.emitWithEnvelope({ type: 'stop', reason: 'error' }),
  ];

  const writer = getWritable<Uint8Array>().getWriter();
  try {
    for (const emitted of events) {
      await writer.write(new TextEncoder().encode(emitted.sse));
      await appendCloudAgentEvent(db, {
        userId: input.userId,
        runId: input.runId,
        envelope: emitted.envelope,
      });
    }
  } finally {
    writer.releaseLock();
  }
  await settleWorkflowInvocation(input, 'failed');
}

export async function closeCloudAgentWorkflowStream(): Promise<void> {
  'use step';
  const writer = getWritable<Uint8Array>().getWriter();
  await writer.write(new TextEncoder().encode('data: [DONE]\n\n'));
  await writer.close();
}

export async function cloudAgentWorkflow(rawInput: CloudAgentWorkflowInput): Promise<void> {
  'use workflow';

  let input = rawInput;
  try {
    for (;;) {
      const result = await executeCloudAgentWorkflowInvocation(input);
      if (result.kind === 'continue') {
        input = result.input;
        continue;
      }
      await closeCloudAgentWorkflowStream();
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failCloudAgentWorkflow(input, message);
    await closeCloudAgentWorkflowStream();
    throw error;
  }
}

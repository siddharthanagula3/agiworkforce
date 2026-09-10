import 'server-only';

import { GENERATED_FILE_SURFACES, parseInteractiveCardDelta } from '@agiworkforce/cloud-contracts';
import type { InteractiveCard, ThinkingBlock } from '@agiworkforce/types';
import type { AgentTaskState } from '@agiworkforce/types/protocol';
import { z } from 'zod';
import { FatalError, RetryableError, getWritable } from 'workflow';

import { ADAPTER_PROVIDERS } from '@/app/api/llm/v1/chat/completions/lib/adapter-providers';
import { buildApprovalCheckpointRequest } from '@/app/api/llm/v1/chat/completions/lib/approval-checkpoint-request';
import { connectorToolPermissionsFromEntries } from '@/app/api/llm/v1/chat/completions/lib/connector-tool-permissions';
import { createFailoverPlan } from '@/app/api/llm/v1/chat/completions/lib/managed-failover';
import type { ProcessedRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import {
  runToolLoop,
  type CollectedProviderLine,
  type FetchedSource,
  type PendingToolCall,
  type ServerToolResultSignal,
  type ServerToolStartSignal,
  type ToolLoopProviderStepResult,
  type ToolLoopToolResult,
} from '@/app/api/llm/v1/chat/completions/lib/tool-loop';
import { makeUserConnectorExecutor } from '@/lib/user-connector-tools';
import {
  isCloudAgentRunCancellationRequested,
  saveCloudAgentApprovalCheckpoint,
  saveCloudAgentInputCheckpoint,
} from '@/lib/services/cloud-agent-run-service';
import { createCloudAgentEventJournal } from '@/lib/services/cloud-agent-event-journal';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import type { GeneratedFileRef } from '@/lib/server/container-files';
import type { GeneratedFileWire } from '@/lib/server/generated-file-persist';
import type {
  ObservedProviderUsage,
  ProviderUsageObservation,
} from '@/lib/services/managed-usage-accounting-service';
import type { SameKeys } from '@/lib/schema-key-guard';
import { executeCloudAgentOperation } from '../cloud-agent-operation-executor';
import {
  connectorToolNames,
  createCloudAgentToolPermissionGate,
} from '../cloud-agent-tool-permission-gate';
import {
  cloudAgentWorkflowBillingKey,
  parseCloudAgentWorkflowInput,
  rehydrateCloudAgentWorkflowRequest,
  type CloudAgentWorkflowInput,
} from '../cloud-agent-workflow-input';
import { projectCloudAgentWorkflowChunk } from '../cloud-agent-workflow-stream';
import { createBoundedDurableWriter } from '../durable-stream-write';
import { DURABLE_STREAM_OPEN_FRAME } from '../durable-stream-liveness';
import { reportUnreadableStream, writeDurableFrames } from './durable-stream-frames';
import {
  settleWorkflowInvocation,
  type WorkflowTerminalOutcome,
} from './settle-workflow-invocation';

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
    costSource: z.enum(['provider_reported', 'estimated']).optional(),
    routeId: z.string().min(1).nullable().optional(),
    upstreamProvider: z.string().min(1).optional(),
    providerReportedCostUsd: z.number().finite().nonnegative().optional(),
  })
  .strict();
const providerCallObservationSchemaCoversObservation: SameKeys<
  z.infer<typeof ProviderCallObservationSchema>,
  ProviderUsageObservation
> = true;
void providerCallObservationSchemaCoversObservation;

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
const usageSchemaCoversObservedProviderUsage: SameKeys<
  z.infer<typeof UsageSchema>,
  ObservedProviderUsage
> = true;
void usageSchemaCoversObservedProviderUsage;

const PendingToolCallSchema = z
  .object({
    id: z.string().min(1),
    qualifiedName: z.string().min(1),
    args: z.record(z.string(), z.unknown()),
    argsMalformed: z.literal(true).optional(),
  })
  .strict();
const pendingToolCallSchemaCoversPendingToolCall: SameKeys<
  z.infer<typeof PendingToolCallSchema>,
  PendingToolCall
> = true;
void pendingToolCallSchemaCoversPendingToolCall;

const SourceSchema = z
  .object({
    url: z.string(),
    title: z.string(),
    snippet: z.string().optional(),
  })
  .strict();
const sourceSchemaCoversFetchedSource: SameKeys<z.infer<typeof SourceSchema>, FetchedSource> = true;
void sourceSchemaCoversFetchedSource;

const GeneratedFileRefSchema = z
  .object({
    provider: z.enum(['openai', 'anthropic', 'google']),
    filename: z.string().optional(),
    containerId: z.string().optional(),
    fileId: z.string().optional(),
  })
  .strict();
const generatedFileRefSchemaCoversGeneratedFileRef: SameKeys<
  z.infer<typeof GeneratedFileRefSchema>,
  GeneratedFileRef
> = true;
void generatedFileRefSchemaCoversGeneratedFileRef;

const GeneratedFileWireSchema = z
  .object({
    id: z.string().min(1),
    file_name: z.string().min(1),
    mime_type: z.string(),
    uri: z.string().min(1),
    byte_count: z.number().nonnegative(),
    kind: z.string(),
    checksum_sha256: z.string(),
    surface: z.enum(GENERATED_FILE_SURFACES),
    previewable: z.boolean(),
  })
  .strict();
const generatedFileWireSchemaCoversGeneratedFileWire: SameKeys<
  z.infer<typeof GeneratedFileWireSchema>,
  GeneratedFileWire
> = true;
void generatedFileWireSchemaCoversGeneratedFileWire;

const ServerToolStartSignalSchema = z.object({ toolCallId: z.string(), name: z.string() }).strict();
const serverToolStartSignalSchemaCoversSignal: SameKeys<
  z.infer<typeof ServerToolStartSignalSchema>,
  ServerToolStartSignal
> = true;
void serverToolStartSignalSchemaCoversSignal;

const ServerToolResultSignalSchema = z
  .object({
    toolCallId: z.string(),
    name: z.string(),
    sources: z.array(SourceSchema),
    elapsedMs: z.number(),
  })
  .strict();
const serverToolResultSignalSchemaCoversSignal: SameKeys<
  z.infer<typeof ServerToolResultSignalSchema>,
  ServerToolResultSignal
> = true;
void serverToolResultSignalSchemaCoversSignal;

const CollectedProviderLineSchema = z
  .object({
    line: z.string(),
    publicTextDelta: z.string().optional(),
    reasoningDelta: z.string().optional(),
    serverToolStart: ServerToolStartSignalSchema.optional(),
    serverToolResults: z.array(ServerToolResultSignalSchema).optional(),
    searchActivity: z.boolean().optional(),
  })
  .strict();
const collectedProviderLineSchemaCoversLine: SameKeys<
  z.infer<typeof CollectedProviderLineSchema>,
  CollectedProviderLine
> = true;
void collectedProviderLineSchemaCoversLine;

const ThinkingBlockSchema = z
  .object({
    type: z.literal('thinking'),
    thinking: z.string(),
    signature: z.string().optional(),
  })
  .strict();
const thinkingBlockSchemaCoversThinkingBlock: SameKeys<
  z.infer<typeof ThinkingBlockSchema>,
  ThinkingBlock
> = true;
void thinkingBlockSchemaCoversThinkingBlock;

const ProviderStepResultSchema = z
  .object({
    lines: z.array(CollectedProviderLineSchema).optional(),
    finishReason: z.string().nullable(),
    pendingToolCalls: z.array(PendingToolCallSchema),
    textContent: z.string(),
    publicTextTail: z.string(),
    generatedFileRefs: z.array(GeneratedFileRefSchema),
    thinkingBlocks: z.array(ThinkingBlockSchema),
    canonicalText: z.string(),
    usage: UsageSchema,
  })
  .strict();
const providerStepResultSchemaCoversStepResult: SameKeys<
  z.infer<typeof ProviderStepResultSchema>,
  ToolLoopProviderStepResult
> = true;
void providerStepResultSchemaCoversStepResult;

export function parseCloudAgentProviderStepResult(
  value: unknown,
): z.infer<typeof ProviderStepResultSchema> {
  return ProviderStepResultSchema.parse(value);
}

const ToolResultSchema = z
  .object({
    content: z.string(),
    isError: z.boolean(),
    unavailable: z.boolean().optional(),
    unavailableFamily: z.literal('execution').optional(),
    interactiveCard: z
      .custom<InteractiveCard>((value) => parseInteractiveCardDelta({ card: value }) !== null)
      .optional(),
    source: SourceSchema.optional(),
    sources: z.array(SourceSchema).optional(),
    pngResults: z.array(z.string()).optional(),
    generatedFiles: z.array(GeneratedFileWireSchema).optional(),
    inputRequired: z
      .object({
        inputRequests: z.record(z.string(), z.unknown()),
        requestState: z.string().optional(),
      })
      .optional(),
  })
  .strict();
const toolResultSchemaCoversToolLoopToolResult: SameKeys<
  z.infer<typeof ToolResultSchema>,
  ToolLoopToolResult
> = true;
void toolResultSchemaCoversToolLoopToolResult;

export function parseCloudAgentToolResult(value: unknown): z.infer<typeof ToolResultSchema> {
  return ToolResultSchema.parse(value);
}

type WorkflowInvocationResult =
  | { kind: 'continue'; input: CloudAgentWorkflowInput }
  | { kind: 'terminal'; outcome: WorkflowTerminalOutcome };

// A turn settles in its last invocation, so the rotated route travels with the continuation; reservations come off first.
function continuationRequest(serving: ProcessedRequest): CloudAgentWorkflowInput['processed'] {
  const { managedUsage: _managedUsage, freeTrial: _freeTrial, ...rest } = serving;
  return rest as CloudAgentWorkflowInput['processed'];
}

function workflowContinuation(
  input: CloudAgentWorkflowInput,
  serving: ProcessedRequest,
  checkpoint: {
    sessionId: string;
    turnId: string;
    nextEventSequence: number;
    completedSteps: number;
    messages: ProcessedRequest['llmRequest']['messages'];
  },
): CloudAgentWorkflowInput {
  const processed = continuationRequest(serving);
  return parseCloudAgentWorkflowInput(
    JSON.parse(
      JSON.stringify({
        ...input,
        processed: {
          ...processed,
          llmRequest: { ...processed.llmRequest, messages: checkpoint.messages },
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

  await writeDurableFrames(rawInput.runId, 'open', [DURABLE_STREAM_OPEN_FRAME]);

  const input = parseCloudAgentWorkflowInput(rawInput);
  const db = getNeonDb();
  const managedUsageDb = createClaimedUserScopedDb(db, {
    userId: input.userId,
    organizationId: input.processed.organizationId ?? null,
  });
  // Rehydrate onto the side the discriminant names. A free-trial turn must come
  // back as `processed.freeTrial` so the tool loop applies the free output cap
  // rather than the managed per-step reservation -- durable is a transport
  // choice, not a licence to skip the tier's budget.
  const processed = rehydrateCloudAgentWorkflowRequest(input, managedUsageDb);
  const billingLedgerKey = cloudAgentWorkflowBillingKey(input.billing);
  const connectorExecutor = input.mcpTools.some((tool) => tool.origin === 'connector')
    ? makeUserConnectorExecutor(input.userId, input.processed.organizationId ?? null)
    : undefined;
  const toolPermissionGate = createCloudAgentToolPermissionGate(db, {
    userId: input.userId,
    connectorToolNames: connectorToolNames(input.mcpTools),
  });
  let nextInput: CloudAgentWorkflowInput | null = null;
  let approvalCheckpointSaved = false;
  let inputCheckpointSaved = false;
  let reportedFailure = false;
  let lastTaskState: AgentTaskState | undefined;
  const cancellation = new AbortController();
  let serving: ProcessedRequest = processed;
  const failover = createFailoverPlan(processed, {
    signal: cancellation.signal,
    isProviderDispatchable: (candidate) => Boolean(ADAPTER_PROVIDERS[candidate]),
    modelPolicy: processed.modelPolicy ?? null,
  });

  const generator = runToolLoop(processed, {
    mcpTools: input.mcpTools,
    approvalMode: input.approvalMode,
    toolApprovalPolicy: input.toolApprovalPolicy,
    ...(input.connectorPermissions
      ? { connectorPermissions: connectorToolPermissionsFromEntries(input.connectorPermissions) }
      : {}),
    userId: input.userId,
    connectorExecutor,
    resume: input.continuation?.resume,
    eventSessionId: input.continuation?.eventSessionId,
    eventTurnId: input.continuation?.eventTurnId,
    initialEventSequence: input.continuation?.initialEventSequence,
    initialCompletedSteps: input.continuation?.initialCompletedSteps,
    invocationContinuation: input.continuation?.invocationContinuation,
    maxDurationMs: 210_000,
    isCancellationRequested: async () => {
      const cancelled = await isCloudAgentRunCancellationRequested(db, {
        userId: input.userId,
        runId: input.runId,
      });
      if (cancelled) cancellation.abort();
      return cancelled;
    },
    failover: {
      next: (error, context) => {
        const attempt = failover.next(error, context);
        if (attempt) serving = attempt.processed;
        return attempt;
      },
    },
    shouldPropagateExecutionError: (error) =>
      error instanceof FatalError || error instanceof RetryableError,
    providerExecutor: ({ operationKey, step, request, execute }) =>
      executeCloudAgentOperation<ToolLoopProviderStepResult>(db, {
        userId: input.userId,
        runId: input.runId,
        billingIdempotencyKey: billingLedgerKey,
        operationKey,
        operationKind: 'provider',
        retrySafety: 'unsafe',
        payload: { step, request },
        resultSchema: ProviderStepResultSchema,
        execute: async () => {
          const { lines, ...persisted } = await execute();
          return persisted;
        },
        usage: (result) => ({ ...result.usage }),
      }),
    toolExecutor: async ({ operationKey, retrySafety, toolCall, execute }) => {
      const refused = await toolPermissionGate.refusalFor(toolCall.qualifiedName);
      if (refused) return refused;
      return executeCloudAgentOperation<ToolLoopToolResult>(db, {
        userId: input.userId,
        runId: input.runId,
        billingIdempotencyKey: billingLedgerKey,
        operationKey,
        operationKind: 'tool',
        retrySafety,
        payload: toolCall,
        resultSchema: ToolResultSchema,
        execute,
      });
    },
    onInvocationCheckpoint: async (checkpoint) => {
      nextInput = workflowContinuation(input, serving, checkpoint);
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
    onInputCheckpoint: async (checkpoint) => {
      await saveCloudAgentInputCheckpoint(db, {
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
      inputCheckpointSaved = true;
    },
  });

  const journal = createCloudAgentEventJournal({ db, userId: input.userId, runId: input.runId });
  const writer = getWritable<Uint8Array>().getWriter();
  const stream = createBoundedDurableWriter(writer, {
    onUnreadable: reportUnreadableStream(input.runId, 'projection'),
  });
  try {
    for await (const chunk of generator) {
      for (const projected of projectCloudAgentWorkflowChunk(chunk)) {
        if (projected.envelope) {
          await journal.append(projected.envelope);
          if (projected.envelope.event.type === 'error') reportedFailure = true;
          if (projected.envelope.event.type === 'task-state-changed') {
            lastTaskState = projected.envelope.event.state;
          }
        }
        await stream.write(new TextEncoder().encode(projected.sse));
      }
    }
    await journal.flush();
  } finally {
    await journal.flush().catch((error: unknown) => {
      logger.warn(
        { error, runId: input.runId },
        'Buffered cloud agent events could not be journaled at step exit',
      );
    });
    writer.releaseLock();
  }

  if (nextInput) return { kind: 'continue', input: nextInput };

  const outcome: WorkflowTerminalOutcome =
    approvalCheckpointSaved || inputCheckpointSaved
      ? 'awaiting_input'
      : lastTaskState === 'cancelled'
        ? 'cancelled'
        : reportedFailure || lastTaskState === 'failed'
          ? 'failed'
          : 'completed';
  await settleWorkflowInvocation(input, outcome, serving);
  return { kind: 'terminal', outcome };
}

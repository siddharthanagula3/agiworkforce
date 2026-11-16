import { z } from 'zod';
import {
  CONTEXT_POLICY_SNAPSHOT_KEY,
  ContextPolicySnapshotSchema,
  type ContextPolicySnapshot,
} from '@/lib/services/context-policy-snapshot';
import { ROUTING_PROFILE_CHOICES } from '@agiworkforce/types';

import type { TurnAttachment } from '@/lib/e2b/attachment-staging';
import { fileSearchToolDefinitions, isFileSearchTool } from '@/lib/server/tools/file-search-tool';
import type { CloudAgentApprovalCheckpoint } from '@/lib/services/cloud-agent-run-service';
import type { ModelSelection } from './capability-preamble';
import { retargetMessagesToModel } from './managed-failover';
import type {
  CallerToolFields,
  ChatCompletionRequest,
  LargeFileTurn,
  ProcessedRequest,
} from './request-processor';
import { functionToolName } from './tool-loop-routing';
import { TurnToolProhibitionSchema, type TurnToolProhibition } from './turn-tool-prohibition';
import {
  ToolSchemaStateSchema,
  TOOL_SCHEMA_STATE_CHECKPOINT_KEY,
  withoutToolSchemaState,
  type ToolSchemaState,
} from './tool-schema-state';

const CHECKPOINT_TURN_ATTACHMENTS_KEY = 'x_turn_attachments';
const CHECKPOINT_MODEL_SELECTION_KEY = 'x_model_selection';
const CHECKPOINT_TURN_TOOL_PROHIBITION_KEY = 'x_turn_tool_prohibition';
export const CHECKPOINT_LARGE_FILE_TURN_KEY = 'x_large_file_turn';
const CHECKPOINT_PRIVATE_KEYS: readonly string[] = [
  CONTEXT_POLICY_SNAPSHOT_KEY,
  CHECKPOINT_TURN_ATTACHMENTS_KEY,
  CHECKPOINT_MODEL_SELECTION_KEY,
  CHECKPOINT_TURN_TOOL_PROHIBITION_KEY,
  TOOL_SCHEMA_STATE_CHECKPOINT_KEY,
  CHECKPOINT_LARGE_FILE_TURN_KEY,
];

const CheckpointLargeFileTurnSchema = z.object({
  assetIds: z.array(z.string().uuid()).min(1),
  attachmentAssetIds: z.array(z.string().uuid()),
  limitTokens: z.number().int().nonnegative(),
  charged: z.number().nonnegative(),
  readingClosed: z.boolean(),
  fileToolsOffered: z.boolean(),
  stepAllowanceLeft: z.number().nonnegative().optional(),
});

const CheckpointTurnAttachmentsSchema = z.array(
  z.object({
    filename: z.string().min(1),
    mimeType: z.string().min(1),
    base64: z.string().min(1),
  }),
);

const CheckpointModelSelectionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('picked'),
    modelId: z.string().min(1),
    routingProfile: z.enum(ROUTING_PROFILE_CHOICES).optional(),
    workspaceDefaultModelId: z.string().min(1).optional(),
  }),
  z.object({ kind: z.literal('assigned') }),
]);

export function buildApprovalCheckpointRequest(
  chatRequest: ChatCompletionRequest,
  callerToolFields: CallerToolFields = {},
  turnAttachments: readonly TurnAttachment[] = [],
  modelSelection?: ModelSelection,
  turnToolProhibition?: TurnToolProhibition | null,
  toolSchemaState?: ToolSchemaState,
  contextPolicySnapshot?: ContextPolicySnapshot,
  largeFileTurn?: LargeFileTurn,
): Record<string, unknown> {
  const {
    messages: _messages,
    tools: _serverAndCallerTools,
    tool_choice: _serverOrCallerToolChoice,
    code_execution: _serverOrCallerCodeExecution,
    ...request
  } = chatRequest;
  const publicRequest = replayableCheckpointRequest(withoutToolSchemaState(request));
  const policySnapshot = ContextPolicySnapshotSchema.safeParse(contextPolicySnapshot);
  const schemaState = ToolSchemaStateSchema.safeParse(toolSchemaState);
  const savedLargeFileTurn = largeFileTurn
    ? CheckpointLargeFileTurnSchema.safeParse(largeFileTurn)
    : null;
  return {
    ...publicRequest,
    ...callerToolFields,
    ...(policySnapshot.success ? { [CONTEXT_POLICY_SNAPSHOT_KEY]: policySnapshot.data } : {}),
    stream: true,
    ...(turnAttachments.length > 0 ? { [CHECKPOINT_TURN_ATTACHMENTS_KEY]: turnAttachments } : {}),
    ...(modelSelection ? { [CHECKPOINT_MODEL_SELECTION_KEY]: modelSelection } : {}),
    ...(turnToolProhibition ? { [CHECKPOINT_TURN_TOOL_PROHIBITION_KEY]: turnToolProhibition } : {}),
    ...(schemaState.success ? { [TOOL_SCHEMA_STATE_CHECKPOINT_KEY]: schemaState.data } : {}),
    ...(savedLargeFileTurn?.success
      ? { [CHECKPOINT_LARGE_FILE_TURN_KEY]: savedLargeFileTurn.data }
      : {}),
  };
}

/**
 * The ledger a resumed turn continues from. A checkpoint without the key was
 * saved by a turn with no large file, or by a build without the feature, and
 * resumes with no ledger. The asset ids are only a claim here; every read of
 * them repeats the owner check.
 */
function checkpointLargeFileTurn(request: Record<string, unknown>): LargeFileTurn | undefined {
  const parsed = CheckpointLargeFileTurnSchema.safeParse(request[CHECKPOINT_LARGE_FILE_TURN_KEY]);
  return parsed.success ? parsed.data : undefined;
}

/**
 * A resumed request carries no file part, so processing it offers no file
 * tools; the paused turn offered them, and its tool list must not change.
 */
function restoreLargeFileTools(processed: ProcessedRequest): void {
  const ledger = processed.largeFileTurn;
  if (!ledger?.fileToolsOffered) return;
  if (processed.turnToolProhibition?.allTools === true) {
    ledger.fileToolsOffered = false;
    return;
  }
  processed.llmRequest.tools = [
    ...(processed.llmRequest.tools ?? []).filter(
      (tool) => !isFileSearchTool(functionToolName(tool)),
    ),
    ...fileSearchToolDefinitions({ largeFileTurn: true }),
  ];
}

function replayableCheckpointRequest(request: Record<string, unknown>): Record<string, unknown> {
  if (!CHECKPOINT_PRIVATE_KEYS.some((key) => Object.hasOwn(request, key))) return request;
  return Object.fromEntries(
    Object.entries(request).filter(([key]) => !CHECKPOINT_PRIVATE_KEYS.includes(key)),
  );
}

export function checkpointRequestForResume(
  request: Record<string, unknown>,
  isFreeTierRequest: boolean,
): Record<string, unknown> {
  const replayable = replayableCheckpointRequest(request);
  if (!isFreeTierRequest) return replayable;
  const {
    tools: _legacyInjectedTools,
    tool_choice: _legacyInjectedChoice,
    ...freeRequest
  } = replayable;
  return freeRequest;
}

export function checkpointTurnToolProhibition(
  request: Record<string, unknown>,
): TurnToolProhibition | undefined {
  const parsed = TurnToolProhibitionSchema.safeParse(request[CHECKPOINT_TURN_TOOL_PROHIBITION_KEY]);
  return parsed.success ? parsed.data : undefined;
}

function checkpointTurnAttachments(request: Record<string, unknown>): TurnAttachment[] {
  const parsed = CheckpointTurnAttachmentsSchema.safeParse(
    request[CHECKPOINT_TURN_ATTACHMENTS_KEY],
  );
  return parsed.success ? parsed.data : [];
}

export function restoreCheckpointedTurn(
  processed: ProcessedRequest,
  checkpoint: Pick<CloudAgentApprovalCheckpoint, 'request' | 'messages'>,
): void {
  const schemaState = ToolSchemaStateSchema.safeParse(
    checkpoint.request[TOOL_SCHEMA_STATE_CHECKPOINT_KEY],
  );
  processed.toolSchemaState = schemaState.success ? schemaState.data : undefined;
  processed.turnAttachments = checkpointTurnAttachments(checkpoint.request);
  processed.largeFileTurn = checkpointLargeFileTurn(checkpoint.request);
  restoreLargeFileTools(processed);
  const renderedModel = checkpoint.request['model'];
  const selection = CheckpointModelSelectionSchema.safeParse(
    checkpoint.request[CHECKPOINT_MODEL_SELECTION_KEY],
  );
  if (!selection.success || typeof renderedModel !== 'string') {
    processed.llmRequest.messages = checkpoint.messages;
    return;
  }
  processed.modelSelection = selection.data;
  processed.llmRequest.messages = retargetMessagesToModel(
    checkpoint.messages,
    { chatRequest: { model: renderedModel }, modelSelection: selection.data },
    processed.chatRequest.model,
  );
}

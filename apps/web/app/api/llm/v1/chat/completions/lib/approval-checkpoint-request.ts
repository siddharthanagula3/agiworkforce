import { z } from 'zod';
import { ROUTING_PROFILE_CHOICES } from '@agiworkforce/types';

import type { TurnAttachment } from '@/lib/e2b/attachment-staging';
import type { CloudAgentApprovalCheckpoint } from '@/lib/services/cloud-agent-run-service';
import type { ModelSelection } from './capability-preamble';
import { retargetMessagesToModel } from './managed-failover';
import type {
  CallerToolFields,
  ChatCompletionRequest,
  ProcessedRequest,
} from './request-processor';
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
const CHECKPOINT_PRIVATE_KEYS: readonly string[] = [
  CHECKPOINT_TURN_ATTACHMENTS_KEY,
  CHECKPOINT_MODEL_SELECTION_KEY,
  CHECKPOINT_TURN_TOOL_PROHIBITION_KEY,
  TOOL_SCHEMA_STATE_CHECKPOINT_KEY,
];

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
): Record<string, unknown> {
  const {
    messages: _messages,
    tools: _serverAndCallerTools,
    tool_choice: _serverOrCallerToolChoice,
    code_execution: _serverOrCallerCodeExecution,
    ...request
  } = chatRequest;
  const publicRequest = withoutToolSchemaState(request);
  const schemaState = ToolSchemaStateSchema.safeParse(toolSchemaState);
  return {
    ...publicRequest,
    ...callerToolFields,
    stream: true,
    ...(turnAttachments.length > 0 ? { [CHECKPOINT_TURN_ATTACHMENTS_KEY]: turnAttachments } : {}),
    ...(modelSelection ? { [CHECKPOINT_MODEL_SELECTION_KEY]: modelSelection } : {}),
    ...(turnToolProhibition ? { [CHECKPOINT_TURN_TOOL_PROHIBITION_KEY]: turnToolProhibition } : {}),
    ...(schemaState.success ? { [TOOL_SCHEMA_STATE_CHECKPOINT_KEY]: schemaState.data } : {}),
  };
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

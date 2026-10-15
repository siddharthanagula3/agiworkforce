import { z } from 'zod';
import { ROUTING_PROFILE_CHOICES } from '@agiworkforce/types';

import type { TurnAttachment } from '@/lib/e2b/attachment-staging';
import type { CloudAgentApprovalCheckpoint } from '@/lib/services/cloud-agent-run-service';
import type { ModelSelection } from './capability-preamble';
import { retargetMessagesToModel } from './managed-failover';
import type { ChatCompletionRequest, ProcessedRequest } from './request-processor';

const CHECKPOINT_TURN_ATTACHMENTS_KEY = 'x_turn_attachments';
const CHECKPOINT_MODEL_SELECTION_KEY = 'x_model_selection';

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
  callerToolFields: Pick<ChatCompletionRequest, 'tools' | 'tool_choice'> = {},
  turnAttachments: readonly TurnAttachment[] = [],
  modelSelection?: ModelSelection,
): Record<string, unknown> {
  const {
    messages: _messages,
    tools: _serverAndCallerTools,
    tool_choice: _serverOrCallerToolChoice,
    ...request
  } = chatRequest;
  return {
    ...request,
    ...callerToolFields,
    stream: true,
    ...(turnAttachments.length > 0 ? { [CHECKPOINT_TURN_ATTACHMENTS_KEY]: turnAttachments } : {}),
    ...(modelSelection ? { [CHECKPOINT_MODEL_SELECTION_KEY]: modelSelection } : {}),
  };
}

function replayableCheckpointRequest(request: Record<string, unknown>): Record<string, unknown> {
  if (
    !Object.hasOwn(request, CHECKPOINT_TURN_ATTACHMENTS_KEY) &&
    !Object.hasOwn(request, CHECKPOINT_MODEL_SELECTION_KEY)
  ) {
    return request;
  }
  const {
    [CHECKPOINT_TURN_ATTACHMENTS_KEY]: _turnAttachments,
    [CHECKPOINT_MODEL_SELECTION_KEY]: _modelSelection,
    ...replayable
  } = request;
  return replayable;
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

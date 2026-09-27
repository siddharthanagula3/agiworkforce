import { z } from 'zod';

import type { TurnAttachment } from '@/lib/e2b/attachment-staging';
import type { ChatCompletionRequest } from './request-processor';

const CHECKPOINT_TURN_ATTACHMENTS_KEY = 'x_turn_attachments';

const CheckpointTurnAttachmentsSchema = z.array(
  z.object({
    filename: z.string().min(1),
    mimeType: z.string().min(1),
    base64: z.string().min(1),
  }),
);

export function buildApprovalCheckpointRequest(
  chatRequest: ChatCompletionRequest,
  callerToolFields: Pick<ChatCompletionRequest, 'tools' | 'tool_choice'> = {},
  turnAttachments: readonly TurnAttachment[] = [],
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
  };
}

function replayableCheckpointRequest(request: Record<string, unknown>): Record<string, unknown> {
  if (!Object.hasOwn(request, CHECKPOINT_TURN_ATTACHMENTS_KEY)) return request;
  const { [CHECKPOINT_TURN_ATTACHMENTS_KEY]: _turnAttachments, ...replayable } = request;
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

export function checkpointTurnAttachments(request: Record<string, unknown>): TurnAttachment[] {
  const parsed = CheckpointTurnAttachmentsSchema.safeParse(
    request[CHECKPOINT_TURN_ATTACHMENTS_KEY],
  );
  return parsed.success ? parsed.data : [];
}

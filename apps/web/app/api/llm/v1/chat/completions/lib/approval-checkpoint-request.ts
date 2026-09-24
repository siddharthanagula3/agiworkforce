import type { ChatCompletionRequest } from './request-processor';

export function buildApprovalCheckpointRequest(
  chatRequest: ChatCompletionRequest,
  callerToolFields: Pick<ChatCompletionRequest, 'tools' | 'tool_choice'> = {},
): Record<string, unknown> {
  const {
    messages: _messages,
    tools: _serverAndCallerTools,
    tool_choice: _serverOrCallerToolChoice,
    ...request
  } = chatRequest;
  return { ...request, ...callerToolFields, stream: true };
}

export function checkpointRequestForResume(
  request: Record<string, unknown>,
  isFreeTierRequest: boolean,
): Record<string, unknown> {
  if (!isFreeTierRequest) return request;
  const { tools: _legacyInjectedTools, tool_choice: _legacyInjectedChoice, ...freeRequest } =
    request;
  return freeRequest;
}

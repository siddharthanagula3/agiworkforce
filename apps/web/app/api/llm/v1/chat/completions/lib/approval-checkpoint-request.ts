import type { ChatCompletionRequest } from './request-processor';

export function buildApprovalCheckpointRequest(
  chatRequest: ChatCompletionRequest,
): Record<string, unknown> {
  const { messages: _messages, ...request } = chatRequest;
  return { ...request, stream: true };
}

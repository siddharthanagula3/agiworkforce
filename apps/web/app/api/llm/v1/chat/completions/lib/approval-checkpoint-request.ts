import type { ChatCompletionRequest } from './request-processor';

/**
 * Keep only the validated request policy needed to re-run current admission on
 * approval resume. The mutable execution transcript is stored separately.
 */
export function buildApprovalCheckpointRequest(
  chatRequest: ChatCompletionRequest,
): Record<string, unknown> {
  const { messages: _messages, ...request } = chatRequest;
  return { ...request, stream: true };
}

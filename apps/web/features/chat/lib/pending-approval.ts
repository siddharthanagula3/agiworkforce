import type { Message } from '@shared/stores/web-chat-store';

type MessageTool = NonNullable<NonNullable<Message['metadata']>['tools']>[number];

export function isAwaitingToolApproval(tool: MessageTool): boolean {
  return (
    tool.status === 'awaiting_approval' &&
    tool.requiresApproval === true &&
    Boolean(tool.toolCallId) &&
    tool.approved === undefined
  );
}

export function hasPendingApproval(messages: readonly Message[]): boolean {
  return messages.some((message) => {
    if (message.role !== 'assistant') return false;
    const projection = message.metadata?.cloudApproval;
    if (projection) return projection.calls.some((call) => !call.approvalDecision);
    return (message.metadata?.tools ?? []).some(isAwaitingToolApproval);
  });
}

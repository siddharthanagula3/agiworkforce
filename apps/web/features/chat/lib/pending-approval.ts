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

function pendingApprovalsIn(message: Message): number {
  if (message.role !== 'assistant') return 0;
  const projection = message.metadata?.cloudApproval;
  if (projection) return projection.calls.filter((call) => !call.approvalDecision).length;
  return (message.metadata?.tools ?? []).filter(isAwaitingToolApproval).length;
}

export function hasPendingApproval(messages: readonly Message[]): boolean {
  return messages.some((message) => pendingApprovalsIn(message) > 0);
}

export function countPendingApprovals(
  messagesByConversation: Readonly<Record<string, readonly Message[]>>,
): number {
  let count = 0;
  for (const messages of Object.values(messagesByConversation)) {
    for (const message of messages) count += pendingApprovalsIn(message);
  }
  return count;
}

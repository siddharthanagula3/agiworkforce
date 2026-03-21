import type { ToolLabelEntry, ChatState } from '../stores/chat/chatStore';
import type { ActionTrailEntry } from '../stores/chat/agentStore';
import type { ActionLogEntry, ApprovalRequest } from '../stores/chat/toolStore';
import type { UnifiedChatState } from '../stores/unifiedChatStore';

type MessageRuntimeUnifiedState = Pick<
  UnifiedChatState,
  'actionLog' | 'pendingApprovals' | 'getActiveActionTrail'
>;

type MessageRuntimeChatState = Pick<ChatState, 'toolTimelineByMessage' | 'thinkingByMessage'>;

export interface MessageRuntimeActivity {
  messageId: string;
  actionTrail: ActionTrailEntry[];
  actionLog: ActionLogEntry[];
  approvals: ApprovalRequest[];
  toolTimeline: ToolLabelEntry[];
  thinkingContent: string;
}

const EMPTY_TOOL_TIMELINE: ToolLabelEntry[] = [];
const EMPTY_ACTION_LOG: ActionLogEntry[] = [];
const EMPTY_APPROVALS: ApprovalRequest[] = [];

export function selectMessageActionTrail(
  state: MessageRuntimeUnifiedState,
  messageId?: string,
): ActionTrailEntry[] {
  if (typeof state.getActiveActionTrail !== 'function') {
    return [];
  }

  return state.getActiveActionTrail(messageId);
}

export function selectMessageActionLog(
  state: MessageRuntimeUnifiedState,
  messageId: string,
): ActionLogEntry[] {
  return (state.actionLog ?? EMPTY_ACTION_LOG)
    .filter((entry) => entry.metadata?.['messageId'] === messageId)
    .slice()
    .reverse();
}

export function selectMessageApprovals(
  state: MessageRuntimeUnifiedState,
  messageId: string,
): ApprovalRequest[] {
  return (state.pendingApprovals ?? EMPTY_APPROVALS).filter(
    (approval) => approval.status === 'pending' && approval.messageId === messageId,
  );
}

export function selectUnassignedApprovals(state: MessageRuntimeUnifiedState): ApprovalRequest[] {
  return (state.pendingApprovals ?? EMPTY_APPROVALS).filter(
    (approval) => approval.status === 'pending' && !approval.messageId,
  );
}

export function selectMessageToolTimeline(
  state: MessageRuntimeChatState,
  messageId: string,
): ToolLabelEntry[] {
  return state.toolTimelineByMessage[messageId] ?? EMPTY_TOOL_TIMELINE;
}

export function selectMessageThinking(state: MessageRuntimeChatState, messageId: string): string {
  return state.thinkingByMessage[messageId] ?? '';
}

export function buildMessageRuntimeActivity(
  unifiedState: MessageRuntimeUnifiedState,
  chatState: MessageRuntimeChatState,
  messageId: string,
): MessageRuntimeActivity {
  return {
    messageId,
    actionTrail: selectMessageActionTrail(unifiedState, messageId),
    actionLog: selectMessageActionLog(unifiedState, messageId),
    approvals: selectMessageApprovals(unifiedState, messageId),
    toolTimeline: selectMessageToolTimeline(chatState, messageId),
    thinkingContent: selectMessageThinking(chatState, messageId),
  };
}

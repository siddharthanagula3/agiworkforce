import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from '../../stores/chat/chatStore';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import {
  buildMessageRuntimeActivity,
  selectMessageActionLog,
  selectMessageActionTrail,
  selectMessageApprovals,
  selectUnassignedApprovals,
} from '../../lib/messageActivity';

export function useMessageRuntimeActivity(messageId: string) {
  const unifiedRuntimeState = useUnifiedChatStore(
    useShallow((state) => ({
      actionLog: state.actionLog,
      pendingApprovals: state.pendingApprovals,
      getActiveActionTrail: state.getActiveActionTrail,
    })),
  );
  const chatRuntimeState = useChatStore(
    useShallow((state) => ({
      toolTimelineByMessage: state.toolTimelineByMessage,
      thinkingByMessage: state.thinkingByMessage,
    })),
  );

  return useMemo(
    () => buildMessageRuntimeActivity(unifiedRuntimeState, chatRuntimeState, messageId),
    [chatRuntimeState, messageId, unifiedRuntimeState],
  );
}

export function useMessageActionTrail(messageId?: string) {
  return useUnifiedChatStore((state) => selectMessageActionTrail(state, messageId));
}

export function useMessageActionLog(messageId: string) {
  return useUnifiedChatStore((state) => selectMessageActionLog(state, messageId));
}

export function useMessageApprovals(messageId: string) {
  return useUnifiedChatStore((state) => selectMessageApprovals(state, messageId));
}

export function useUnassignedApprovals() {
  return useUnifiedChatStore(selectUnassignedApprovals);
}

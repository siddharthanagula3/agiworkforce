import { useAgentStore } from '../stores/chat/agentStore';
import { useChatStore } from '../stores/chat/chatStore';
import { useToolStore } from '../stores/chat/toolStore';

const NEW_CHAT_ABORT_EVENT = 'chat:new-conversation';

/**
 * Clears transient in-flight state before creating a new chat so stale
 * loading/thinking/tool indicators do not leak across conversations.
 */
export function resetInFlightChatState(): void {
  const chatStore = useChatStore.getState();
  const agentStore = useAgentStore.getState();
  const toolStore = useToolStore.getState();

  // Ask active listeners/components to abort in-flight work.
  window.dispatchEvent(new CustomEvent(NEW_CHAT_ABORT_EVENT));

  // Reset stream/loading indicators immediately.
  chatStore.setIsLoading(false);
  chatStore.setStreamingMessage(null);

  // Clear transient agent activity indicators.
  agentStore.setAgentStatus(null);
  agentStore.clearActionTrail();
  agentStore.clearBackgroundTasks();

  // Cancel active tool streams and clear stream map.
  const runningTools = Array.from(toolStore.activeToolStreams.values()).filter(
    (stream) => stream.status === 'running',
  );

  runningTools.forEach((stream) => {
    void toolStore.cancelToolExecution(stream.tool_id);
  });
  toolStore.clearToolStreams();
}

export { NEW_CHAT_ABORT_EVENT };

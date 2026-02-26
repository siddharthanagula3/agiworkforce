import { useAgentStore } from '@/stores/unified/chat/agentStore';
import { useChatStore } from '@/stores/unified/chat/chatStore';
import { useToolStore } from '@/stores/unified/chat/toolStore';
import { isTauri, invoke } from '@tauri-apps/api/core';

const NEW_CHAT_ABORT_EVENT = 'chat:new-conversation';

/**
 * Clears transient in-flight state before creating a new chat so stale
 * loading/thinking/tool indicators do not leak across conversations.
 */
export async function resetInFlightChatState(): Promise<void> {
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

  // AUDIT-STREAM-022 fix: Cancel active tool streams via backend first,
  // then update local state. This ensures both channels (backend + activeToolStreams) are unified.
  const runningTools = Array.from(toolStore.activeToolStreams.values()).filter(
    (stream) => stream.status === 'running',
  );

  // Cancel each running tool via backend first
  for (const stream of runningTools) {
    try {
      if (await isTauri()) {
        await invoke('cancel_tool_execution', { tool_id: stream.tool_id });
      }
    } catch (error) {
      console.warn('[newChatReset] Failed to cancel tool:', stream.tool_id, error);
    }
    // Update local state
    toolStore.cancelToolExecution(stream.tool_id);
  }

  // Also stop any ongoing generation on the backend
  if (await isTauri()) {
    try {
      await invoke('chat_stop_generation');
    } catch (error) {
      console.warn('[newChatReset] Failed to stop generation:', error);
    }
  }

  toolStore.clearToolStreams();
}

export { NEW_CHAT_ABORT_EVENT };

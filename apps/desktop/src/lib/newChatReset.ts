import { useAgentStore } from '../stores/chat/agentStore';
import { useChatStore } from '../stores/chat/chatStore';
import { useToolStore } from '../stores/chat/toolStore';
import { isTauri, invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

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

  const inDesktop = await isTauri();
  const cancellationResults = inDesktop
    ? await Promise.allSettled(
        runningTools.map(async (stream) => {
          await toolStore.cancelToolExecution(stream.tool_id);
          return stream.tool_id;
        }),
      )
    : [];

  const failedTools = cancellationResults
    .map((result, index) => (result.status === 'rejected' ? runningTools[index]?.tool_id : null))
    .filter((toolId): toolId is string => Boolean(toolId));

  let stopGenerationFailed = false;
  if (inDesktop) {
    try {
      await invoke('chat_stop_generation');
    } catch (error) {
      stopGenerationFailed = true;
      console.warn('[newChatReset] Failed to stop generation:', error);
    }
  }

  if (failedTools.length > 0 || stopGenerationFailed) {
    toast.error(
      failedTools.length > 0
        ? `Cleanup incomplete. Failed to cancel ${failedTools.length} running tool${failedTools.length === 1 ? '' : 's'}.`
        : 'Cleanup incomplete. Failed to stop the current response cleanly.',
    );
  }

  toolStore.clearToolStreams();
}

export { NEW_CHAT_ABORT_EVENT };

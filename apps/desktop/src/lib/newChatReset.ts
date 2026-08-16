import { useAgentStore } from '../stores/chat/agentStore';
import { useChatStore } from '../stores/chat/chatStore';
import { useToolStore } from '../stores/chat/toolStore';
import { useProjectStore } from '../stores/projectStore';
import { isTauri, invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

const NEW_CHAT_ABORT_EVENT = 'chat:new-conversation';

export async function resetInFlightChatState(): Promise<void> {
  const chatStore = useChatStore.getState();
  const agentStore = useAgentStore.getState();
  const toolStore = useToolStore.getState();

  window.dispatchEvent(new CustomEvent(NEW_CHAT_ABORT_EVENT));

  chatStore.setIsLoading(false);
  chatStore.setStreamingMessage(null);

  agentStore.setAgentStatus(null);
  agentStore.clearActionTrail();
  agentStore.clearBackgroundTasks();

  useProjectStore.getState().setCurrentFolder(null);

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

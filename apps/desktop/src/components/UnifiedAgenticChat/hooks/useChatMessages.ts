import { useState } from 'react';
import { useUnifiedChatStore } from '../../../stores/unifiedChatStore';
import {
  useChatStore,
  selectAgenticLoopStatus,
  selectTokenUsage,
} from '../../../stores/chat/chatStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { selectIsSimpleMode, useSimpleModeStore } from '../../../stores/ui';
import { usePromptSuggestions } from '../../../hooks/usePromptSuggestions';
import { type AgentStep } from '../AgentStepTimeline';
import { type BriefStatusState } from '../BriefStatus';

export interface UseChatMessagesReturn {
  messages: ReturnType<typeof useChatStore.getState>['messages'];
  tokenUsage: ReturnType<typeof selectTokenUsage>;
  showTokenCounter: boolean;
  agenticLoopStatus: ReturnType<typeof selectAgenticLoopStatus>;
  agentSteps: AgentStep[];
  briefStatusState: BriefStatusState;
  isEmptyConversation: boolean;
  showEmptyStateUI: boolean;
  draftContent: string;
  promptSuggestions: ReturnType<typeof usePromptSuggestions>;
  showPromptSuggestions: boolean;
  suggestionIndex: number;
  setSuggestionIndex: (index: number) => void;
}

export function useChatMessages(): UseChatMessagesReturn {
  const tokenUsage = useChatStore(selectTokenUsage);
  const showTokenCounter = useSettingsStore((s) => s.chatPreferences.compactMode !== true);

  const agenticLoopStatus = useChatStore(selectAgenticLoopStatus);
  const messages = useChatStore((s) => s.messages);
  const actionTrail = useUnifiedChatStore((s) => s.actionTrail);
  const draftContent = useUnifiedChatStore((s) => s.draftContent);
  const isSimpleMode = useSimpleModeStore(selectIsSimpleMode);

  const promptSuggestions = usePromptSuggestions(draftContent);
  const [suggestionIndex, setSuggestionIndex] = useState(0);

  const isEmptyConversation = messages.length === 0;
  const showEmptyStateUI = isEmptyConversation && !isSimpleMode;
  const showPromptSuggestions =
    isEmptyConversation && promptSuggestions.length > 0 && draftContent.length >= 3;

  const agentSteps: AgentStep[] = actionTrail.map((entry) => ({
    id: entry.id,
    agentType:
      entry.type === 'thinking'
        ? 'planner'
        : entry.type === 'coding'
          ? 'executor'
          : entry.type === 'searching'
            ? 'executor'
            : entry.type === 'running'
              ? 'executor'
              : entry.type === 'completed'
                ? 'reviewer'
                : entry.type === 'error'
                  ? 'executor'
                  : 'coordinator',
    label: entry.message,
    status:
      entry.type === 'completed'
        ? 'complete'
        : entry.type === 'error'
          ? 'error'
          : entry.type === 'running' || entry.type === 'searching' || entry.type === 'coding'
            ? 'running'
            : 'pending',
    startedAt: entry.timestamp instanceof Date ? entry.timestamp.getTime() : undefined,
    completedAt:
      entry.type === 'completed' && entry.timestamp instanceof Date
        ? entry.timestamp.getTime()
        : undefined,
    details: entry.metadata?.['details'] as string | undefined,
  }));

  const latestAction = actionTrail.length > 0 ? actionTrail[actionTrail.length - 1] : null;
  const briefStatusState: BriefStatusState = latestAction
    ? {
        message: latestAction.message,
        isComplete: latestAction.type === 'completed',
        isError: latestAction.type === 'error',
      }
    : { message: null, isComplete: false, isError: false };

  return {
    messages,
    tokenUsage,
    showTokenCounter,
    agenticLoopStatus,
    agentSteps,
    briefStatusState,
    isEmptyConversation,
    showEmptyStateUI,
    draftContent,
    promptSuggestions,
    showPromptSuggestions,
    suggestionIndex,
    setSuggestionIndex,
  };
}

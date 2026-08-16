
import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuthStore } from '@shared/stores/authentication-store';
import { toast } from 'sonner';
import { logger } from '@shared/lib/logger';
import type { SimpleChatMessage } from '@shared/types';

/**
 * Re-export SimpleChatMessage as ChatMessage for backward compatibility
 * @deprecated Import SimpleChatMessage from @shared/types instead
 */
export type ChatMessage = SimpleChatMessage;

export interface ChatTab {
  id: string;
  employeeId: string;
  role: string;
  name: string;
  provider: string;
  messages: ChatMessage[];
  isActive: boolean;
}

export interface ChatState {
  tabs: ChatTab[];
  activeTabId: string | null;
  isSending: boolean;
  error: string | null;
}

export const useChatState = () => {
  const { user: _user } = useAuthStore();
  const [state, setState] = useState<ChatState>({
    tabs: [],
    activeTabId: null,
    isSending: false,
    error: null,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const updateState = useCallback((updater: (prev: ChatState) => ChatState) => {
    try {
      setState((prev) => {
        const newState = updater(prev);
        return newState;
      });
    } catch (error) {
      logger.error('Error updating chat state', error);
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }));
    }
  }, []);

  const addTab = useCallback(
    (tab: Omit<ChatTab, 'messages' | 'isActive'>) => {
      updateState((prev) => {
        const newTab: ChatTab = {
          ...tab,
          messages: [],
          isActive: true,
        };

        const updatedTabs = prev.tabs.map((t) => ({ ...t, isActive: false }));

        return {
          ...prev,
          tabs: [...updatedTabs, newTab],
          activeTabId: newTab.id,
          error: null,
        };
      });
    },
    [updateState],
  );

  const removeTab = useCallback(
    (tabId: string) => {
      updateState((prev) => {
        const updatedTabs = prev.tabs.filter((t) => t.id !== tabId);
        const newActiveTabId = updatedTabs.length > 0 ? updatedTabs[0]!.id : null;

        return {
          ...prev,
          tabs: updatedTabs,
          activeTabId: newActiveTabId,
        };
      });
    },
    [updateState],
  );

  const setActiveTab = useCallback(
    (tabId: string) => {
      updateState((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) => ({ ...t, isActive: t.id === tabId })),
        activeTabId: tabId,
      }));
    },
    [updateState],
  );

  const addMessage = useCallback(
    (tabId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
      updateState((prev) => ({
        ...prev,
        tabs: prev.tabs.map((tab) =>
          tab.id === tabId
            ? {
                ...tab,
                messages: [
                  ...tab.messages,
                  {
                    ...message,
                    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    timestamp: new Date(),
                  },
                ],
              }
            : tab,
        ),
      }));
    },
    [updateState],
  );

  const updateMessage = useCallback(
    (tabId: string, messageId: string, updates: Partial<ChatMessage>) => {
      updateState((prev) => ({
        ...prev,
        tabs: prev.tabs.map((tab) =>
          tab.id === tabId
            ? {
                ...tab,
                messages: tab.messages.map((msg) =>
                  msg.id === messageId ? { ...msg, ...updates } : msg,
                ),
              }
            : tab,
        ),
      }));
    },
    [updateState],
  );

  const setSending = useCallback(
    (isSending: boolean) => {
      updateState((prev) => ({ ...prev, isSending }));
    },
    [updateState],
  );

  const setError = useCallback(
    (error: string | null) => {
      updateState((prev) => ({ ...prev, error }));
    },
    [updateState],
  );

  const clearError = useCallback(() => {
    updateState((prev) => ({ ...prev, error: null }));
  }, [updateState]);

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId) || null;

  const activeMessages = activeTab?.messages || [];

  useEffect(() => {
    if (state.error) {
      const timer = setTimeout(() => {
        clearError();
      }, 5000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [state.error, clearError]);

  useEffect(() => {
    if (state.error) {
      toast.error(state.error);
    }
  }, [state.error]);

  return {
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    activeTab,
    activeMessages,
    isSending: state.isSending,
    error: state.error,

    addTab,
    removeTab,
    setActiveTab,
    addMessage,
    updateMessage,
    setSending,
    setError,
    clearError,
  };
};

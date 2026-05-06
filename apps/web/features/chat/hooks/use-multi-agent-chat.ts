/**
 * Multi-Agent Chat Hook
 * Main hook for integrating multi-agent orchestration with chat interface
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useMissionStore } from '@shared/stores/mission-control-store';
import { systemPromptsService } from '@core/ai/employees/prompt-management';
import type { AIEmployee } from '@core/types/ai-employee';
import { getCsrfToken } from '@/lib/client/csrf';

export interface MultiAgentChatOptions {
  mode?: 'mission' | 'chat';
  sessionId?: string;
  userId?: string;
  selectedAgents?: string[];
  autoSelectAgent?: boolean;
}

export interface UseMultiAgentChatReturn {
  // State
  messages: Array<{
    type: 'user' | 'employee' | 'system' | 'error';
    content: string;
    timestamp?: Date;
    employee?: string;
    metadata?: Record<string, unknown>;
  }>;
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  activeAgents: AIEmployee[];
  currentMode: 'mission' | 'chat';

  // Actions
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<void>;
  switchMode: (mode: 'mission' | 'chat') => void;
  selectAgent: (agentName: string) => void;
  deselectAgent: (agentName: string) => void;
  clearMessages: () => void;
  regenerateLastResponse: () => Promise<void>;
}

export interface SendMessageOptions {
  agents?: string[];
  forceMode?: 'mission' | 'chat';
  temperature?: number;
  model?: string;
}

/**
 * Main multi-agent chat hook
 * Integrates workforce orchestrator with chat UI
 */
export function useMultiAgentChat(options: MultiAgentChatOptions = {}): UseMultiAgentChatReturn {
  const {
    mode: initialMode = 'chat',
    sessionId,
    userId,
    selectedAgents: _selectedAgents = [],
    autoSelectAgent: _autoSelectAgent = true,
  } = options;

  // Mission store state
  const missionMode = useMissionStore((state) => state.mode);
  const missionMessages = useMissionStore((state) => state.messages);
  const activeEmployees = useMissionStore((state) => state.activeEmployees);
  const isOrchestrating = useMissionStore((state) => state.isOrchestrating);
  const missionError = useMissionStore((state) => state.error);

  // Mission store actions
  const setMode = useMissionStore((state) => state.setMode);
  const setChatSession = useMissionStore((state) => state.setChatSession);
  const addCollaborativeAgent = useMissionStore((state) => state.addCollaborativeAgent);
  const removeCollaborativeAgent = useMissionStore((state) => state.removeCollaborativeAgent);

  const reset = useMissionStore((state) => state.reset);

  // Local state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableAgents, setAvailableAgents] = useState<AIEmployee[]>([]);
  const conversationHistoryRef = useRef<
    Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  >([]);

  // Load available agents (all agents are always available in skills-based model)
  useEffect(() => {
    const loadAgents = async () => {
      try {
        const agents = await systemPromptsService.getAvailableEmployees();
        setAvailableAgents(agents);
      } catch (err) {
        console.error('Failed to load agents:', err);
      }
    };

    loadAgents();
  }, [userId]);

  // Initialize mode and session
  useEffect(() => {
    setMode(initialMode);
    if (sessionId) {
      setChatSession(sessionId);
    }
  }, [initialMode, sessionId, setMode, setChatSession]);

  // Sync mission messages to conversation history
  useEffect(() => {
    const newHistory = missionMessages
      .filter((msg) => msg.type === 'user' || msg.type === 'employee')
      .map((msg) => ({
        role: (msg.type === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: msg.content,
      }));

    conversationHistoryRef.current = newHistory;
  }, [missionMessages]);

  // Send message
  const sendMessage = useCallback(
    async (content: string, opts: SendMessageOptions = {}) => {
      if (!content.trim()) {
        toast.error('Please enter a message');
        return;
      }

      if (!userId) {
        toast.error('User ID is required');
        return;
      }

      setIsLoading(true);
      setError(null);

      const messageMode = opts.forceMode || missionMode;

      try {
        // Determine the correct endpoint based on the mode
        const endpoint = messageMode === 'mission' ? '/api/mission' : '/api/llm/completion';

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };

        // Attach Supabase access token if available (browser environment)
        if (typeof window !== 'undefined') {
          try {
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key?.includes('-auth-token')) {
                const raw = localStorage.getItem(key);
                if (raw) {
                  const parsed = JSON.parse(raw) as { access_token?: string };
                  if (parsed.access_token) {
                    headers['Authorization'] = `Bearer ${parsed.access_token}`;
                  }
                }
                break;
              }
            }
          } catch {
            // localStorage may be unavailable
          }

          // SECURITY (web-MED-1): the previous implementation read a
          // `csrf-token` cookie that the server never sets — the auth chain
          // uses `anon-session-id` cookie + an HMAC token returned by
          // `/api/csrf`. The cookie lookup therefore always returned
          // `undefined`, leaving `x-csrf-token` unset and silently degrading
          // CSRF coverage on `/api/mission` and `/api/llm/completion`. The
          // server's Bearer-bypass branch hid the regression. Use the
          // canonical helper instead, which handles fetch + caching +
          // refresh-before-expiry.
          try {
            const csrfToken = await getCsrfToken();
            if (csrfToken) {
              headers['x-csrf-token'] = csrfToken;
            }
          } catch {
            // /api/csrf unreachable — proceed without; server enforces.
          }
        }

        const apiResponse = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            userId,
            input: content,
            mode: messageMode,
            sessionId,
            conversationHistory: conversationHistoryRef.current,
          }),
        });

        if (!apiResponse.ok) {
          let errorMessage = 'Failed to process message';
          try {
            const errData = (await apiResponse.json()) as { error?: { message?: string } };
            if (errData?.error?.message) {
              errorMessage = errData.error.message;
            }
          } catch {
            // ignore
          }
          throw new Error(errorMessage);
        }

        const responseData = (await apiResponse.json()) as {
          chatResponse?: string;
          missionId?: string;
          plan?: unknown[];
          agents?: string[];
          // LLM completion response fields
          choices?: Array<{ message?: { content?: string } }>;
        };

        // Extract the assistant text from either response format
        const assistantText =
          responseData.chatResponse ?? responseData.choices?.[0]?.message?.content ?? '';

        // Add user message to conversation history
        conversationHistoryRef.current.push({
          role: 'user',
          content,
        });

        // Add assistant response to conversation history
        if (assistantText) {
          conversationHistoryRef.current.push({
            role: 'assistant',
            content: assistantText,
          });
        }

        toast.success(messageMode === 'mission' ? 'Mission started successfully' : 'Message sent');
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to send message';
        setError(errorMsg);
        toast.error(errorMsg);
      } finally {
        setIsLoading(false);
      }
    },
    [userId, missionMode, sessionId],
  );

  // Switch mode
  const switchMode = useCallback(
    (newMode: 'mission' | 'chat') => {
      setMode(newMode);
      toast.info(
        newMode === 'mission'
          ? 'Switched to Mission Mode - full orchestration'
          : 'Switched to Chat Mode - conversational',
      );
    },
    [setMode],
  );

  // Select agent for collaboration
  const selectAgent = useCallback(
    (agentName: string) => {
      addCollaborativeAgent(agentName);
      toast.success(`${agentName} added to collaboration`);
    },
    [addCollaborativeAgent],
  );

  // Deselect agent
  const deselectAgent = useCallback(
    (agentName: string) => {
      removeCollaborativeAgent(agentName);
      toast.info(`${agentName} removed from collaboration`);
    },
    [removeCollaborativeAgent],
  );

  // Clear messages
  const clearMessages = useCallback(() => {
    reset();
    conversationHistoryRef.current = [];
    toast.success('Messages cleared');
  }, [reset]);

  // Regenerate last response
  const regenerateLastResponse = useCallback(async () => {
    const history = conversationHistoryRef.current;
    if (history.length < 2) {
      toast.error('No message to regenerate');
      return;
    }

    // Get last user message
    const lastUserMessage = history
      .slice()
      .reverse()
      .find((msg) => msg.role === 'user');

    if (!lastUserMessage) {
      toast.error('No user message found');
      return;
    }

    // Remove last assistant message from history
    conversationHistoryRef.current = history.filter(
      (msg, idx) => idx !== history.length - 1 || msg.role !== 'assistant',
    );

    // Resend
    await sendMessage(lastUserMessage.content);
  }, [sendMessage]);

  // Get active agents from activeEmployees Record (plain object, not Map)
  const activeAgentsList = Object.values(activeEmployees).map((employee) => {
    const agentData = availableAgents.find((a) => a.name === employee.name);
    return (
      agentData || {
        name: employee.name,
        description: '',
        tools: [],
        model: 'inherit',
        systemPrompt: '',
      }
    );
  });

  return {
    // State
    messages: missionMessages as unknown as UseMultiAgentChatReturn['messages'],
    isLoading: isLoading || isOrchestrating,
    isStreaming: isOrchestrating,
    error: error || missionError,
    activeAgents: activeAgentsList,
    currentMode: missionMode,

    // Actions
    sendMessage,
    switchMode,
    selectAgent,
    deselectAgent,
    clearMessages,
    regenerateLastResponse,
  };
}

/**
 * Unified Agentic Chat
 *
 * The main container component for the AGI chat interface.
 * Orchestrates:
 * - Message stream and history
 * - Sidecars (Terminal, Browser, etc.)
 * - Input area and command palette
 * - Approval workflows
 * - Layout management (sidebar, main content, sidecar)
 */
import { invoke, listen } from '../../lib/tauri-mock';
import React, { useEffect, useRef } from 'react';

import { useAgenticEvents } from '../../hooks/useAgenticEvents';
import { useSlashCommands } from '../../hooks/useSlashCommands';
import { sha256 } from '../../lib/hash';
import { deriveTaskMetadata } from '../../lib/taskMetadata';
import { useCostStore } from '../../stores/costStore';
import { useModelStore } from '../../stores/modelStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { selectBudget, useTokenBudgetStore } from '../../stores/tokenBudgetStore';
import { useUnifiedChatStore, type SidecarMode, uuidToDbId } from '../../stores/unifiedChatStore';
import { useBillingStore } from '../../stores/billingStore';
import { useCustomInstructionsStore } from '../../stores/customInstructionsStore';
import { useExecutionStore } from '../../stores/executionStore';
import { supabaseAuth } from '../../services/supabaseAuth';
import type { ResearchTask } from '../../types/chat';
import { useSimpleModeStore } from '../../stores/simpleModeStore';
import { formatErrorForChat } from '../../lib/friendlyErrors';
import { AppLayout } from './AppLayout';
import { ApprovalModal } from './ApprovalModal';
import { BudgetAlertsPanel } from './BudgetAlertsPanel';
import { ChatInputArea, type SendOptions } from './ChatInputArea';
import { ChatStream } from './ChatStream';
import { ProjectsView } from './ProjectsView';
import {
  executeTerminalCommand,
  executeBrowserCommand,
  executeCodeCommand,
  executeDatabaseCommand,
} from '../../handlers/slashCommandHandlers';
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const UnifiedAgenticChat: React.FC<{
  className?: string;
  layout?: 'default' | 'compact' | 'immersive';
  defaultSidecarOpen?: boolean;
  onSendMessage?: (content: string, options: SendOptions) => Promise<void>;
  onOpenSettings?: () => void;
}> = ({
  className = '',
  layout = 'default',
  defaultSidecarOpen = true,
  onSendMessage,
  onOpenSettings,
}) => {
  const setSidecarOpen = useUnifiedChatStore((state) => state.setSidecarOpen);
  const openSidecarStore = useUnifiedChatStore((state) => state.openSidecar);
  const addMessage = useUnifiedChatStore((state) => state.addMessage);
  const updateMessage = useUnifiedChatStore((state) => state.updateMessage);
  const setIsLoading = useUnifiedChatStore((state) => state.setIsLoading);
  const setStreamingMessage = useUnifiedChatStore((state) => state.setStreamingMessage);
  const conversationMode = useUnifiedChatStore((state) => state.conversationMode);
  const messages = useUnifiedChatStore((state) => state.messages);
  const activeView = useUnifiedChatStore((state) => state.activeView);

  const llmConfig = useSettingsStore((state) => state.llmConfig);
  const selectedProvider = useModelStore((state) => state.selectedProvider);
  const selectedModel = useModelStore((state) => state.selectedModel);
  const setWorkflowContext = useUnifiedChatStore((state) => state.setWorkflowContext);
  const budget = useTokenBudgetStore(selectBudget);
  const addTokenUsage = useTokenBudgetStore((state) => state.addTokenUsage);
  const loadOverview = useCostStore((state) => state.loadOverview);
  const countedMessageIdsRef = useRef<Set<string>>(new Set());

  const abortControllerRef = useRef<AbortController | null>(null);
  // Ref to store unlisten functions for synchronous cleanup
  const unlistenFnsRef = useRef<Array<() => void>>([]);
  const isMountedRef = useRef(true);

  useAgenticEvents();

  // Initialize slash command parsing
  const { parseSlashCommand } = useSlashCommands();

  useEffect(() => {
    if (!isTauri) return;

    isMountedRef.current = true;
    // Clear any stale unlisten functions from previous render
    unlistenFnsRef.current = [];

    const setupListeners = async () => {
      // Helper to register unlisten functions as promises resolve
      const registerListener = async (listenerPromise: Promise<() => void>) => {
        try {
          const unlisten = await listenerPromise;
          if (isMountedRef.current) {
            unlistenFnsRef.current.push(unlisten);
          } else {
            // Component unmounted while setting up, clean up immediately
            unlisten();
          }
        } catch (error) {
          console.error('[UnifiedAgenticChat] Failed to setup listener:', error);
        }
      };

      registerListener(
        listen<{ conversation_id: number; message_id: string | number; created_at: string }>(
          'chat:stream-start',
          ({ payload }) => {
            if (!isMountedRef.current) return;
            console.log('[UnifiedAgenticChat] Stream started:', payload);

            // Create new AbortController for this streaming session
            // This allows handleStopGeneration to cancel the current stream
            abortControllerRef.current = new AbortController();

            // Stream has started, but we keep isLoading true until stream-end
            // This allows the UI to show streaming state
            useUnifiedChatStore.getState().setIsLoading(true);
          },
        ),
      );

      registerListener(
        listen<{
          conversation_id: number;
          message_id: string | number;
          delta: string;
          content: string;
        }>('chat:stream-chunk', ({ payload }) => {
          const state = useUnifiedChatStore.getState();

          // Validate payload has required fields
          if (!payload.message_id || typeof payload.content !== 'string') {
            console.error('[UnifiedAgenticChat] Invalid stream payload', { payload });
            return;
          }

          // Handle both string (UUID) and number (backend ID) message IDs
          const targetMessageId = String(payload.message_id);

          // First priority: verify message exists with this ID
          const messageExists = state.messages.some((m) => m.id === targetMessageId);

          if (messageExists) {
            state.updateMessage(targetMessageId, {
              content: payload.content,
              metadata: { streaming: true },
            });
          } else {
            // Fallback: use currentStreamingMessageId if available
            const currentStreamingId = state.currentStreamingMessageId;
            if (currentStreamingId && state.messages.some((m) => m.id === currentStreamingId)) {
              state.updateMessage(currentStreamingId, {
                content: payload.content,
                metadata: { streaming: true },
              });
            } else {
              // Last resort fallback (should rarely happen)
              const lastStreaming = state.messages
                .filter((m) => m.role === 'assistant' && m.metadata?.streaming)
                .pop();

              if (lastStreaming) {
                state.updateMessage(lastStreaming.id, {
                  content: payload.content,
                  metadata: { streaming: true },
                });
              } else {
                console.error(
                  '[UnifiedAgenticChat] No streaming message found to update. Payload message_id does not match any existing message.',
                  {
                    payloadMessageId: payload.message_id,
                    currentStreamingId: state.currentStreamingMessageId,
                    availableMessageIds: state.messages.map((m) => m.id),
                  },
                );
              }
            }
          }
        }),
      );

      registerListener(
        listen<{
          conversation_id: number;
          message_id: string | number;
          backend_message_id?: number;
          usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
          credits?: {
            cost_cents: number;
            remaining_cents: number;
            daily_limit?: number;
            daily_used?: number;
            daily_remaining?: number;
            daily_reset_at?: string;
          };
        }>('chat:stream-end', ({ payload }) => {
          const state = useUnifiedChatStore.getState();
          const messageId = String(payload.message_id);
          const currentStreamingId = state.currentStreamingMessageId;

          // Update the message that was streaming
          const targetId = state.messages.some((m) => m.id === messageId)
            ? messageId
            : currentStreamingId;

          if (targetId) {
            state.updateMessage(targetId, {
              metadata: {
                streaming: false,
                tokenCount: payload.usage?.total_tokens,
                cost: payload.credits?.cost_cents ? payload.credits.cost_cents / 100 : undefined, // Convert cents to dollars if needed, or store as is. Metadata usually stores cost in dollars or cents? Existing code used tokens/cost.
              },
            });
          }

          // Update billing store with new credit info
          if (payload.credits) {
            useBillingStore.getState().updateCredits(payload.credits);
            console.log('[UnifiedAgenticChat] Updated credits from stream-end:', payload.credits);
          }

          // Clear the abort controller since streaming completed
          abortControllerRef.current = null;

          state.setIsLoading(false);
          state.setStreamingMessage(null);
        }),
      );

      // Listen for stream errors
      registerListener(
        listen<{ conversation_id: number; message_id: string | number; error: string }>(
          'chat:stream-error',
          ({ payload }) => {
            const state = useUnifiedChatStore.getState();
            const messageId = String(payload.message_id);
            const currentStreamingId = state.currentStreamingMessageId;

            // Update the message that was streaming with error
            const targetId = state.messages.some((m) => m.id === messageId)
              ? messageId
              : currentStreamingId;

            if (targetId) {
              // Use friendly error messages in simple mode
              const isSimpleMode = useSimpleModeStore.getState().mode === 'simple';
              const displayError = isSimpleMode
                ? formatErrorForChat(payload.error, true)
                : `Error: ${payload.error}`;

              state.updateMessage(targetId, {
                content: displayError,
                metadata: { streaming: false },
                error: payload.error,
              });
            }

            // Clear the abort controller since streaming errored
            abortControllerRef.current = null;

            state.setIsLoading(false);
            state.setStreamingMessage(null);
          },
        ),
      );

      // Pending message event listeners
      registerListener(
        listen<{ id: string; content: string; timestamp: string; conversation_id?: number }>(
          'chat:pending-message-added',
          ({ payload }) => {
            console.log('[UnifiedAgenticChat] Pending message added:', payload);
            useUnifiedChatStore.getState().addPendingMessage(payload);
          },
        ),
      );

      registerListener(
        listen<{ message: { id: string; content: string }; remaining: number }>(
          'chat:pending-message-consumed',
          ({ payload }) => {
            console.log('[UnifiedAgenticChat] Pending message consumed:', payload);
            useUnifiedChatStore.getState().removePendingMessage(payload.message.id);
          },
        ),
      );

      registerListener(
        listen<{ count: number }>('chat:pending-messages-cleared', ({ payload }) => {
          console.log('[UnifiedAgenticChat] Pending messages cleared:', payload);
          useUnifiedChatStore.getState().clearPendingMessages();
        }),
      );

      registerListener(
        listen<{
          pending_messages: Array<{ id: string; content: string }>;
          current_tool?: string;
          current_phase?: string;
          count: number;
        }>('chat:pending-context-available', ({ payload }) => {
          console.log(
            '[UnifiedAgenticChat] Pending context available (%s):',
            payload.current_tool || payload.current_phase || 'unknown',
            payload.pending_messages.map((m) => m.content.slice(0, 50)),
          );
          // This event is informational - the AI can use pending messages to adjust behavior
          // The messages are already in the store, so we don't need to do anything here
        }),
      );

      // Listen for pending messages ready to be processed after stream ends
      registerListener(
        listen<{
          conversation_id: number;
          pending_messages: Array<{ id: string; content: string; timestamp: string }>;
          count: number;
        }>('chat:pending-messages-ready', async ({ payload }) => {
          console.log(
            '[UnifiedAgenticChat] Pending messages ready for processing:',
            payload.count,
            'messages',
          );

          // Auto-process pending messages by sending them as follow-up
          // This creates a seamless experience where queued messages are automatically sent
          // Process messages sequentially with delays to avoid race conditions
          for (let i = 0; i < payload.pending_messages.length; i++) {
            const pending = payload.pending_messages[i];
            if (!pending) continue;

            console.log(
              '[UnifiedAgenticChat] Processing pending message:',
              pending.content.slice(0, 50),
            );

            // Remove from pending queue in store
            useUnifiedChatStore.getState().removePendingMessage(pending.id);

            // Clear from backend queue
            try {
              await invoke('chat_pop_pending_message');
            } catch (err) {
              console.error('[UnifiedAgenticChat] Failed to pop pending message:', err);
            }

            // Actually send the pending message as a follow-up
            // Add delay between messages to avoid race conditions
            if (i > 0) {
              await new Promise((resolve) => setTimeout(resolve, 500));
            }

            try {
              // Dispatch a custom event that ChatInputArea listens to for auto-send
              window.dispatchEvent(
                new CustomEvent('chat:auto-send-pending', {
                  detail: { content: pending.content, pendingId: pending.id },
                }),
              );
            } catch (err) {
              console.error('[UnifiedAgenticChat] Failed to send pending message:', err);
            }
          }

          // Notify user that pending messages have been processed
          if (payload.count > 0) {
            console.log(
              '[UnifiedAgenticChat] All pending messages have been queued for processing',
            );
          }
        }),
      );

      // Listen for agent thinking state
      registerListener(
        listen<{ agent_id?: string; thinking: boolean; phase?: string; message?: string }>(
          'agent:thinking',
          ({ payload }) => {
            console.log('[UnifiedAgenticChat] Agent thinking:', payload);
            // Update action trail with thinking status
            if (payload.thinking) {
              useUnifiedChatStore.getState().addActionTrailEntry({
                type: 'thinking',
                message: payload.message || payload.phase || 'Thinking...',
                fadeAfter: 30000, // Fade after 30 seconds if not cleared
              });
            }
          },
        ),
      );

      // Listen for agent finished state
      registerListener(
        listen<{
          agent_id?: string;
          success: boolean;
          result?: string;
          error?: string;
          duration_ms?: number;
        }>('agent:finished', ({ payload }) => {
          console.log('[UnifiedAgenticChat] Agent finished:', payload);
          // Update action trail with completion status
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: payload.success ? 'completed' : 'error',
            message: payload.success
              ? payload.result || 'Task completed successfully'
              : payload.error || 'Task failed',
            fadeAfter: 5000, // Fade after 5 seconds
            metadata: { duration_ms: payload.duration_ms },
          });

          // Clear any running agent status
          const currentAgent = useUnifiedChatStore.getState().agentStatus;
          if (currentAgent && (!payload.agent_id || currentAgent.id === payload.agent_id)) {
            useUnifiedChatStore.getState().setAgentStatus({
              ...currentAgent,
              status: payload.success ? 'completed' : 'failed',
              completedAt: new Date(),
              error: payload.error,
            });
          }
        }),
      );

      // Deep Research event listeners
      registerListener(
        listen<{
          task_id: string;
          step_id: string;
          step_index: number;
          description: string;
        }>('research:step_started', ({ payload }) => {
          console.log('[UnifiedAgenticChat] Research step started:', payload);
          const executionStore = useExecutionStore.getState();
          const task = executionStore.researchTasks[payload.task_id];
          if (task) {
            // Update the step status
            const updatedSteps = task.steps.map((step, index) => {
              if (index === payload.step_index || step.id === payload.step_id) {
                return { ...step, status: 'running' as const, timestamp: Date.now() };
              }
              return step;
            });
            executionStore.updateResearchTask(payload.task_id, {
              steps: updatedSteps,
              progress: Math.round((payload.step_index / task.steps.length) * 100),
            });
          }
        }),
      );

      registerListener(
        listen<{
          task_id: string;
          step_id: string;
          step_index: number;
          success: boolean;
          details?: string;
        }>('research:step_completed', ({ payload }) => {
          console.log('[UnifiedAgenticChat] Research step completed:', payload);
          const executionStore = useExecutionStore.getState();
          const task = executionStore.researchTasks[payload.task_id];
          if (task) {
            const updatedSteps = task.steps.map((step, index) => {
              if (index === payload.step_index || step.id === payload.step_id) {
                return {
                  ...step,
                  status: payload.success ? ('completed' as const) : ('failed' as const),
                  details: payload.details,
                };
              }
              return step;
            });
            const completedCount = updatedSteps.filter((s) => s.status === 'completed').length;
            executionStore.updateResearchTask(payload.task_id, {
              steps: updatedSteps,
              progress: Math.round((completedCount / task.steps.length) * 100),
            });
          }
        }),
      );

      registerListener(
        listen<{
          task_id: string;
          finding: string;
        }>('research:finding_added', ({ payload }) => {
          console.log('[UnifiedAgenticChat] Research finding added:', payload);
          const executionStore = useExecutionStore.getState();
          const task = executionStore.researchTasks[payload.task_id];
          if (task) {
            executionStore.updateResearchTask(payload.task_id, {
              findings: [...task.findings, payload.finding],
            });
          }
        }),
      );

      registerListener(
        listen<{
          task_id: string;
          source: { title: string; url: string; domain?: string };
        }>('research:source_added', ({ payload }) => {
          console.log('[UnifiedAgenticChat] Research source added:', payload);
          const executionStore = useExecutionStore.getState();
          const task = executionStore.researchTasks[payload.task_id];
          if (task) {
            executionStore.updateResearchTask(payload.task_id, {
              sources: [...task.sources, payload.source],
            });
          }
        }),
      );

      registerListener(
        listen<{
          task_id: string;
          success: boolean;
          time_elapsed?: string;
        }>('research:completed', ({ payload }) => {
          console.log('[UnifiedAgenticChat] Research completed:', payload);
          const executionStore = useExecutionStore.getState();
          const task = executionStore.researchTasks[payload.task_id];
          if (task) {
            const updatedSteps = task.steps.map((step) => ({
              ...step,
              status: payload.success ? ('completed' as const) : step.status,
            }));
            executionStore.updateResearchTask(payload.task_id, {
              status: payload.success ? 'completed' : 'failed',
              progress: 100,
              steps: updatedSteps,
              timeElapsed: payload.time_elapsed,
            });
          }
        }),
      );

      registerListener(
        listen<{
          task_id: string;
          time_elapsed: string;
        }>('research:progress', ({ payload }) => {
          const executionStore = useExecutionStore.getState();
          const task = executionStore.researchTasks[payload.task_id];
          if (task) {
            executionStore.updateResearchTask(payload.task_id, {
              timeElapsed: payload.time_elapsed,
            });
          }
        }),
      );
    };

    // Start setting up listeners
    setupListeners().catch((error) => {
      console.error('[UnifiedAgenticChat] Failed to setup listeners:', error);
    });

    return () => {
      // Mark as unmounted first to prevent new registrations
      isMountedRef.current = false;
      // Synchronously clean up all registered listeners
      unlistenFnsRef.current.forEach((unlisten) => {
        try {
          unlisten();
        } catch (error) {
          console.error('[UnifiedAgenticChat] Error during listener cleanup:', error);
        }
      });
      unlistenFnsRef.current = [];
    };
  }, [updateMessage, setStreamingMessage]);

  useEffect(() => {
    if (defaultSidecarOpen === false) {
      setSidecarOpen(false);
    }
  }, [defaultSidecarOpen, setSidecarOpen]);

  useEffect(() => {
    if (!budget.enabled) return;
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;
    const messageId = String(lastMessage.id ?? crypto.randomUUID());
    if (countedMessageIdsRef.current.has(messageId)) {
      return;
    }
    const tokens =
      lastMessage.metadata?.tokenCount ?? Math.ceil((lastMessage.content?.length ?? 0) * 0.25);
    addTokenUsage(tokens);
    countedMessageIdsRef.current.add(messageId);
  }, [messages, budget.enabled, addTokenUsage]);

  const fallbackProvider = llmConfig.defaultProvider;
  const providerForMessage = selectedProvider ?? fallbackProvider ?? undefined;
  // For subscription-only model, defaultModels only has managed_cloud and ollama
  const defaultModels = llmConfig.defaultModels as Record<string, string>;
  const fallbackModelForProvider =
    providerForMessage && llmConfig.defaultModels
      ? (defaultModels[providerForMessage] ?? 'auto')
      : undefined;
  const modelForMessage = selectedModel ?? fallbackModelForProvider ?? undefined;

  useEffect(() => {
    void loadOverview().catch((err) =>
      console.error('[UnifiedAgenticChat] Failed to load cost overview', err),
    );
  }, [loadOverview]);

  // Validate slash command arguments for safety
  const validateSlashCommandArgs = (command: string, args: string): boolean => {
    // Maximum argument length
    const MAX_ARGS_LENGTH = 2000;
    if (args.length > MAX_ARGS_LENGTH) {
      return false;
    }

    switch (command) {
      case 'terminal':
        // Terminal commands shouldn't contain shell metacharacters in certain positions
        if (/[;|&`$(){}[\]\\]/.test(args) && /\b(rm|del|format|shutdown|poweroff)\b/i.test(args)) {
          return false; // Reject dangerous combinations
        }
        break;

      case 'browser':
        // Browser URLs should be relatively safe but check for injection
        if (args.includes('\n') || args.includes('\r')) {
          return false; // No newlines in URLs
        }
        break;

      case 'code':
        // Code arguments should not be excessively large (prevent memory issues)
        if (args.length > 5000) {
          return false;
        }
        break;

      case 'database':
        // Database queries should not be excessively long
        if (args.length > 3000) {
          return false;
        }
        break;
    }

    return true;
  };

  const handleSendMessage = async (content: string, options: SendOptions) => {
    // Handle slash commands
    const slashCommand = parseSlashCommand(content);

    if (slashCommand) {
      // Validate command arguments first
      if (!validateSlashCommandArgs(slashCommand.command, slashCommand.args)) {
        const userMessageId = addMessage({
          role: 'user',
          content: slashCommand.rawInput,
          slashCommand,
          inlinePanels: [],
        });

        updateMessage(userMessageId, {
          content: `Error: Invalid or suspicious arguments for /${slashCommand.command}. Arguments may be too long or contain dangerous patterns.`,
          metadata: { streaming: false },
        });
        return;
      }

      // Create user message with slash command metadata
      const userMessageId = addMessage({
        role: 'user',
        content: slashCommand.rawInput,
        slashCommand,
        inlinePanels: [],
      });

      try {
        // Execute the appropriate command handler
        let panel;
        switch (slashCommand.command) {
          case 'browser':
            panel = await executeBrowserCommand(slashCommand.args);
            break;
          case 'terminal':
            panel = await executeTerminalCommand(slashCommand.args);
            break;
          case 'code':
            panel = await executeCodeCommand(slashCommand.args);
            break;
          case 'database':
            panel = await executeDatabaseCommand(slashCommand.args);
            break;
          default:
            throw new Error(`Unknown command: ${slashCommand.command}`);
        }

        // Add the inline panel to the message
        useUnifiedChatStore.getState().addInlinePanel(userMessageId, panel);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        updateMessage(userMessageId, {
          error: errorMessage,
        });
      }
      return;
    }

    const editingMessageId = useUnifiedChatStore.getState().editingMessageId;
    if (editingMessageId) {
      const currentMessages = useUnifiedChatStore.getState().messages;
      const editIndex = currentMessages.findIndex((m) => m.id === editingMessageId);
      if (editIndex !== -1) {
        const newMessages = currentMessages.slice(0, editIndex);
        useUnifiedChatStore.setState({ messages: newMessages });
      }

      useUnifiedChatStore.getState().cancelEditing();
    }

    const classifyTask = (
      text: string,
    ): 'search' | 'code' | 'docs' | 'chat' | 'vision' | 'image' | 'video' => {
      const lc = text.toLowerCase();
      if (
        lc.includes('search') ||
        lc.includes('browse') ||
        lc.includes('find news') ||
        lc.includes('look up')
      ) {
        return 'search';
      }
      if (lc.includes('image') || lc.includes('logo') || lc.includes('picture')) {
        return 'image';
      }
      if (lc.includes('video') || lc.includes('render') || lc.includes('clip')) {
        return 'video';
      }
      if (lc.includes('vision') || lc.includes('screenshot')) {
        return 'vision';
      }
      if (lc.includes('pdf') || lc.includes('doc') || lc.includes('document')) {
        return 'docs';
      }
      if (
        lc.includes('code') ||
        lc.includes('bug') ||
        lc.includes('compile') ||
        lc.includes('function') ||
        lc.includes('test') ||
        lc.includes('git') ||
        lc.includes('build')
      ) {
        return 'code';
      }
      return 'chat';
    };

    const applyRouting = (): { providerId?: string; modelId?: string } => {
      const task = classifyTask(content);
      const routing = llmConfig.taskRouting?.[task];
      if (routing) {
        return { providerId: routing.provider, modelId: routing.model };
      }
      return {};
    };

    if (conversationMode === 'safe') {
      // Dangerous command patterns - using word boundaries to prevent simple bypasses
      const dangerousCommandPatterns = [
        /\b(rm|del|erase|format|diskpart|fdisk|wipe)\b/i,
        /\b(shutdown|poweroff|reboot|halt)\b/i,
        /(disable|disallow|stop|kill)\s+(antivirus|firewall|defender|av)/i,
        /\b(registry\s+delete|regedit|reg\s+delete)\b/i,
        /taskkill\s+\/f/i,
        /\b(dd|shred)\b.*if=/i,
      ];

      // Shell operators and redirection that could be dangerous with command injection
      const dangerousOperatorPatterns = [/[;&|`$(){}[\]\\]/];

      // Prompt injection patterns
      const promptInjectionPatterns = [
        /ignore\s+(previous\s+)?instructions/i,
        /override\s+(system\s+)?prompt/i,
        /system\s+prompt|system\s+message/i,
        /forget\s+(everything|previous)/i,
        /roleplay\s+as\s+(?!the assistant)/i,
      ];

      const lower = content.toLowerCase();
      let riskLevel: 'low' | 'medium' | 'high' = 'low';
      let matchedRisk: string | null = null;

      // Check for dangerous commands (high risk)
      for (const pattern of dangerousCommandPatterns) {
        if (pattern.test(lower)) {
          riskLevel = 'high';
          matchedRisk = pattern.source;
          break;
        }
      }

      // Check for prompt injection (medium risk)
      if (riskLevel === 'low') {
        for (const pattern of promptInjectionPatterns) {
          if (pattern.test(lower)) {
            riskLevel = 'medium';
            matchedRisk = pattern.source;
            break;
          }
        }
      }

      // Check for shell operators combined with commands (medium risk)
      if (riskLevel === 'low' && dangerousOperatorPatterns[0]!.test(content)) {
        if (/\b(execute|run|system|shell|cmd|command|bash|sh|powershell)\b/i.test(lower)) {
          riskLevel = 'medium';
          matchedRisk = 'Shell operators with execution keywords';
        }
      }

      if (riskLevel !== 'low') {
        const riskMessage =
          riskLevel === 'high'
            ? `This request contains a HIGH-RISK instruction that could cause system damage: ${matchedRisk}. This is not recommended.`
            : `This request may contain a potential security risk: ${matchedRisk}. Proceed with caution.`;

        const confirmed = window.confirm(`${riskMessage}\n\nProceed anyway?`);
        if (!confirmed) {
          return;
        }
      }
    }

    const routingOverrides = applyRouting();

    const isAutoMode =
      options.modelOverride === 'auto' ||
      routingOverrides.modelId === 'auto' ||
      modelForMessage === 'auto';

    const enrichedOptions: SendOptions = {
      ...options,
      providerOverride:
        options.providerOverride ||
        (isAutoMode
          ? undefined
          : (routingOverrides.providerId ?? providerForMessage ?? llmConfig.defaultProvider)),
      modelOverride: isAutoMode
        ? undefined
        : (options.modelOverride ??
          routingOverrides.modelId ??
          modelForMessage ??
          defaultModels[llmConfig.defaultProvider] ??
          'auto'),
    };

    const entryPoint = content.trim();
    const workflowHash = await sha256(entryPoint || crypto.randomUUID());
    setWorkflowContext({
      hash: workflowHash,
      description: entryPoint,
      entryPoint,
    });
    if (isTauri) {
      try {
        await invoke('agent_set_workflow_hash', { workflow_hash: workflowHash });
      } catch (error) {
        console.error('[UnifiedAgenticChat] Failed to set workflow hash', error);
      }
    }

    const taskMetadata = deriveTaskMetadata(entryPoint, enrichedOptions.attachments);

    addMessage({ role: 'user', content, attachments: enrichedOptions.attachments });

    // Handle deep-research focus mode: create research task and set special metadata
    const isDeepResearchMode = enrichedOptions.focusMode === 'deep-research';
    let researchTaskId: string | undefined;

    if (isDeepResearchMode) {
      // Generate a unique task ID for the research task
      researchTaskId = `research-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      // Create initial research task in ExecutionStore
      const initialResearchTask: ResearchTask = {
        id: researchTaskId,
        query: content,
        progress: 0,
        status: 'running',
        steps: [
          {
            id: `${researchTaskId}-step-1`,
            description: 'Analyzing query and planning research strategy',
            status: 'running',
            timestamp: Date.now(),
          },
          {
            id: `${researchTaskId}-step-2`,
            description: 'Searching for relevant sources',
            status: 'pending',
          },
          {
            id: `${researchTaskId}-step-3`,
            description: 'Extracting key information',
            status: 'pending',
          },
          {
            id: `${researchTaskId}-step-4`,
            description: 'Synthesizing findings',
            status: 'pending',
          },
          {
            id: `${researchTaskId}-step-5`,
            description: 'Compiling final report',
            status: 'pending',
          },
        ],
        findings: [],
        sources: [],
        timeElapsed: '0s',
      };

      useExecutionStore.getState().addResearchTask(initialResearchTask);
    }

    // Create assistant message with deep-research metadata if applicable
    const assistantMessageId = addMessage({
      role: 'assistant',
      content: isDeepResearchMode ? '' : '',
      metadata: {
        streaming: true,
        ...(isDeepResearchMode && {
          type: 'deep-research-task',
          taskId: researchTaskId,
        }),
      },
    });

    setIsLoading(true);
    setStreamingMessage(assistantMessageId);

    try {
      if (onSendMessage) {
        await onSendMessage(content, enrichedOptions);
      } else {
        // Resolve conversation ID for stateful chat
        const activeConversationId = useUnifiedChatStore.getState().activeConversationId;
        const conversationDbId = activeConversationId
          ? uuidToDbId(activeConversationId)
          : undefined;

        // All LLM requests use cloud credits from subscription (except Ollama local)
        // For streaming mode, we pass the frontend message ID and don't wait for the response
        // Events will handle all updates
        const userId = supabaseAuth.getUser()?.id;
        if (!userId) {
          throw new Error('User not authenticated');
        }

        // Get merged custom instructions (project > conversation > global)
        const conversationInstructions = useUnifiedChatStore
          .getState()
          .getConversationCustomInstructions(activeConversationId ?? undefined);
        const mergedCustomInstructions = useCustomInstructionsStore
          .getState()
          .getMergedInstructions(conversationInstructions);

        const response = await invoke<any>('chat_send_message', {
          request: {
            content,
            userId,
            conversation_id: conversationDbId,
            attachments: enrichedOptions.attachments?.map((att) => ({
              id: att.id,
              type: att.type,
              name: att.name,
              mimeType: att.mimeType,
              content: att.content,
            })),
            providerOverride: enrichedOptions.providerOverride,
            modelOverride: enrichedOptions.modelOverride,
            focusMode: enrichedOptions.focusMode,
            stream: true,
            enableTools: true,
            conversationMode,
            taskMetadata,
            thinkingMode: useModelStore.getState().thinkingModeEnabled,
            preferCloudCredits: true,
            frontendMessageId: assistantMessageId, // Pass frontend message ID for event coordination
            customInstructions: mergedCustomInstructions || undefined, // Include merged custom instructions
            // Pass research task ID for deep research mode
            researchTaskId: isDeepResearchMode ? researchTaskId : undefined,
          },
        });

        // Link backend ID to frontend UUID (if conversation was created)
        if (response.conversation?.id && activeConversationId) {
          useUnifiedChatStore
            .getState()
            .linkConversationId(activeConversationId, response.conversation.id);
        }

        // For streaming mode, we don't update from the response
        // All updates come from events (chat:stream-chunk, chat:stream-end, etc.)
        // The response is just an acknowledgment that streaming started
        // setIsLoading will be set to false by the chat:stream-end event handler

        // However, for non-streaming fallback or future mixed modes, we check for credits here too
        if (response.credits) {
          console.log('[UnifiedAgenticChat] Updated credits from response:', response.credits);
          useBillingStore.getState().updateCredits(response.credits);
        }
      }
    } catch (error) {
      console.error('[UnifiedAgenticChat] Error sending message:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isSimpleMode = useSimpleModeStore.getState().mode === 'simple';

      // In simple mode, use friendly error messages
      if (isSimpleMode) {
        const userMessage = formatErrorForChat(errorMessage, true);
        updateMessage(assistantMessageId, {
          content: userMessage,
          metadata: { streaming: false },
          error: errorMessage,
        });
      } else {
        // Parse backend standardized error codes for advanced mode
        let userMessage = `Error: ${errorMessage}`;

        if (errorMessage.includes('[ERR_BILLING_QUOTA]')) {
          const detail =
            errorMessage.split('[ERR_BILLING_QUOTA]')[1]?.trim() || 'Insufficient credits.';
          userMessage = `⚠️ **Payment Required**\n\n${detail}\n\nPlease check your plan limits in the Settings or upgrade to continue.`;
        } else if (errorMessage.includes('[ERR_AUTH_INVALID]')) {
          userMessage = `🔒 **Authentication Failed**\n\nWe couldn't verify your credentials. Please sign out and sign in again to refresh your session.`;
        } else if (errorMessage.includes('[ERR_RATE_LIMIT]')) {
          userMessage = `⏳ **Rate Limit Exceeded**\n\nYou are sending requests too quickly. Please wait a moment before trying again.`;
        } else if (errorMessage.includes('[ERR_NETWORK_TIMEOUT]')) {
          userMessage = `📡 **Network Timeout**\n\nThe request to the AI models timed out. Please check your connection and try again.`;
        } else if (errorMessage.includes('[ERR_PROVIDER_ERROR]')) {
          const detail =
            errorMessage.split('[ERR_PROVIDER_ERROR]')[1]?.trim() || 'Unknown provider error.';
          userMessage = `❌ **Provider Error**\n\n${detail}`;
        } else {
          // Legacy fallback
          if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
            userMessage +=
              '\n\nAuthentication failed. Please check your subscription status or contact support if the issue persists.';
          } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
            userMessage += "\n\nYou've hit a rate limit. Please try again in a few moments.";
          } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
            userMessage +=
              '\n\nThe request timed out. Please check your internet connection and try again.';
          } else if (errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED')) {
            userMessage += '\n\nNetwork error. Please check your internet connection.';
          } else if (errorMessage.includes('invalid') || errorMessage.includes('validation')) {
            userMessage +=
              '\n\nThe request was invalid. This may be due to unsupported content or format.';
          } else {
            userMessage +=
              '\n\nPlease check your internet connection and try again. If the issue persists, contact support.';
          }
        }

        updateMessage(assistantMessageId, {
          content: userMessage,
          metadata: { streaming: false },
          error: errorMessage,
        });
      }
    } finally {
      setIsLoading(false);
      setStreamingMessage(null);
    }
  };

  const layoutClasses = {
    default: '',
    compact: '',
    immersive: '',
  };

  const handleStopGeneration = async () => {
    console.log('[UnifiedAgenticChat] Stopping generation...');

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (isTauri) {
      try {
        await invoke('chat_stop_generation');
      } catch (error) {
        console.warn('[UnifiedAgenticChat] Failed to stop generation:', error);
      }
    }

    const currentStreamingId = useUnifiedChatStore.getState().currentStreamingMessageId;
    if (currentStreamingId) {
      updateMessage(currentStreamingId, {
        metadata: { streaming: false },
      });
    }

    setIsLoading(false);
    setStreamingMessage(null);
  };

  const openSidecar = (panel: SidecarMode, payload?: Record<string, unknown>) => {
    openSidecarStore(panel, payload?.['contextId'] as string | undefined, payload);
  };

  return (
    <div
      className={`unified-agentic-chat relative flex h-full min-h-0 flex-col overflow-hidden bg-[#05060b] ${layoutClasses[layout]} ${className}`}
    >
      <AppLayout onOpenSettings={onOpenSettings}>
        {activeView === 'chat' ? (
          <>
            <BudgetAlertsPanel />
            <ChatStream
              onOpenSidecar={openSidecar}
              onSuggestionClick={(prompt) => {
                useUnifiedChatStore.getState().setDraftContent(prompt + ' ');
              }}
            />
            <ChatInputArea onSend={handleSendMessage} onStopGeneration={handleStopGeneration} />
          </>
        ) : activeView === 'projects' ? (
          <ProjectsView />
        ) : null}
      </AppLayout>

      <ApprovalModal />
    </div>
  );
};

export default UnifiedAgenticChat;

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
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import React, { useEffect, useRef } from 'react';

import { useAgenticEvents } from '../../hooks/useAgenticEvents';
import { useSlashCommands } from '../../hooks/useSlashCommands';
import { sha256 } from '../../lib/hash';
import { deriveTaskMetadata } from '../../lib/taskMetadata';
import { useCostStore } from '../../stores/costStore';
import { useModelStore } from '../../stores/modelStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { selectBudget, useTokenBudgetStore } from '../../stores/tokenBudgetStore';
import { useUnifiedChatStore, type SidecarMode } from '../../stores/unifiedChatStore';
import { useUsageStore } from '../../stores/usageStore';
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
const isTauri = !!(window as any).__TAURI_INTERNALS__;

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
  const { loadOverview } = useCostStore();
  const countedMessageIdsRef = useRef<Set<string>>(new Set());

  const abortControllerRef = useRef<AbortController | null>(null);

  useAgenticEvents();

  // Initialize slash command parsing
  const { parseSlashCommand } = useSlashCommands();

  useEffect(() => {
    if (!isTauri) return;

    const unlistenPromises: Promise<() => void>[] = [];

    unlistenPromises.push(
      listen<{ conversation_id: number; message_id: number; created_at: string }>(
        'chat:stream-start',
        ({ payload }) => {
          console.log('[UnifiedAgenticChat] Stream started:', payload);

          useUnifiedChatStore.getState().setIsLoading(false);
        },
      ),
    );

    unlistenPromises.push(
      listen<{ conversation_id: number; message_id: number; delta: string; content: string }>(
        'chat:stream-chunk',
        ({ payload }) => {
          const state = useUnifiedChatStore.getState();

          // Validate payload has required fields
          if (!payload.message_id || typeof payload.content !== 'string') {
            console.error('[UnifiedAgenticChat] Invalid stream payload', { payload });
            return;
          }

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
        },
      ),
    );

    unlistenPromises.push(
      listen<{ conversation_id: number; message_id: number }>(
        'chat:stream-end',
        ({ payload: _payload }) => {
          const state = useUnifiedChatStore.getState();
          const currentStreamingId = state.currentStreamingMessageId;

          if (currentStreamingId) {
            state.updateMessage(currentStreamingId, {
              metadata: { streaming: false },
            });
          }

          state.setIsLoading(false);
          state.setStreamingMessage(null);
        },
      ),
    );

    return () => {
      Promise.all(unlistenPromises).then((unlisteners) => {
        unlisteners.forEach((unlisten) => unlisten());
      });
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
  const fallbackModelForProvider =
    providerForMessage && llmConfig.defaultModels
      ? llmConfig.defaultModels[providerForMessage]
      : undefined;
  const modelForMessage = selectedModel ?? fallbackModelForProvider ?? undefined;

  useEffect(() => {
    void loadOverview().catch((err) =>
      console.error('[UnifiedAgenticChat] Failed to load cost overview', err),
    );
  }, [loadOverview]);

  const handleSendMessage = async (content: string, options: SendOptions) => {
    // Handle slash commands
    const slashCommand = parseSlashCommand(content);

    if (slashCommand) {
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
      providerOverride: isAutoMode
        ? undefined
        : (options.providerOverride ??
          routingOverrides.providerId ??
          providerForMessage ??
          llmConfig.defaultProvider),
      modelOverride: isAutoMode
        ? undefined
        : (options.modelOverride ??
          routingOverrides.modelId ??
          modelForMessage ??
          llmConfig.defaultModels[llmConfig.defaultProvider] ??
          'gpt-5.1'),
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

    const assistantMessageId = addMessage({
      role: 'assistant',
      content: '',
      metadata: { streaming: true },
    });

    setIsLoading(true);
    setStreamingMessage(assistantMessageId);

    try {
      if (onSendMessage) {
        await onSendMessage(content, enrichedOptions);
      } else {
        // All LLM requests use cloud credits from subscription (except Ollama local)
        const response = await invoke<any>('chat_send_message', {
          request: {
            content,
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
          },
        });

        setIsLoading(false);

        if (response.assistant_message?.content) {
          updateMessage(assistantMessageId, {
            content: response.assistant_message.content,
            artifacts: response.assistant_message.artifacts,
            metadata: {
              streaming: false,
              model: response.assistant_message.model,
              provider: response.assistant_message.provider,
              tokenCount: response.assistant_message.tokens,
              cost: response.assistant_message.cost,
              artifacts: response.assistant_message.artifacts,
            },
          });

          const usageStore = useUsageStore.getState();
          const modelId = response.assistant_message.model;
          const provider = response.assistant_message.provider;

          const inputTokens = response.user_message?.tokens || Math.ceil(content.length / 4);
          const outputTokens = response.assistant_message?.tokens || 0;

          void usageStore
            .trackLLMUsageDetailed({
              modelId,
              provider,
              inputTokens,
              outputTokens,
            })
            .catch((err) => console.error('[UnifiedAgenticChat] Failed to track usage:', err));
        }
      }
    } catch (error) {
      console.error('[UnifiedAgenticChat] Error sending message:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Generate contextual error message based on error type
      let userMessage = `Error: ${errorMessage}`;
      if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
        userMessage +=
          '\n\nYour API credentials may have expired or are invalid. Please check your API key in Settings > API Keys.';
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
          '\n\nPlease check your API configuration in Settings > API Keys and try again.';
      }

      updateMessage(assistantMessageId, {
        content: userMessage,
        metadata: { streaming: false },
        error: errorMessage,
      });
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

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Layers, Square } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useAgenticEvents } from '../../hooks/useAgenticEvents';
import { sha256 } from '../../lib/hash';
import { deriveTaskMetadata } from '../../lib/taskMetadata';
import { isTauri } from '../../lib/tauri-mock';
import { useCostStore } from '../../stores/costStore';
import { useModelStore } from '../../stores/modelStore';
import { useSettingsStore, type Provider } from '../../stores/settingsStore';
import { selectBudget, useTokenBudgetStore } from '../../stores/tokenBudgetStore';
import { useUnifiedChatStore, type SidecarMode } from '../../stores/unifiedChatStore';
import { TerminalWorkspace } from '../Terminal/TerminalWorkspace';
import { Button } from '../ui/Button';
import { AppLayout } from './AppLayout';
import { ApprovalModal } from './ApprovalModal';
import { BudgetAlertsPanel } from './BudgetAlertsPanel';
import { ChatInputArea, type SendOptions } from './ChatInputArea';
import { ChatStream } from './ChatStream';
import { type DynamicPanelType } from './DynamicSidecar';
import { MediaLab } from './MediaLab';

export const UnifiedAgenticChat: React.FC<{
  className?: string;
  layout?: 'default' | 'compact' | 'immersive';
  defaultSidecarOpen?: boolean;
  onSendMessage?: (content: string, options: SendOptions) => Promise<void>;
  onOpenSettings?: () => void;
  onOpenBilling?: () => void;
}> = ({
  className = '',
  layout = 'default',
  defaultSidecarOpen = true,
  onSendMessage,
  onOpenSettings,
  onOpenBilling,
}) => {
  const setSidecarOpen = useUnifiedChatStore((state) => state.setSidecarOpen);
  const openSidecarStore = useUnifiedChatStore((state) => state.openSidecar);
  const addMessage = useUnifiedChatStore((state) => state.addMessage);
  const updateMessage = useUnifiedChatStore((state) => state.updateMessage);
  const setStreamingMessage = useUnifiedChatStore((state) => state.setStreamingMessage);
  const conversationMode = useUnifiedChatStore((state) => state.conversationMode);
  const messages = useUnifiedChatStore((state) => state.messages);
  // const streamingMessageId = useUnifiedChatStore((state) => state.currentStreamingMessageId); // Unused for now

  const llmConfig = useSettingsStore((state) => state.llmConfig);
  const selectedProvider = useModelStore((state) => state.selectedProvider);
  const selectedModel = useModelStore((state) => state.selectedModel);
  const setWorkflowContext = useUnifiedChatStore((state) => state.setWorkflowContext);
  const budget = useTokenBudgetStore(selectBudget);
  const addTokenUsage = useTokenBudgetStore((state) => state.addTokenUsage);
  const { loadOverview } = useCostStore();
  const countedMessageIdsRef = useRef<Set<string>>(new Set());

  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [mediaLabOpen, setMediaLabOpen] = useState(false);

  const _tokenStats = useMemo(() => {
    let input = 0;
    let output = 0;
    let cost = 0;

    messages.forEach((msg) => {
      const estimatedTokens =
        msg.metadata?.tokenCount ?? Math.ceil((msg.content?.length ?? 0) * 0.25);
      if (msg.role === 'assistant') {
        output += estimatedTokens;
        cost += msg.metadata?.cost ?? 0;
      } else if (msg.role === 'user') {
        input += estimatedTokens;
      }
    });

    return { input, output, cost };
  }, [messages]);

  void _tokenStats;

  useAgenticEvents();

  // Listen to chat streaming events
  useEffect(() => {
    if (!isTauri) return;

    const unlistenPromises: Promise<() => void>[] = [];

    // Listen for stream start
    unlistenPromises.push(
      listen<{ conversation_id: number; message_id: number; created_at: string }>(
        'chat:stream-start',
        ({ payload }) => {
          // Stream started - message is already created
          console.log('[UnifiedAgenticChat] Stream started:', payload);
        },
      ),
    );

    // Listen for stream chunks
    unlistenPromises.push(
      listen<{ conversation_id: number; message_id: number; delta: string; content: string }>(
        'chat:stream-chunk',
        ({ payload }) => {
          // Backend uses numeric IDs, but we use UUIDs
          // Find the currently streaming message and update it
          const currentStreamingId = useUnifiedChatStore.getState().currentStreamingMessageId;
          if (currentStreamingId) {
            useUnifiedChatStore.getState().updateMessage(currentStreamingId, {
              content: payload.content,
              metadata: { streaming: true },
            });
          } else {
            // Fallback: find the last assistant message that's streaming
            const allMessages = useUnifiedChatStore.getState().messages;
            const lastStreaming = allMessages
              .filter((m) => m.role === 'assistant' && m.metadata?.streaming)
              .pop();
            if (lastStreaming) {
              useUnifiedChatStore.getState().updateMessage(lastStreaming.id, {
                content: payload.content,
                metadata: { streaming: true },
              });
            }
          }
        },
      ),
    );

    // Listen for stream end
    unlistenPromises.push(
      listen<{ conversation_id: number; message_id: number }>(
        'chat:stream-end',
        ({ payload: _payload }) => {
          const currentStreamingId = useUnifiedChatStore.getState().currentStreamingMessageId;
          if (currentStreamingId) {
            useUnifiedChatStore.getState().updateMessage(currentStreamingId, {
              metadata: { streaming: false },
            });
          }
          useUnifiedChatStore.getState().setStreamingMessage(null);
        },
      ),
    );

    // Cleanup listeners on unmount
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
      const riskyPatterns = [
        'rm -rf',
        'format c:',
        'shutdown',
        'del /f /s /q',
        'poweroff',
        'wipe',
        'disable antivirus',
        'registry delete',
        'ignore previous instructions',
        'system prompt',
      ];
      const lower = content.toLowerCase();
      const matched = riskyPatterns.find((p) => lower.includes(p));
      if (matched) {
        const confirmed = window.confirm(
          `This request contains a risky instruction ("${matched}"). Proceed anyway?`,
        );
        if (!confirmed) {
          return;
        }
      }
    }

    const routingOverrides = applyRouting();

    const enrichedOptions: SendOptions = {
      ...options,
      providerOverride:
        options.providerOverride ??
        routingOverrides.providerId ??
        providerForMessage ??
        llmConfig.defaultProvider,
      modelOverride:
        options.modelOverride ??
        routingOverrides.modelId ??
        modelForMessage ??
        llmConfig.defaultModels[llmConfig.defaultProvider] ??
        'gpt-5.1',
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

    // Ensure provider is configured with API key before sending
    if (
      isTauri &&
      enrichedOptions.providerOverride &&
      enrichedOptions.providerOverride !== 'ollama'
    ) {
      try {
        const { getAPIKey } = useSettingsStore.getState();
        const apiKey = await getAPIKey(enrichedOptions.providerOverride as Provider);
        if (apiKey && apiKey.trim()) {
          await invoke('llm_configure_provider', {
            provider: enrichedOptions.providerOverride,
            apiKey: apiKey.trim(),
            baseUrl: null,
          });
        }
      } catch (error) {
        console.warn('[UnifiedAgenticChat] Failed to configure provider before sending:', error);
        // Continue anyway - the backend will handle the error
      }
    }

    addMessage({ role: 'user', content, attachments: enrichedOptions.attachments });

    const assistantMessageId = addMessage({
      role: 'assistant',
      content: '',
      metadata: { streaming: true },
    });
    setStreamingMessage(assistantMessageId);

    try {
      if (onSendMessage) {
        await onSendMessage(content, enrichedOptions);
      } else {
        // Enable streaming for better UX
        const response = await invoke<any>('chat_send_message', {
          request: {
            content,
            providerOverride: enrichedOptions.providerOverride,
            modelOverride: enrichedOptions.modelOverride,
            focusMode: enrichedOptions.focusMode,
            stream: true, // Enable streaming
            enableTools: true,
            conversationMode,
            workflowHash,
            taskMetadata,
          },
        });

        // For streaming mode, content will be updated via events
        // For non-streaming mode, update directly
        if (response.assistant_message?.content) {
          updateMessage(assistantMessageId, {
            content: response.assistant_message.content,
            metadata: {
              streaming: false,
              model: response.assistant_message.model,
              provider: response.assistant_message.provider,
              tokenCount: response.assistant_message.tokens,
              cost: response.assistant_message.cost,
            },
          });
        }
        // If streaming, the events will handle the content updates
      }
    } catch (error) {
      console.error('[UnifiedAgenticChat] Error sending message:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      updateMessage(assistantMessageId, {
        content: `Error: ${errorMessage}. Please check your API key in Settings > API Keys.`,
        metadata: { streaming: false },
        error: errorMessage,
      });
    } finally {
      setStreamingMessage(null);
    }
  };

  const layoutClasses = {
    default: '',
    compact: '',
    immersive: '',
  };

  const openSidecar = (panel: DynamicPanelType, payload?: Record<string, unknown>) => {
    // Map legacy DynamicPanelType to new SidecarMode
    let mode: SidecarMode = 'code';

    if (panel === 'browser') mode = 'browser';
    else if (panel === 'terminal') mode = 'terminal';
    else if (panel === 'code') mode = 'code';
    else if (panel === 'data') mode = 'data';

    openSidecarStore(mode, payload?.['contextId'] as string | undefined);
  };

  return (
    <div
      className={`unified-agentic-chat relative flex h-full min-h-0 flex-col overflow-hidden bg-[#05060b] ${layoutClasses[layout]} ${className}`}
    >
      <AppLayout onOpenSettings={onOpenSettings} onOpenBilling={onOpenBilling}>
        <BudgetAlertsPanel />
        <ChatStream onOpenSidecar={openSidecar} />

        {/* FIX: Removed the fixed bottom wrapper. 
            ChatInputArea handles its own 'fixed' positioning to float in the center when empty. */}
        <ChatInputArea onSend={handleSendMessage} />
      </AppLayout>

      {workspaceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur">
          <div className="relative h-[80vh] w-[90vw] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0c14] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-slate-200">
                <Layers className="h-4 w-4" />
                <span>Workspace</span>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-slate-400">
                  Code + Terminal
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => setWorkspaceOpen(false)}
                >
                  <Square className="h-4 w-4" />
                  Close
                </Button>
              </div>
            </div>
            <div className="grid h-[calc(80vh-52px)] grid-cols-1 gap-3 overflow-hidden p-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-[#0f111d]">
                <TerminalWorkspace className="h-full" />
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0f111d]">
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  Hook your editor/file tree here for a full code view.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {mediaLabOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur">
          <div className="relative h-[88vh] w-[96vw] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0c14] shadow-2xl">
            <MediaLab onClose={() => setMediaLabOpen(false)} />
          </div>
        </div>
      )}

      <ApprovalModal />
    </div>
  );
};

export default UnifiedAgenticChat;

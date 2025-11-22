import React, { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Layers, Square } from 'lucide-react';

import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { useAgenticEvents } from '../../hooks/useAgenticEvents';
import { type SendOptions } from './ChatInputArea';
import { AppLayout } from './AppLayout';
import { ApprovalModal } from './ApprovalModal';
import { Button } from '../ui/Button';
import { TerminalWorkspace } from '../Terminal/TerminalWorkspace';
import { useModelStore } from '../../stores/modelStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTokenBudgetStore, selectBudget } from '../../stores/tokenBudgetStore';
import { useCostStore } from '../../stores/costStore';
import { sha256 } from '../../lib/hash';
import { isTauri } from '../../lib/tauri-mock';
import { deriveTaskMetadata } from '../../lib/taskMetadata';
import { MediaLab } from './MediaLab';
import { ChatStream } from './ChatStream';
import { type DynamicPanelType } from './DynamicSidecar';
import { BudgetAlertsPanel } from './BudgetAlertsPanel';

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
  onOpenSettings: _onOpenSettings,
}) => {
  const sidecarOpen = useUnifiedChatStore((state) => state.sidecarOpen);
  const setSidecarOpen = useUnifiedChatStore((state) => state.setSidecarOpen);
  const addMessage = useUnifiedChatStore((state) => state.addMessage);
  const updateMessage = useUnifiedChatStore((state) => state.updateMessage);
  const setStreamingMessage = useUnifiedChatStore((state) => state.setStreamingMessage);
  const conversationMode = useUnifiedChatStore((state) => state.conversationMode);
  const messages = useUnifiedChatStore((state) => state.messages);

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
  const [sidecarState, setSidecarState] = useState<{
    type: DynamicPanelType;
    payload?: Record<string, unknown>;
  }>({ type: null });

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

  // Mark as intentionally unused for TypeScript
  void _tokenStats;

  useAgenticEvents();

  useEffect(() => {
    if (defaultSidecarOpen === false) {
      setSidecarOpen(false);
    }
  }, [defaultSidecarOpen, setSidecarOpen]);

  useEffect(() => {
    if (!sidecarState.type && sidecarOpen) {
      setSidecarOpen(false);
    }
  }, [sidecarState.type, sidecarOpen, setSidecarOpen]);

  useEffect(() => {
    if (!budget.enabled) return;
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;
    const messageId = String((lastMessage as any).id ?? crypto.randomUUID());
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

  // @ts-expect-error - Temporarily unused until ChatInputArea is re-integrated
  const _handleSendMessage = async (content: string, options: SendOptions) => {
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
      providerId:
        options.providerId ?? routingOverrides.providerId ?? providerForMessage ?? 'openai',
      modelId: options.modelId ?? routingOverrides.modelId ?? modelForMessage ?? 'gpt-4o',
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

    const assistantMessageId = crypto.randomUUID();
    addMessage({
      role: 'assistant',
      content: '',
      metadata: { streaming: true },
    });
    setStreamingMessage(assistantMessageId);

    try {
      if (onSendMessage) {
        await onSendMessage(content, enrichedOptions);
      } else {
        const response = await invoke<any>('chat_send_message', {
          request: {
            content,
            providerOverride: enrichedOptions.providerId,
            modelOverride: enrichedOptions.modelId,
            stream: false,
            enableTools: true,
            conversationMode,
            workflowHash,
            taskMetadata,
          },
        });

        updateMessage(assistantMessageId, {
          content: response.assistant_message?.content || 'No response',
          metadata: {
            streaming: false,
            model: response.assistant_message?.model,
            provider: response.assistant_message?.provider,
            tokenCount: response.assistant_message?.tokens,
            cost: response.assistant_message?.cost,
          },
        });
      }
    } catch (error) {
      updateMessage(assistantMessageId, {
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: { streaming: false },
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
    setSidecarState({ type: panel, payload });
    setSidecarOpen(true);
  };

  return (
    <div
      className={`unified-agentic-chat relative flex h-full min-h-0 flex-col overflow-hidden bg-[#05060b] ${layoutClasses[layout]} ${className}`}
    >
      <AppLayout>
        <BudgetAlertsPanel />
        <ChatStream onOpenSidecar={openSidecar} />
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

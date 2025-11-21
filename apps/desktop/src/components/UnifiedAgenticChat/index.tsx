import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CircleUserRound, Layers, Shield, ShieldOff, Square } from 'lucide-react';

import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { useAgenticEvents } from '../../hooks/useAgenticEvents';
import { ChatInputArea, type SendOptions } from './ChatInputArea';
import { AppLayout } from './AppLayout';
import { AgentStatusBanner } from './AgentStatusBanner';
import { ApprovalModal } from './ApprovalModal';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { QuickModelSelector } from '../Chat/QuickModelSelector';
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
import { DynamicSidecar, type DynamicPanelType } from './DynamicSidecar';

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
  const sidecarOpen = useUnifiedChatStore((state) => state.sidecarOpen);
  const setSidecarOpen = useUnifiedChatStore((state) => state.setSidecarOpen);
  const addMessage = useUnifiedChatStore((state) => state.addMessage);
  const updateMessage = useUnifiedChatStore((state) => state.updateMessage);
  const setStreamingMessage = useUnifiedChatStore((state) => state.setStreamingMessage);
  const conversationMode = useUnifiedChatStore((state) => state.conversationMode);
  const setConversationMode = useUnifiedChatStore((state) => state.setConversationMode);
  const messages = useUnifiedChatStore((state) => state.messages);
  const conversations = useUnifiedChatStore((state) => state.conversations);
  const activeConversationId = useUnifiedChatStore((state) => state.activeConversationId);
  const createConversation = useUnifiedChatStore((state) => state.createConversation);
  const selectConversation = useUnifiedChatStore((state) => state.selectConversation);

  const llmConfig = useSettingsStore((state) => state.llmConfig);
  const selectedProvider = useModelStore((state) => state.selectedProvider);
  const selectedModel = useModelStore((state) => state.selectedModel);
  const setWorkflowContext = useUnifiedChatStore((state) => state.setWorkflowContext);
  const budget = useTokenBudgetStore(selectBudget);
  const addTokenUsage = useTokenBudgetStore((state) => state.addTokenUsage);
  const { overview, loadOverview, loadingOverview } = useCostStore();
  const countedMessageIdsRef = useRef<Set<string>>(new Set());

  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [mediaLabOpen, setMediaLabOpen] = useState(false);
  const [sidecarState, setSidecarState] = useState<{
    type: DynamicPanelType;
    payload?: Record<string, unknown>;
  }>({ type: null });
  const [capabilities, setCapabilities] = useState({
    computer: true,
    internet: true,
    safe: conversationMode === 'safe',
  });

  const tokenStats = useMemo(() => {
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

  const sessionCost = useMemo(() => {
    if (tokenStats.cost > 0) {
      return tokenStats.cost;
    }
    const estimate = (tokenStats.input + tokenStats.output) * 0.0000025;
    return Number(estimate.toFixed(4));
  }, [tokenStats]);

  const sidebarItems = useMemo(
    () =>
      conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title?.trim() || 'Untitled chat',
        subtitle: conversation.lastMessage?.trim() || 'No messages yet',
        active: conversation.id === activeConversationId,
        onClick: () => selectConversation(conversation.id),
      })),
    [conversations, activeConversationId, selectConversation],
  );

  const conversationTitle =
    conversations.find((c) => c.id === activeConversationId)?.title || 'New chat';

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
    setCapabilities((prev) => ({ ...prev, safe: conversationMode === 'safe' }));
  }, [conversationMode]);

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
      providerId: options.providerId ?? routingOverrides.providerId ?? providerForMessage,
      modelId: options.modelId ?? routingOverrides.modelId ?? modelForMessage,
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

  const handleNewChat = useCallback(() => {
    const id = createConversation('New chat');
    selectConversation(id);
  }, [createConversation, selectConversation]);

  const openSidecar = (panel: DynamicPanelType, payload?: Record<string, unknown>) => {
    setSidecarState({ type: panel, payload });
    setSidecarOpen(true);
  };

  const headerLeft = (
    <div className="flex items-center gap-3">
      <div className="flex flex-col">
        <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Conversation</p>
        <h2 className="text-lg font-semibold text-zinc-50">{conversationTitle}</h2>
      </div>
      <div className="hidden items-center gap-2 text-xs text-zinc-400 sm:flex">
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
          {providerForMessage || 'auto'}
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
          ${sessionCost.toFixed(3)} · Month{' '}
          {loadingOverview ? '…' : `$${(overview?.month_total ?? 0).toFixed(2)}`}
        </span>
      </div>
    </div>
  );

  const headerRight = (
    <div className="flex items-center gap-2">
      <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2 py-1 sm:flex">
        <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Model</span>
        <QuickModelSelector className="w-[200px]" />
      </div>
      <button
        type="button"
        onClick={() => setConversationMode(conversationMode === 'safe' ? 'full_control' : 'safe')}
        className={cn(
          'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition',
          conversationMode === 'safe'
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100 hover:border-emerald-500/60'
            : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-600',
        )}
      >
        {conversationMode === 'safe' ? (
          <Shield className="h-4 w-4" />
        ) : (
          <ShieldOff className="h-4 w-4" />
        )}
        <span>{conversationMode === 'safe' ? 'Safe mode' : 'Full control'}</span>
      </button>
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900/90 px-3 py-1.5 text-sm text-zinc-200 transition hover:border-white/30 hover:text-white"
      >
        <CircleUserRound className="h-5 w-5" />
        <span className="hidden sm:inline">Profile</span>
      </button>
    </div>
  );

  const composer = (
    <ChatInputArea
      onSend={handleSendMessage}
      placeholder="Type a prompt or describe a workflow..."
      enableAttachments
      enableScreenshot
      className="bg-transparent"
      modelLabel={`${providerForMessage || 'Auto'} · ${modelForMessage || 'Default'}`}
      capabilityState={capabilities}
      onCapabilityChange={(key, value) => {
        if (key === 'safe') {
          setConversationMode(value ? 'safe' : 'full_control');
        }
        setCapabilities((prev) => ({ ...prev, [key]: value }));
      }}
    />
  );

  const sidecarNode = (
    <DynamicSidecar
      panelType={sidecarState.type}
      payload={sidecarState.payload}
      allowedDirectory={sidecarState.payload?.allowedDirectory as string | undefined}
      allowStatus={sidecarState.payload?.restricted ? 'restricted' : 'allowed'}
      onClose={() => {
        setSidecarOpen(false);
        setSidecarState({ type: null });
      }}
    />
  );

  return (
    <div
      className={`unified-agentic-chat relative flex h-full min-h-0 flex-col overflow-hidden bg-[#05060b] ${layoutClasses[layout]} ${className}`}
    >
      <AppLayout
        headerLeft={headerLeft}
        headerRight={headerRight}
        sidebarItems={sidebarItems}
        onNewChat={handleNewChat}
        sidecar={sidecarNode}
        sidecarOpen={sidecarOpen}
        onToggleSidecar={() => setSidecarOpen(!sidecarOpen)}
        composer={composer}
      >
        <AgentStatusBanner />
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

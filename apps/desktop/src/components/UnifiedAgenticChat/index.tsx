import React, { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  PanelRightOpen,
  PanelRightClose,
  Shield,
  ShieldOff,
  Mic,
  Paperclip,
  Send,
  Camera,
} from 'lucide-react';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { useAgenticEvents } from '../../hooks/useAgenticEvents';
import { ChatMessageList } from './ChatMessageList';
import { ChatInputArea, type SendOptions } from './ChatInputArea';
import { SidecarPanel } from './SidecarPanel';
import { AgentStatusBanner } from './AgentStatusBanner';
import { ApprovalModal } from './ApprovalModal';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { QuickModelSelector } from '../Chat/QuickModelSelector';
import { useModelStore } from '../../stores/modelStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { sha256 } from '../../lib/hash';
import { isTauri } from '../../lib/tauri-mock';
import { deriveTaskMetadata } from '../../lib/taskMetadata';

const heroChips = ['Code', 'Write', 'Learn', 'Automate', 'Claude’s pick', 'Life stuff'];

const personaOptions = ['ChatGPT 5.1 Thinking', 'Claude Opus 4.1', 'GPT-4o Omni', 'Gemini 2.5 Pro'];

export const UnifiedAgenticChat: React.FC<{
  className?: string;
  layout?: 'default' | 'compact' | 'immersive';
  sidecarPosition?: 'right' | 'left' | 'bottom';
  defaultSidecarOpen?: boolean;
  onSendMessage?: (content: string, options: SendOptions) => Promise<void>;
}> = ({
  className = '',
  layout = 'default',
  sidecarPosition = 'right',
  defaultSidecarOpen = true,
  onSendMessage,
}) => {
  const contentWidthClass = 'max-w-[1180px] w-full';
  const sidecarOpen = useUnifiedChatStore((state) => state.sidecarOpen);
  const setSidecarOpen = useUnifiedChatStore((state) => state.setSidecarOpen);
  const addMessage = useUnifiedChatStore((state) => state.addMessage);
  const updateMessage = useUnifiedChatStore((state) => state.updateMessage);
  const deleteMessage = useUnifiedChatStore((state) => state.deleteMessage);
  const setStreamingMessage = useUnifiedChatStore((state) => state.setStreamingMessage);
  const conversationMode = useUnifiedChatStore((state) => state.conversationMode);
  const setConversationMode = useUnifiedChatStore((state) => state.setConversationMode);
  const messages = useUnifiedChatStore((state) => state.messages);
  const hasMessages = messages.length > 0;
  const llmConfig = useSettingsStore((state) => state.llmConfig);
  const selectedProvider = useModelStore((state) => state.selectedProvider);
  const selectedModel = useModelStore((state) => state.selectedModel);
  const setWorkflowContext = useUnifiedChatStore((state) => state.setWorkflowContext);

  const [heroInput, setHeroInput] = useState('');
  const [activePersona, setActivePersona] = useState(personaOptions[0]);
  const [thinkingMode, setThinkingMode] = useState<'Extended thinking' | 'Fast'>(
    'Extended thinking',
  );

  useAgenticEvents();

  useEffect(() => {
    if (defaultSidecarOpen === false) {
      setSidecarOpen(false);
    }
  }, [defaultSidecarOpen, setSidecarOpen]);

  const toggleSidecar = () => setSidecarOpen(!sidecarOpen);
  const fallbackProvider = llmConfig.defaultProvider;
  const providerForMessage = selectedProvider ?? fallbackProvider ?? undefined;
  const fallbackModelForProvider =
    providerForMessage && llmConfig.defaultModels
      ? llmConfig.defaultModels[providerForMessage]
      : undefined;
  const modelForMessage = selectedModel ?? fallbackModelForProvider ?? undefined;

  const handleSendMessage = async (content: string, options: SendOptions) => {
    const enrichedOptions: SendOptions = {
      ...options,
      providerId: options.providerId ?? providerForMessage,
      modelId: options.modelId ?? modelForMessage,
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

  const handleMessageDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this message?')) {
      deleteMessage(id);
    }
  };

  const handleMessageEdit = (id: string, content: string) => updateMessage(id, { content });
  const handleMessageRegenerate = (id: string) => console.log('Regenerate message:', id);

  const heroSubtitle = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const sendHeroMessage = () => {
    if (!heroInput.trim()) return;
    void handleSendMessage(heroInput, {});
    setHeroInput('');
  };

  const layoutClasses = {
    default: 'p-0',
    compact: 'p-2',
    immersive: 'p-0',
  };

  const renderHero = () => (
    <div className="relative flex-1 overflow-auto px-4 py-10 lg:px-6">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div
          className={`mx-auto h-full ${contentWidthClass} bg-gradient-to-b from-indigo-500/10 via-transparent to-transparent blur-3xl`}
        />
      </div>
      <div
        className={`relative mx-auto flex w-full ${contentWidthClass} flex-col gap-8 text-center text-white`}
      >
        <div className="flex flex-col items-center gap-3">
          <p className="text-xs uppercase tracking-[0.4em] text-slate-500">
            AGI Workforce • {heroSubtitle}
          </p>
          <h1 className="text-4xl font-semibold sm:text-5xl">Ready when you are.</h1>
          <p className="max-w-3xl text-base text-slate-400">
            Start a conversation in your AGI workspace. Blend terminal actions, browser automation,
            MCP tools, and reasoning — all from one place.
          </p>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-white/5/40 p-6 text-left shadow-2xl backdrop-blur">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <label className="text-xs uppercase tracking-[0.2em] text-slate-500">Persona</label>
              <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-black/40 px-4 py-2 text-sm">
                <select
                  value={activePersona}
                  onChange={(event) => setActivePersona(event.target.value)}
                  className="bg-transparent text-white focus:outline-none"
                >
                  {personaOptions.map((option) => (
                    <option key={option} value={option} className="bg-[#05060b] text-white">
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-black/40 px-4 py-2 text-sm">
              <span className="text-slate-400">{thinkingMode}</span>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-slate-300 hover:text-white"
                onClick={() =>
                  setThinkingMode((mode) =>
                    mode === 'Extended thinking' ? 'Fast' : 'Extended thinking',
                  )
                }
              >
                Switch
              </Button>
            </div>
            <Button
              variant={conversationMode === 'safe' ? 'outline' : 'default'}
              size="sm"
              className={cn(
                'gap-2 border-white/20',
                conversationMode === 'safe'
                  ? 'text-white hover:bg-white/10'
                  : 'bg-orange-500 text-white hover:bg-orange-600',
              )}
              onClick={() =>
                setConversationMode(conversationMode === 'safe' ? 'full_control' : 'safe')
              }
            >
              {conversationMode === 'safe' ? (
                <Shield className="h-4 w-4" />
              ) : (
                <ShieldOff className="h-4 w-4" />
              )}
              {conversationMode === 'safe' ? 'Safe mode' : 'Full control'}
            </Button>
          </div>

          <div className="mt-5 rounded-3xl border border-white/10 bg-black/60 px-6 py-5">
            <textarea
              className="h-28 w-full resize-none bg-transparent text-lg text-white placeholder:text-slate-500 focus:outline-none"
              placeholder="Ask anything..."
              value={heroInput}
              onChange={(event) => setHeroInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  sendHeroMessage();
                }
              }}
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-slate-400">
              <div className="flex gap-3">
                <button
                  type="button"
                  className="rounded-full border border-white/15 p-2 hover:text-white"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="rounded-full border border-white/15 p-2 hover:text-white"
                >
                  <Camera className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="rounded-full border border-white/15 p-2 hover:text-white"
                >
                  <Mic className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span>{thinkingMode}</span>
                <span className="text-slate-600">|</span>
                <span>{activePersona}</span>
              </div>
              <Button
                onClick={sendHeroMessage}
                className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-6 text-white"
              >
                <Send className="mr-2 h-4 w-4" />
                Send
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2 text-sm text-slate-200">
          {heroChips.map((chip) => (
            <span key={chip} className="rounded-full border border-white/10 px-4 py-1">
              {chip}
            </span>
          ))}
        </div>
      </div>
    </div>
  );

  const renderConversationView = () => (
    <div className="flex flex-1 overflow-hidden bg-[#05060b] text-white">
      <div className="flex flex-1 flex-col min-w-0 min-h-0">
        <div className="border-b border-white/10 bg-white/5/10 px-4 py-4">
          <div
            className={`mx-auto flex w-full ${contentWidthClass} flex-wrap items-center justify-between gap-4`}
          >
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Greeting</p>
              <h2 className="text-2xl font-semibold">Golden hour thinking</h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant={conversationMode === 'safe' ? 'outline' : 'default'}
                size="sm"
                className={cn(
                  'gap-2 border-white/10',
                  conversationMode === 'safe'
                    ? 'text-white hover:bg-white/10'
                    : 'bg-orange-500 text-white hover:bg-orange-600',
                )}
                onClick={() =>
                  setConversationMode(conversationMode === 'safe' ? 'full_control' : 'safe')
                }
              >
                {conversationMode === 'safe' ? (
                  <Shield className="h-4 w-4" />
                ) : (
                  <ShieldOff className="h-4 w-4" />
                )}
                {conversationMode === 'safe' ? 'Safe mode' : 'Full control'}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-slate-400 hover:text-white"
                onClick={toggleSidecar}
                title={sidecarOpen ? 'Hide side panel' : 'Show side panel'}
              >
                {sidecarOpen ? (
                  <PanelRightClose className="h-5 w-5" />
                ) : (
                  <PanelRightOpen className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <AgentStatusBanner />

        <div className="flex-1 min-h-0 px-4 py-6">
          <div className={`mx-auto flex h-full w-full ${contentWidthClass} flex-col`}>
            <div className="flex-1 overflow-hidden rounded-[32px] border border-white/5 bg-white/5 p-4">
              <ChatMessageList
                className="h-full"
                onMessageEdit={handleMessageEdit}
                onMessageDelete={handleMessageDelete}
                onMessageRegenerate={handleMessageRegenerate}
              />
            </div>
          </div>
        </div>

        <div className="border-t border-white/5 bg-transparent px-4 py-6">
          <div className={`mx-auto w-full ${contentWidthClass}`}>
            <ChatInputArea
              onSend={handleSendMessage}
              placeholder="Type a prompt or describe a workflow..."
              enableAttachments
              enableScreenshot
              className="bg-transparent"
              rightAccessory={
                <div className="flex items-center gap-2 rounded-2xl bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-300">
                  <span className="text-[10px] text-slate-400">Model</span>
                  <QuickModelSelector className="w-[150px]" />
                </div>
              }
            />
          </div>
        </div>
      </div>

      {sidecarOpen && (
        <div className="w-[360px] border-l border-white/10 bg-white/5/40 backdrop-blur">
          <SidecarPanel isOpen={sidecarOpen} onToggle={toggleSidecar} position={sidecarPosition} />
        </div>
      )}
    </div>
  );

  return (
    <div
      className={`unified-agentic-chat relative flex h-full min-h-0 flex-col overflow-hidden bg-[#05060b] ${layoutClasses[layout]} ${className}`}
    >
      {hasMessages ? renderConversationView() : renderHero()}
      <ApprovalModal />
    </div>
  );
};

export default UnifiedAgenticChat;

// Updated Nov 21, 2025: Brain Transplant - Unified Store Integration
import { useCallback, useEffect, useRef, memo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ChatMessageList } from '../UnifiedAgenticChat/ChatMessageList';
import { ChatInputArea, type SendOptions } from '../UnifiedAgenticChat/ChatInputArea';
import { QuickModelSelector } from './QuickModelSelector';
import { BudgetAlertsPanel } from './BudgetAlertsPanel';
import { ProgressIndicator } from '../AGI/ProgressIndicator';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useModelStore } from '../../stores/modelStore';
import { useTokenBudgetStore, selectBudget } from '../../stores/tokenBudgetStore';
import { sha256 } from '../../lib/hash';
import { deriveTaskMetadata } from '../../lib/taskMetadata';
import { isTauri } from '../../lib/tauri-mock';
import { cn } from '../../lib/utils';

interface ChatInterfaceProps {
  className?: string;
}

export const ChatInterface = memo(function ChatInterface({ className }: ChatInterfaceProps) {
  // Unified Store
  const messages = useUnifiedChatStore((state) => state.messages);
  const isLoading = useUnifiedChatStore((state) => state.isLoading);
  const addMessage = useUnifiedChatStore((state) => state.addMessage);
  const updateMessage = useUnifiedChatStore((state) => state.updateMessage);
  const setStreamingMessage = useUnifiedChatStore((state) => state.setStreamingMessage);
  const conversationMode = useUnifiedChatStore((state) => state.conversationMode);
  const setWorkflowContext = useUnifiedChatStore((state) => state.setWorkflowContext);

  // Settings & Model Selection
  const llmConfig = useSettingsStore((state) => state.llmConfig);
  const selectedProvider = useModelStore((state) => state.selectedProvider);
  const selectedModel = useModelStore((state) => state.selectedModel);

  // Budget Tracking
  const budget = useTokenBudgetStore(selectBudget);
  const addTokenUsage = useTokenBudgetStore((state) => state.addTokenUsage);
  const countedMessageIdsRef = useRef<Set<string>>(new Set());

  // Track token usage
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

  // Determine provider and model
  const fallbackProvider = llmConfig.defaultProvider;
  const providerForMessage = selectedProvider ?? fallbackProvider ?? undefined;
  const fallbackModelForProvider =
    providerForMessage && llmConfig.defaultModels
      ? llmConfig.defaultModels[providerForMessage]
      : undefined;
  const modelForMessage = selectedModel ?? fallbackModelForProvider ?? undefined;

  const handleSendMessage = useCallback(
    async (content: string, options: SendOptions = {}) => {
      // Task classification for routing
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

      // Safe mode validation
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

      // Set workflow context
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
          console.error('[ChatInterface] Failed to set workflow hash', error);
        }
      }

      const taskMetadata = deriveTaskMetadata(entryPoint, enrichedOptions.attachments);

      // Add user message
      addMessage({ role: 'user', content, attachments: enrichedOptions.attachments });

      // Add assistant message placeholder
      const assistantMessageId = crypto.randomUUID();
      addMessage({
        role: 'assistant',
        content: '',
        metadata: { streaming: true },
      });
      setStreamingMessage(assistantMessageId);

      // Send to backend
      try {
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
      } catch (error) {
        updateMessage(assistantMessageId, {
          content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          metadata: { streaming: false },
        });
      } finally {
        setStreamingMessage(null);
      }
    },
    [
      llmConfig,
      conversationMode,
      providerForMessage,
      modelForMessage,
      addMessage,
      updateMessage,
      setStreamingMessage,
      setWorkflowContext,
    ],
  );

  return (
    <div className={cn('flex h-full flex-col min-h-0 min-w-0', className)}>
      {/* Budget Alerts - show at top */}
      <BudgetAlertsPanel />

      {/* AGI Progress Indicator */}
      <div className="px-4 pt-2">
        <ProgressIndicator compact={false} autoHide={true} autoHideDelay={5000} />
      </div>

      {/* Modern Chat Messages */}
      <div className="flex-1 overflow-hidden min-h-0">
        <ChatMessageList />
      </div>

      {/* Modern Input with Model Selector */}
      <div className="max-w-3xl mx-auto w-full px-6 pb-6">
        <ChatInputArea
          onSend={handleSendMessage}
          disabled={isLoading}
          rightAccessory={<QuickModelSelector className="mr-2" />}
          placeholder="Type your message..."
          enableAttachments
        />
      </div>
    </div>
  );
});

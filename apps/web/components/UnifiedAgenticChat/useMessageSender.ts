/**
 * useMessageSender
 *
 * Custom hook that encapsulates model resolution, slash command argument
 * validation, risk detection, and the handleSendMessage callback.
 */
import { isTauri } from '@/lib/tauri-mock';
import { invoke as ipcInvoke } from '@/utils/ipc';
import { useSlashCommands } from '@/hooks/useSlashCommands';
import { sha256 } from '@/lib/hash';
import { deriveTaskMetadata } from '@/lib/taskMetadata';
import { getModelForRequest } from '@/lib/modelRouter';
import { getModelMetadata } from '@/constants/llm';
import { useModelStore } from '@/stores/unified/modelStore';
import { useSettingsStore } from '@/stores/unified/settingsStore';
import { useUnifiedChatStore, uuidToDbId } from '@/stores/unified/unifiedChatStore';
import { useBillingStore } from '@/stores/unified/auth';
import { useCustomInstructionsStore } from '@/stores/unified/customInstructionsStore';
import { useExecutionStore } from '@/stores/unified/executionStore';
import { useProjectStore } from '@/stores/unified/projectStore';
import { supabaseAuth } from '@/services/supabaseAuth';
import type { ResearchTask } from '@/types/chat';
import { formatErrorForChat } from '@/lib/friendlyErrors';
import { toast } from '@/hooks/useToast';
import { refreshCreditsAfterMessage } from '@/hooks/useCreditRefresh';
import type { SendOptions } from './ChatInputArea';
import {
  executeTerminalCommand,
  executeBrowserCommand,
  executeCodeCommand,
  executeDatabaseCommand,
  executeUndoCommand,
} from '@/handlers/slashCommandHandlers';

export interface UseMessageSenderConfig {
  addMessage: (msg: any) => string;
  updateMessage: (id: string, patch: any) => void;
  setIsLoading: (loading: boolean) => void;
  setStreamingMessage: (id: string | null) => void;
  setWorkflowContext: (ctx: any) => void;
  conversationMode: string;
  selectedProvider: string | null;
  selectedModel: string | null;
  llmConfig: any;
  providerForMessage: string | undefined;
  modelForMessage: string | undefined;
  defaultModels: Record<string, string>;
  onSendMessage?: (content: string, options: SendOptions) => Promise<void>;
  confirmRisk: (level: 'medium' | 'high', message: string) => Promise<boolean>;
  clearQueuedStreamUpdates: (messageId?: string) => void;
  markStreamActivity: () => void;
  streamWatchdogTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  lastStreamActivityAtRef: React.MutableRefObject<number>;
  toolExecutionTimeoutsRef: React.MutableRefObject<
    Map<
      string,
      {
        softTimeoutId: ReturnType<typeof setTimeout>;
        hardTimeoutId: ReturnType<typeof setTimeout>;
      }
    >
  >;
}

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

export function useMessageSender(config: UseMessageSenderConfig): {
  handleSendMessage: (content: string, options: SendOptions) => Promise<void>;
} {
  const {
    addMessage,
    updateMessage,
    setIsLoading,
    setStreamingMessage,
    setWorkflowContext,
    conversationMode,
    selectedProvider: _selectedProvider,
    selectedModel,
    llmConfig,
    providerForMessage,
    modelForMessage,
    defaultModels,
    onSendMessage,
    confirmRisk,
    clearQueuedStreamUpdates,
    markStreamActivity,
    streamWatchdogTimeoutRef,
    lastStreamActivityAtRef: _lastStreamActivityAtRef,
    toolExecutionTimeoutsRef,
  } = config;

  // Suppress unused-variable lint for refs only used inside closures
  void _selectedProvider;
  void _lastStreamActivityAtRef;

  // Initialize slash command parsing
  const { parseSlashCommand } = useSlashCommands();

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
            panel = await executeTerminalCommand(slashCommand.args, userMessageId);
            break;
          case 'code':
            panel = await executeCodeCommand(slashCommand.args);
            break;
          case 'database':
            panel = await executeDatabaseCommand(slashCommand.args);
            break;
          case 'undo':
            panel = await executeUndoCommand(slashCommand.args);
            break;
          default:
            throw new Error(`Unknown command: ${slashCommand.command}`);
        }

        // Add the inline panel to the message
        useUnifiedChatStore.getState().addInlinePanel(userMessageId, panel as any);
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

    // Use intelligent model router for auto modes
    // This replaces the old local classifyTask and applyRouting functions
    const hasImages = options.attachments?.some((a) => a.type === 'image') ?? false;
    const currentModel = options.modelOverride ?? selectedModel ?? 'auto';

    // Check if user explicitly selected a specific model (not an auto mode)
    // User's explicit model selection should ALWAYS be respected over routing.
    // Only use intelligent routing when:
    // 1. User has selected "auto" mode (auto-economy, auto-balanced, auto-premium, or legacy 'auto')
    // 2. No explicit model override was provided
    const isExplicitModelSelection = currentModel !== 'auto' && !currentModel.startsWith('auto-');

    // Only perform routing if user selected an auto mode
    const routingResult = isExplicitModelSelection
      ? { modelId: currentModel, reason: `User selected: ${currentModel}`, wasRouted: false }
      : getModelForRequest(currentModel, content, hasImages);

    // Risk detection runs in ALL modes - dangerous patterns should always be flagged
    // The undo-based safety philosophy handles reversibility AFTER actions, but we still
    // need upfront detection to warn users about potentially dangerous requests.
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
      // In auto mode, use stronger warning language since AGI operates autonomously
      const modeContext =
        conversationMode === 'auto'
          ? ' AGI Workforce will execute this autonomously without step-by-step approval.'
          : '';

      const riskMessage =
        riskLevel === 'high'
          ? `This request contains a HIGH-RISK instruction that could cause system damage: ${matchedRisk}.${modeContext} This is not recommended.`
          : `This request may contain a potential security risk: ${matchedRisk}.${modeContext} Proceed with caution.`;

      // CHT-003 fix: Use custom dialog instead of window.confirm()
      const confirmed = await confirmRisk(riskLevel as 'medium' | 'high', riskMessage);
      if (!confirmed) {
        return;
      }
    }

    // Use the routed model from intelligent router
    // If routing occurred, use the routed model. Otherwise use the original selection.
    const enrichedOptions: SendOptions = {
      ...options,
      providerOverride: options.providerOverride ?? providerForMessage ?? llmConfig.defaultProvider,
      // Use routed model if routing occurred, otherwise use the explicit model override
      modelOverride: routingResult.wasRouted
        ? routingResult.modelId
        : (options.modelOverride ?? modelForMessage ?? defaultModels[llmConfig.defaultProvider]),
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
        await ipcInvoke('agent_set_workflow_hash', { workflow_hash: workflowHash });
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
        createdAt: new Date(),
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

    // Create assistant message with loading placeholder (fixes empty message display)
    const assistantMessageId = addMessage({
      role: 'assistant',
      content: '', // Will be populated by streaming chunks
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

        // Check if always use agent mode is enabled in settings
        const alwaysUseAgentMode =
          useSettingsStore.getState().chatPreferences.alwaysUseAgentMode ?? false;

        // Get current project folder for scoped file operations
        const currentProjectFolder = useProjectStore.getState().currentFolder;

        // Nudge user to select a project folder when sending file-related messages
        if (!currentProjectFolder) {
          const fileKeywords =
            /\b(file|folder|directory|read|write|edit|create|delete|save|open|path|code|project|src|component)\b/i;
          if (fileKeywords.test(content)) {
            toast({
              variant: 'default',
              title: 'No project folder selected',
              description:
                'Select a project folder (top-right folder icon) so the AI can access your files. Without it, file operations may fail.',
              duration: 8000,
            });
          }
        }

        // Look up model capabilities to help backend filter tools appropriately
        const effectiveModel = enrichedOptions.modelOverride || selectedModel || 'auto';
        const modelMeta = getModelMetadata(effectiveModel);
        const modelCapabilities = modelMeta?.capabilities ?? undefined;

        interface ChatSendMessageResponse {
          conversation?: { id: number };
          message?: { id: number; content: string };
          credits?: {
            remaining_cents: number;
            daily_used?: number;
            daily_limit?: number;
            daily_reset_at?: string;
          };
        }
        const response = await ipcInvoke<ChatSendMessageResponse>('chat_send_message', {
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
            // Force agent mode if user has enabled "always use agent mode" setting
            enableAgentMode: alwaysUseAgentMode ? true : undefined,
            // Project folder for scoped file operations (like Claude Code)
            projectFolder: currentProjectFolder || undefined,
            // Model capabilities for tool filtering (Phase 6)
            modelCapabilities: modelCapabilities || undefined,
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
          useBillingStore.getState().updateCredits({
            balance_cents: response.credits.remaining_cents,
            daily_limit_cents: response.credits.daily_limit ?? null,
            daily_usage_cents: response.credits.daily_used ?? 0,
          });
        }

        // Trigger a credit refresh after message is sent to update UI with fresh balance
        // This helps users see their remaining credits in near real-time
        void refreshCreditsAfterMessage();
      }
    } catch (error) {
      console.error('[UnifiedAgenticChat] Error sending message:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Always use friendly messages — formatErrorForChat handles all modes consistently
      const userMessage = formatErrorForChat(errorMessage, true);
      updateMessage(assistantMessageId, {
        content: userMessage,
        metadata: { streaming: false },
        error: errorMessage,
      });
      // Clean up loading state on error - for successful streaming, chat:stream-end handles this
      clearQueuedStreamUpdates(assistantMessageId);
      setIsLoading(false);
      setStreamingMessage(null);
    } finally {
      // AUDIT-STREAM-059 fix: Add finally block with watchdog timeout to prevent stuck loading states
      // The watchdog now tracks inactivity (not absolute wall time), so long
      // generations stay alive while chunks/tool events are still flowing.
      // Bug 3 note: stream_watchdog_timeout in agent mode was a downstream symptom of
      // Bug 2 (missing VITE_SUPABASE_URL in production → Supabase module threw at load
      // → auth never initialized → LLM streaming never started → watchdog fired).
      // Fix 2 (supabase.ts graceful degradation + .env.production) resolves Bug 3.
      // If stream_watchdog_timeout recurs without Bug 2 present, check the Rust-side
      // 30-second stream connection timeout in llm_router.rs (stream_timeout variable).
      const WATCHDOG_TIMEOUT_MS = 60 * 1000; // 60 seconds of inactivity (accommodates image generation 30-90s)
      markStreamActivity();

      const scheduleWatchdog = () => {
        if (streamWatchdogTimeoutRef.current) {
          clearTimeout(streamWatchdogTimeoutRef.current);
        }
        streamWatchdogTimeoutRef.current = setTimeout(() => {
          const state = useUnifiedChatStore.getState();
          const idleMs = Date.now() - config.lastStreamActivityAtRef.current;

          // If there was recent activity, extend watchdog instead of forcing cleanup.
          if (idleMs < WATCHDOG_TIMEOUT_MS) {
            scheduleWatchdog();
            return;
          }

          // If there are active tool executions (e.g. image/video generation that takes 30-90s),
          // keep extending the watchdog rather than killing the stream prematurely.
          // Covers both: chat-path tools (toolExecutionTimeoutsRef) and AGI-path tools (activeToolStreams).
          if (toolExecutionTimeoutsRef.current.size > 0 || state.activeToolStreams.size > 0) {
            scheduleWatchdog();
            return;
          }

          if (state.isLoading || state.currentStreamingMessageId) {
            console.warn(
              '[UnifiedAgenticChat] AUDIT-STREAM-059: Inactivity watchdog triggered - cleaning up stale streaming state',
              { idleMs, messageId: assistantMessageId },
            );

            clearQueuedStreamUpdates(assistantMessageId);
            state.setIsLoading(false);
            state.setStreamingMessage(null);
            toolExecutionTimeoutsRef.current.forEach((timeoutEntry) => {
              clearTimeout(timeoutEntry.softTimeoutId);
              clearTimeout(timeoutEntry.hardTimeoutId);
            });
            toolExecutionTimeoutsRef.current.clear();

            const message = state.messages.find((m) => m.id === assistantMessageId);
            const hasContent = Boolean(message?.content?.trim());
            updateMessage(assistantMessageId, {
              metadata: { streaming: false },
              ...(hasContent
                ? {}
                : {
                    content: 'Response timed out. Please try again.',
                    error: 'stream_watchdog_timeout',
                  }),
            });
          }
          streamWatchdogTimeoutRef.current = null;
        }, WATCHDOG_TIMEOUT_MS);
      };

      if (streamWatchdogTimeoutRef.current) {
        clearTimeout(streamWatchdogTimeoutRef.current);
      }
      scheduleWatchdog();
    }
  };

  return { handleSendMessage };
}

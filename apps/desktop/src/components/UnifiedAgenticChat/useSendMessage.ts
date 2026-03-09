/**
 * useSendMessage
 *
 * Custom hook that encapsulates the handleSendMessage logic from UnifiedAgenticChat.
 * Handles slash command dispatch, risk detection, model routing, deep research setup,
 * and IPC call to the backend.
 */
import { useCallback } from 'react';
import { isTauri } from '../../lib/tauri-mock';
import { invoke as ipcInvoke } from '../../utils/ipc';

import { useSlashCommands } from '../../hooks/useSlashCommands';
import { sha256 } from '../../lib/hash';
import { deriveTaskMetadata } from '../../lib/taskMetadata';
import { getModelForRequest, type AutoMode } from '../../lib/modelRouter';
import {
  isAutoModel,
  normalizeAutoMode,
  resolveKnownModelCapabilities,
  toModelCapabilitiesDto,
} from '../../lib/modelCapabilities';
import { useModelStore } from '../../stores/modelStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { Provider } from '../../types/provider';
import { useUnifiedChatStore, uuidToDbId } from '../../stores/unifiedChatStore';
import { useChatStore } from '../../stores/chat/chatStore';
import type { PendingUserMessage } from '../../stores/chat/types';
import { useBillingStore } from '../../stores/auth';
import { useCustomInstructionsStore } from '../../stores/customInstructionsStore';
import { useMemoryStore, buildMemoryContext } from '../../stores/memoryStore';
import { readMemoryPanelSettings } from '../Memory/MemoryPanel';
import { useExecutionStore } from '../../stores/executionStore';
import { useProjectStore } from '../../stores/projectStore';
import { supabaseAuth } from '../../services/supabaseAuth';
import type { ResearchTask } from '../../types/chat';
import { formatErrorForChat } from '../../lib/friendlyErrors';
import { getSimpleErrorMessage } from '../../lib/errorMessages';
import { toast } from '../../hooks/useToast';
import { refreshCreditsAfterMessage } from '../../hooks/useCreditRefresh';
import {
  buildProjectSlashCommandInstructions,
  validateSlashCommandArgs,
} from '../../lib/chatToolUtils';
import type { SendOptions } from './ChatInputArea';
import {
  executeTerminalCommand,
  executeBrowserCommand,
  executeCodeCommand,
  executeDatabaseCommand,
  executeUndoCommand,
  executeImagineCommand,
  executeSwarmCommand,
  executeVisionCommand,
  executeSkillsCommand,
  executeMemoryCommand,
  executeRecallCommand,
  executeAgentsCommand,
  executeGitCommand,
  executeScheduleCommand,
  executeVoiceCommand,
  executeThinkCommand,
  executeDocsCommand,
  executeRecordCommand,
  executeMetricsCommand,
  executeMarketplaceCommand,
  executeDesktopCommand,
  executeOCRCommand,
  executeNotifyCommand,
  executeLSPCommand,
  executeEnhanceCommand,
  executeMigrateCommand,
  executeMessageCommand,
  executeSettingsCommand,
  executeCompactCommand,
  executeRedoCommand,
} from '../../handlers/slashCommandHandlers';

export interface UseSendMessageConfig {
  addMessage: ReturnType<typeof useUnifiedChatStore.getState>['addMessage'];
  updateMessage: ReturnType<typeof useUnifiedChatStore.getState>['updateMessage'];
  setIsLoading: ReturnType<typeof useUnifiedChatStore.getState>['setIsLoading'];
  setStreamingMessage: ReturnType<typeof useUnifiedChatStore.getState>['setStreamingMessage'];
  setWorkflowContext: ReturnType<typeof useUnifiedChatStore.getState>['setWorkflowContext'];
  conversationMode: ReturnType<typeof useUnifiedChatStore.getState>['conversationMode'];
  selectedProvider: Provider | null;
  selectedModel: string | null;
  llmConfig: ReturnType<typeof useSettingsStore.getState>['llmConfig'];
  confirmRisk: (riskLevel: 'medium' | 'high', message: string) => Promise<boolean>;
  onSendMessage?: (content: string, options: SendOptions) => Promise<void>;
  clearQueuedStreamUpdates: (messageId?: string) => void;
  markStreamActivity: () => void;
  streamWatchdogTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  lastStreamActivityAtRef: React.MutableRefObject<number>;
  toolExecutionTimeoutsRef: React.MutableRefObject<
    Map<
      string,
      {
        conversationId: number;
        softTimeoutId: ReturnType<typeof setTimeout>;
        hardTimeoutId: ReturnType<typeof setTimeout>;
      }
    >
  >;
}

export function useSendMessage(config: UseSendMessageConfig) {
  const {
    addMessage,
    updateMessage,
    setIsLoading,
    setStreamingMessage,
    setWorkflowContext,
    conversationMode,
    selectedProvider,
    selectedModel,
    llmConfig,
    confirmRisk,
    onSendMessage,
    clearQueuedStreamUpdates,
    markStreamActivity,
    streamWatchdogTimeoutRef,
    lastStreamActivityAtRef,
    toolExecutionTimeoutsRef,
  } = config;

  // Initialize slash command parsing
  const { parseSlashCommand } = useSlashCommands();

  const fallbackProvider = llmConfig.defaultProvider;
  const providerForMessage = selectedProvider ?? fallbackProvider ?? undefined;
  // For subscription-only model, defaultModels only has managed_cloud and ollama
  const defaultModels = llmConfig.defaultModels as Record<string, string>;
  const fallbackModelForProvider =
    providerForMessage && llmConfig.defaultModels
      ? (defaultModels[providerForMessage] ?? 'auto')
      : undefined;
  const modelForMessage = selectedModel ?? fallbackModelForProvider ?? undefined;

  const handleSendMessage = useCallback(
    async (content: string, options: SendOptions = {}) => {
      // BUG-IX-04 fix: track whether this invocation is a slash command early-return so the
      // watchdog finally-block can skip scheduling a 120s timeout for commands that never
      // start a stream (e.g. /terminal, /browser, or any other builtin/project command).
      let isSlashCommand = false;

      // Handle slash commands
      const slashCommand = parseSlashCommand(content);
      let customSlashInstructions: string | undefined;
      let customSlashMetadata:
        | {
            command: string;
            args: string;
            rawInput: string;
            source: 'project-command';
            commandPath?: string;
          }
        | undefined;

      if (slashCommand) {
        if (slashCommand.source === 'project-command') {
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
            isSlashCommand = true;
            return;
          }

          customSlashInstructions = buildProjectSlashCommandInstructions(
            slashCommand.command,
            slashCommand.args,
            slashCommand.commandContent ?? '',
            slashCommand.commandPath,
          );
          customSlashMetadata = {
            command: slashCommand.command,
            args: slashCommand.args,
            rawInput: slashCommand.rawInput,
            source: 'project-command',
          };
          if (slashCommand.commandPath) {
            customSlashMetadata.commandPath = slashCommand.commandPath;
          }
          // BUG-IX-03 fix: return early after project-command processing is complete.
          isSlashCommand = true;
          return;
        } else {
          // BUG-IX-02 fix: declare userMessageId at the top of the enclosing else-block scope
          let userMessageId: string | undefined;

          // Validate command arguments first
          if (!validateSlashCommandArgs(slashCommand.command, slashCommand.args)) {
            userMessageId = addMessage({
              role: 'user',
              content: slashCommand.rawInput,
              slashCommand,
              inlinePanels: [],
            });

            updateMessage(userMessageId, {
              content: `Error: Invalid or suspicious arguments for /${slashCommand.command}. Arguments may be too long or contain dangerous patterns.`,
              metadata: { streaming: false },
            });
            isSlashCommand = true;
            return;
          }

          // Create user message with slash command metadata
          userMessageId = addMessage({
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
              case 'redo':
                panel = await executeRedoCommand();
                break;
              case 'imagine':
                panel = await executeImagineCommand(slashCommand.args);
                break;
              case 'swarm':
                panel = await executeSwarmCommand(slashCommand.args);
                break;
              case 'vision':
                panel = await executeVisionCommand(slashCommand.args);
                break;
              case 'skills':
                panel = await executeSkillsCommand(slashCommand.args);
                break;
              case 'memory':
                panel = await executeMemoryCommand(slashCommand.args);
                break;
              case 'recall':
                panel = await executeRecallCommand(slashCommand.args);
                break;
              case 'agents':
                panel = await executeAgentsCommand(slashCommand.args);
                break;
              case 'git':
                panel = await executeGitCommand(slashCommand.args);
                break;
              case 'schedule':
                panel = await executeScheduleCommand(slashCommand.args);
                break;
              case 'voice':
                panel = await executeVoiceCommand(slashCommand.args);
                break;
              case 'think':
                panel = await executeThinkCommand(slashCommand.args);
                break;
              case 'pdf':
              case 'word':
              case 'excel':
              case 'docs':
                panel = await executeDocsCommand(
                  slashCommand.command === 'docs'
                    ? slashCommand.args
                    : `${slashCommand.command} ${slashCommand.args}`,
                );
                break;
              case 'record':
                panel = await executeRecordCommand(slashCommand.args);
                break;
              case 'metrics':
                panel = await executeMetricsCommand();
                break;
              case 'marketplace':
                panel = await executeMarketplaceCommand(slashCommand.args);
                break;
              case 'desktop':
                panel = await executeDesktopCommand();
                useUnifiedChatStore.getState().openSidecar('computer-use');
                break;
              case 'ocr':
                panel = await executeOCRCommand(slashCommand.args);
                break;
              case 'notify':
                panel = await executeNotifyCommand(slashCommand.args);
                break;
              case 'lsp':
                panel = await executeLSPCommand(slashCommand.args);
                break;
              case 'enhance':
                panel = await executeEnhanceCommand(slashCommand.args);
                break;
              case 'migrate':
                panel = await executeMigrateCommand();
                break;
              case 'message':
                panel = await executeMessageCommand(slashCommand.args);
                break;
              case 'settings':
                panel = await executeSettingsCommand(slashCommand.args);
                break;
              case 'compact': {
                const activeConvId = useUnifiedChatStore.getState().activeConversationId;
                const compactDbId = activeConvId ? (uuidToDbId(activeConvId) ?? null) : null;
                const compactUserId = supabaseAuth.getUser()?.id ?? null;
                panel = await executeCompactCommand(slashCommand.args, compactDbId, compactUserId);
                break;
              }
              default:
                throw new Error(`Unknown command: ${slashCommand.command}`);
            }

            // Add the inline panel to the message
            useUnifiedChatStore.getState().addInlinePanel(userMessageId, panel);
          } catch (error) {
            const errorMessage = getSimpleErrorMessage(error);
            if (userMessageId) {
              updateMessage(userMessageId, {
                error: errorMessage,
              });
            }
          }
          isSlashCommand = true;
          return;
        }
      }

      // When the agentic loop is active, queue the message as a pending follow-up
      // instead of interrupting the ongoing loop with a new chat_send_message call.
      const agenticStatus = useChatStore.getState().agenticLoopStatus;
      if (agenticStatus?.active) {
        const activeConversationId = useUnifiedChatStore.getState().activeConversationId;
        const conversationDbId = activeConversationId
          ? uuidToDbId(activeConversationId)
          : undefined;
        try {
          const pendingMsg = await ipcInvoke<PendingUserMessage>('chat_add_pending_message', {
            request: {
              content,
              conversationId: conversationDbId,
            },
          });
          useChatStore.getState().addPendingMessage(pendingMsg);
          console.debug('[UnifiedAgenticChat] Message queued for agentic loop:', pendingMsg.id);
        } catch (error) {
          console.error('[UnifiedAgenticChat] Failed to queue message:', error);
          const errorMessage = getSimpleErrorMessage(error);
          toast({
            variant: 'destructive',
            title: 'Failed to queue message',
            description: errorMessage,
            duration: 4000,
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
      const hasImages = options.attachments?.some((a) => a.type === 'image') ?? false;
      const currentModel = options.modelOverride ?? selectedModel ?? 'auto';

      // Check if user explicitly selected a specific model (not an auto mode)
      const isExplicitModelSelection = !isAutoModel(currentModel);

      // Only perform routing if user selected an auto mode
      const routingResult = isExplicitModelSelection
        ? { modelId: currentModel, reason: `User selected: ${currentModel}`, wasRouted: false }
        : getModelForRequest(currentModel, content, hasImages);

      // Risk detection runs in ALL modes
      const dangerousCommandPatterns = [
        /\b(rm|del|erase|format|diskpart|fdisk|wipe)\b/i,
        /\b(shutdown|poweroff|reboot|halt)\b/i,
        /(disable|disallow|stop|kill)\s+(antivirus|firewall|defender|av)/i,
        /\b(registry\s+delete|regedit|reg\s+delete)\b/i,
        /taskkill\s+\/f/i,
        /\b(dd|shred)\b.*if=/i,
      ];

      const dangerousOperatorPatterns = [/[;&|`$(){}[\]\\]/];

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

      for (const pattern of dangerousCommandPatterns) {
        if (pattern.test(lower)) {
          riskLevel = 'high';
          matchedRisk = pattern.source;
          break;
        }
      }

      if (riskLevel === 'low') {
        for (const pattern of promptInjectionPatterns) {
          if (pattern.test(lower)) {
            riskLevel = 'medium';
            matchedRisk = pattern.source;
            break;
          }
        }
      }

      if (riskLevel === 'low' && dangerousOperatorPatterns[0]!.test(content)) {
        if (/\b(execute|run|system|shell|cmd|command|bash|sh|powershell)\b/i.test(lower)) {
          riskLevel = 'medium';
          matchedRisk = 'Shell operators with execution keywords';
        }
      }

      if (riskLevel !== 'low') {
        const modeContext =
          conversationMode === 'auto'
            ? ' AGI Workforce will execute this autonomously without step-by-step approval.'
            : '';

        const riskMessage =
          riskLevel === 'high'
            ? `This request contains a HIGH-RISK instruction that could cause system damage: ${matchedRisk}.${modeContext} This is not recommended.`
            : `This request may contain a potential security risk: ${matchedRisk}.${modeContext} Proceed with caution.`;

        const confirmed = await confirmRisk(riskLevel as 'medium' | 'high', riskMessage);
        if (!confirmed) {
          return;
        }
      }

      // Use the routed model from intelligent router
      const enrichedOptions: SendOptions = {
        ...options,
        providerOverride:
          options.providerOverride ?? providerForMessage ?? llmConfig.defaultProvider,
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
          await ipcInvoke('agent_set_workflow_hash', { workflowHash });
        } catch (error) {
          console.error('[UnifiedAgenticChat] Failed to set workflow hash', error);
        }
      }

      const autoMode = normalizeAutoMode(currentModel) as AutoMode | undefined;
      const taskMetadata = deriveTaskMetadata(
        entryPoint,
        enrichedOptions.attachments,
        undefined,
        autoMode,
      );

      if (routingResult.modelId) {
        taskMetadata.selectedModel = routingResult.modelId;
        taskMetadata.routingReason = routingResult.reason;
      }

      addMessage({
        role: 'user',
        content,
        attachments: enrichedOptions.attachments,
        slashCommand: customSlashMetadata,
      });

      // Handle deep-research focus mode: create research task and set special metadata
      const isDeepResearchMode = enrichedOptions.focusMode === 'deep-research';
      let researchTaskId: string | undefined;

      if (isDeepResearchMode) {
        researchTaskId = `research-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

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

          const userId = supabaseAuth.getUser()?.id;
          if (!userId) {
            throw new Error('User not authenticated');
          }

          // Get merged custom instructions (project > conversation > global)
          const conversationInstructions = useUnifiedChatStore
            .getState()
            .getConversationCustomInstructions(activeConversationId ?? undefined);
          let mergedCustomInstructions = useCustomInstructionsStore
            .getState()
            .getMergedInstructions(conversationInstructions);

          // Prepend persistent memory context if memory is enabled and autoInject is on
          const memoryPanelSettings = readMemoryPanelSettings();
          if (memoryPanelSettings.isEnabled && memoryPanelSettings.autoInject) {
            const memoryContext = buildMemoryContext(
              useMemoryStore.getState().memories,
              memoryPanelSettings.maxTokens,
            );
            if (memoryContext) {
              mergedCustomInstructions = mergedCustomInstructions
                ? `${memoryContext}\n\n${mergedCustomInstructions}`
                : memoryContext;
            }
          }

          // Inject file context items into custom instructions
          if (options.context && options.context.length > 0) {
            const fileContextBlocks = options.context
              .filter(
                (item): item is Extract<typeof item, { type: 'file' }> =>
                  item.type === 'file' &&
                  'content' in item &&
                  Boolean((item as { content?: string }).content),
              )
              .map((item) => {
                const lang =
                  (item as { language?: string }).language ?? item.name.split('.').pop() ?? '';
                return `## Attached file: ${item.name}\n\`\`\`${lang}\n${(item as { content?: string }).content}\n\`\`\``;
              })
              .join('\n\n');
            if (fileContextBlocks) {
              mergedCustomInstructions = mergedCustomInstructions
                ? `${fileContextBlocks}\n\n${mergedCustomInstructions}`
                : fileContextBlocks;
            }
          }

          if (customSlashInstructions) {
            mergedCustomInstructions = mergedCustomInstructions
              ? `${customSlashInstructions}\n\n${mergedCustomInstructions}`
              : customSlashInstructions;
          }

          // Check if always use agent mode is enabled in settings
          const alwaysUseAgentMode =
            useSettingsStore.getState().chatPreferences.alwaysUseAgentMode ?? false;
          const shouldForceAgentMode = alwaysUseAgentMode && !isExplicitModelSelection;

          // Check if this conversation is in incognito mode
          const chatStoreState = useUnifiedChatStore.getState();
          const activeConvo = chatStoreState.conversations.find(
            (c) => c.id === activeConversationId,
          );
          const isIncognito = activeConvo?.incognito ?? false;

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
          const effectiveProvider =
            (enrichedOptions.providerOverride as typeof selectedProvider | undefined) ??
            selectedProvider;
          const customModels = useSettingsStore.getState().customModels;
          const resolvedCapabilities = resolveKnownModelCapabilities(
            effectiveModel,
            effectiveProvider,
            customModels,
          );
          const modelCapabilities = toModelCapabilitiesDto(resolvedCapabilities);

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
              conversationId: conversationDbId,
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
              enableThinking: useModelStore.getState().thinkingModeEnabled,
              thinkingBudget: useModelStore.getState().thinkingBudget ?? 0,
              temperature: useSettingsStore.getState().llmConfig?.temperature,
              maxOutputTokens: useSettingsStore.getState().llmConfig?.maxTokens,
              isExplicitModelSelection,
              preferCloudCredits: true,
              frontendMessageId: assistantMessageId, // Pass frontend message ID for event coordination
              customInstructions: mergedCustomInstructions || undefined,
              autoInjectSkills:
                useSettingsStore.getState().chatPreferences.autoInjectSkills ?? true,
              researchTaskId: isDeepResearchMode ? researchTaskId : undefined,
              enableAgentMode:
                options.enableAgentMode === false
                  ? false
                  : options.enableAgentMode === true || shouldForceAgentMode
                    ? true
                    : undefined,
              projectFolder: currentProjectFolder || undefined,
              modelCapabilities: modelCapabilities || undefined,
              incognito: isIncognito ? true : undefined,
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

          if (response.credits) {
            useBillingStore.getState().updateCredits(response.credits);
          }

          // Trigger a credit refresh after message is sent to update UI with fresh balance
          void refreshCreditsAfterMessage();
        }
      } catch (error) {
        console.error('[UnifiedAgenticChat] Error sending message:', error);
        const errorMessage = getSimpleErrorMessage(error);

        // Always use friendly messages
        const userMessage = formatErrorForChat(errorMessage, true);
        updateMessage(assistantMessageId, {
          content: userMessage,
          metadata: { streaming: false },
          error: errorMessage,
        });
        // Clean up loading state on error
        clearQueuedStreamUpdates(assistantMessageId);
        setIsLoading(false);
        setStreamingMessage(null);
      } finally {
        // AUDIT-STREAM-059 fix: Add finally block with watchdog timeout
        // BUG-IX-04 fix: skip watchdog scheduling for slash command early-returns.
        if (!isSlashCommand) {
          const WATCHDOG_TIMEOUT_MS = 120 * 1000;
          markStreamActivity();

          const scheduleWatchdog = () => {
            if (streamWatchdogTimeoutRef.current) {
              clearTimeout(streamWatchdogTimeoutRef.current);
            }
            streamWatchdogTimeoutRef.current = setTimeout(() => {
              const state = useUnifiedChatStore.getState();
              const idleMs = Date.now() - lastStreamActivityAtRef.current;

              if (idleMs < WATCHDOG_TIMEOUT_MS) {
                scheduleWatchdog();
                return;
              }

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
        } // end if (!isSlashCommand)
      }
    },
    [
      parseSlashCommand,
      addMessage,
      updateMessage,
      setIsLoading,
      setStreamingMessage,
      setWorkflowContext,
      conversationMode,
      selectedModel,
      selectedProvider,
      llmConfig,
      providerForMessage,
      modelForMessage,
      defaultModels,
      confirmRisk,
      onSendMessage,
      clearQueuedStreamUpdates,
      markStreamActivity,
      streamWatchdogTimeoutRef,
      lastStreamActivityAtRef,
      toolExecutionTimeoutsRef,
    ],
  );

  return { handleSendMessage };
}

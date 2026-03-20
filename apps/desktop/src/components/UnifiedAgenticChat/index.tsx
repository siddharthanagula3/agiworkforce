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
import { isTauri } from '../../lib/tauri-mock';
import { invoke as ipcInvoke } from '../../utils/ipc';
import React, { useEffect, useRef, useCallback, useState } from 'react';
import { EyeOff, Loader2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

import { cn } from '../../lib/utils';
import { useAgenticEvents } from '../../hooks/useAgenticEvents';
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
import { useBillingUsageStore } from '../../stores/billingUsage';
import { useModelStore } from '../../stores/modelStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { initializeExtensionEventListeners } from '../../stores/extensionEventsStore';
import { useUnifiedChatStore, type SidecarMode, uuidToDbId } from '../../stores/unifiedChatStore';
import {
  useChatStore,
  selectAgenticLoopStatus,
  selectPendingMessages,
  selectTokenUsage,
} from '../../stores/chat/chatStore';
import type { PendingUserMessage } from '../../stores/chat/types';
import { useBillingStore } from '../../stores/auth';
import { selectIsSimpleMode, useSimpleModeStore } from '../../stores/ui';
import { useCustomInstructionsStore } from '../../stores/customInstructionsStore';
import { useMemoryStore, buildMemoryContext } from '../../stores/memoryStore';
import { readMemoryPanelSettings } from '../Memory/MemoryPanel';
import { useExecutionStore } from '../../stores/executionStore';
import { useExecutionSidecarStore } from '../../stores/executionSidecarStore';
import { useProjectStore } from '../../stores/projectStore';
import { supabaseAuth } from '../../services/supabaseAuth';
import type { ResearchTask } from '../../types/chat';
import { formatErrorForChat } from '../../lib/friendlyErrors';
import { getSimpleErrorMessage } from '../../lib/errorMessages';
import { toast } from 'sonner';
import { refreshCreditsAfterMessage } from '../../hooks/useCreditRefresh';
import { NEW_CHAT_ABORT_EVENT } from '../../lib/newChatReset';
import {
  buildProjectSlashCommandInstructions,
  validateSlashCommandArgs,
} from '../../lib/chatToolUtils';
import { getSkillById } from '../../lib/skillLoader';
import { CanvasWorkspace } from '../Canvas';
import { InteractiveHelp } from '../Help/InteractiveHelp';
import { CalendarWorkspace } from '../Calendar/CalendarWorkspace';
import { DocumentWorkspace } from '../Document';
import { DatabaseWorkspace } from '../Database/DatabaseWorkspace';
import { CostDashboard } from '../Analytics/CostDashboard';
import { RealtimeROIDashboard } from '../ROIDashboard/components';
import { GitPanel } from '../Git';
import { TerminalWorkspace } from '../Terminal/TerminalWorkspace';
import { VisionWorkspace } from '../Vision/VisionWorkspace';
import { MarketplacePage } from '../Marketplace/MarketplacePage';
import { WorkflowPanel } from '../Workflows';
import { ImagesGallery } from '../Images/ImagesGallery';
import { SkillsMarketplace } from '../Skills/SkillsMarketplace';
import { ScheduledTasksPage } from '../Schedules/ScheduledTasksPage';
import { ArtifactsGallery } from '../Artifacts/ArtifactsGallery';
import { DeepResearchPage } from '../Research/DeepResearchPage';
import { ComputerUseMonitor } from '../ComputerUse';
import { ActionRecorder } from '../Automation/ActionRecorder';
import { GovernanceDashboard } from '../Governance/GovernanceDashboard';
import { TeamDashboard } from '../Teams/TeamDashboard';
import { CloudStoragePanel } from '../Cloud/CloudStoragePanel';
import { MobileCompanionPanel } from '../Mobile/MobileCompanionPanel';
import { ChatErrorBoundary } from '../ErrorBoundary';
import { SectionErrorBoundary } from '../ui/SectionErrorBoundary';
import { AppLayout } from './AppLayout';
import { AgentProgressFooter } from './AgentProgressFooter';
import { BudgetAlertsPanel } from './BudgetAlertsPanel';
import { ChatInputArea, type SendOptions } from './ChatInputArea';
import { ChatStream } from './ChatStream';
import { ProjectsView } from './ProjectsView';
import { TasksView } from './TasksView';
import { RiskConfirmationDialog, useRiskConfirmation } from './RiskConfirmationDialog';
import { BackgroundTaskIndicator } from '../BackgroundTasks';
import { PlanPreview } from '../Planning/PlanPreview';
import { usePlanningStore, selectPlanningOpen } from '../../stores/planningStore';
import { useAppModeStore } from '../../stores/appModeStore';
import { useTauriStreamListeners } from './useTauriStreamListeners';
import { PromptSuggestionsDropdown } from './PromptSuggestionsDropdown';
import { PromptSuggestions } from './PromptSuggestions';
import { ConnectorDiscoveryBar } from './ConnectorDiscoveryBar';
import { BrandedGreeting } from './BrandedGreeting';
import { QuickStartPills } from './QuickStartPills';
import { ArtifactsView } from './ArtifactsView';
import { AgentStepTimeline, type AgentStep } from './AgentStepTimeline';
import { TokenCounter } from './TokenCounter';
import { DragDropOverlay } from './DragDropOverlay';
import { CouncilView } from './CouncilView';
import { ChatInputToolbar } from './ChatInputToolbar';
import { BriefStatus, type BriefStatusState } from './BriefStatus';
import { usePromptSuggestions } from '../../hooks/usePromptSuggestions';
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
  executePlanCommand,
} from '../../handlers/slashCommandHandlers';

/**
 * Extracts skill IDs from @mentions in message content.
 * Matches patterns like "@backend-engineer", "@3d-artist", etc.
 * Filters out common false positives (e.g. email-like patterns).
 */
function extractSkillMentions(content: string): string[] {
  const mentionPattern = /@([\w][\w-]*)/g;
  const matches: string[] = [];
  let match;
  while ((match = mentionPattern.exec(content)) !== null) {
    const id = match[1] ?? '';
    if (!id) continue;
    // Skip common non-skill patterns (file: prefix handled separately)
    if (id.startsWith('file') || id.startsWith('http') || id.startsWith('www')) {
      continue;
    }
    matches.push(id);
  }
  return matches;
}

/**
 * Status bar shown above the chat input when the agentic loop is running.
 * Communicates current iteration progress and hints that the user can queue a follow-up.
 */
const AgenticLoopStatusBar: React.FC = () => {
  const agenticLoopStatus = useChatStore(selectAgenticLoopStatus);

  if (!agenticLoopStatus?.active) {
    return null;
  }

  const { iteration, maxIterations } = agenticLoopStatus;
  const stepLabel = maxIterations > 0 ? `step ${iteration}/${maxIterations}` : `step ${iteration}`;

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 bg-violet-950/40 border-t border-violet-500/20 text-xs text-violet-300"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-3.5 w-3.5 text-violet-500 animate-spin shrink-0" aria-hidden="true" />
      <span>
        Agent working ({stepLabel}){' '}
        <span className="text-violet-400/70">— type to queue a follow-up</span>
      </span>
    </div>
  );
};

/**
 * Renders queued/pending messages as dimmed bubbles above the input.
 * These messages are waiting to be consumed after the current agentic loop finishes.
 */
const PendingMessagesBubbles: React.FC = () => {
  const pendingMessages = useChatStore(selectPendingMessages);

  if (!pendingMessages || pendingMessages.length === 0) {
    return null;
  }

  return (
    <div
      className="flex flex-col gap-1.5 px-4 py-2 border-t border-white/5"
      aria-label="Queued messages"
    >
      {pendingMessages.map((msg: PendingUserMessage) => (
        <div
          key={msg.id}
          className="self-end max-w-[80%] px-3 py-2 rounded-2xl rounded-br-md bg-violet-900/20 border border-violet-500/15 text-xs text-violet-300/50 italic truncate"
          title={msg.content}
          aria-label={`Queued message: ${msg.content}`}
        >
          {msg.content}
        </div>
      ))}
    </div>
  );
};

/**
 * PlanPreviewPanel — renders the interactive plan preview inline above the chat input.
 * Bridges the usePlanningStore state to the PlanPreview component.
 * Only mounts when the planning panel is open.
 */
const PlanPreviewPanel: React.FC = () => {
  const isOpen = usePlanningStore(selectPlanningOpen);
  const description = usePlanningStore((s) => s.description);
  const closePanel = usePlanningStore((s) => s.closePanel);

  if (!isOpen) return null;

  return (
    <div className="px-4 py-2 border-t border-border/30">
      <PlanPreview
        initialDescription={description || undefined}
        onExecutionStarted={() => {
          // Plan execution started — close the panel after a brief display
          // The agent runtime will continue execution in the background
          setTimeout(() => closePanel(), 2000);
        }}
        onClose={closePanel}
      />
    </div>
  );
};

/**
 * BudgetTracker Component
 * Moves message-based budget calculations out of the main UnifiedAgenticChat
 * to prevent full-tree re-renders on every message update.
 */
const BudgetTracker: React.FC = () => {
  const budgetEnabled = useBillingUsageStore((state) => state.budget.enabled);
  const messages = useChatStore((state) => state.messages);
  const addTokenUsage = useBillingUsageStore((state) => state.addTokenUsage);
  const countedMessageIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!budgetEnabled) return;
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;
    const messageId = String(lastMessage.id ?? crypto.randomUUID());
    if (countedMessageIdsRef.current.has(messageId)) {
      return;
    }
    // Only count tokens for completed assistant messages or user messages
    if (lastMessage.metadata?.streaming) return;

    const tokens =
      lastMessage.metadata?.tokenCount ?? Math.ceil((lastMessage.content?.length ?? 0) * 0.25);
    addTokenUsage(tokens);
    countedMessageIdsRef.current.add(messageId);
  }, [messages, budgetEnabled, addTokenUsage]);

  return null;
};

export const UnifiedAgenticChat: React.FC<{
  className?: string;
  layout?: 'default' | 'compact' | 'immersive';
  defaultSidecarOpen?: boolean;
  onSendMessage?: (content: string, options: SendOptions) => Promise<void>;
}> = ({ className = '', layout = 'default', defaultSidecarOpen = true, onSendMessage }) => {
  // CHT-008 fix: Consolidated selectors to reduce subscription overhead
  // Using useShallow for object selections prevents unnecessary re-renders
  const {
    setSidecarOpen,
    openSidecar: openSidecarStore,
    addMessage,
    updateMessage,
    setIsLoading,
    setStreamingMessage,
    conversationMode,
    activeView,
    setActiveView,
    setWorkflowContext,
  } = useUnifiedChatStore(
    useShallow((state) => ({
      setSidecarOpen: state.setSidecarOpen,
      openSidecar: state.openSidecar,
      addMessage: state.addMessage,
      updateMessage: state.updateMessage,
      setIsLoading: state.setIsLoading,
      setStreamingMessage: state.setStreamingMessage,
      conversationMode: state.conversationMode,
      activeView: state.activeView,
      setActiveView: state.setActiveView,
      setWorkflowContext: state.setWorkflowContext,
    })),
  );

  // CHT-008 fix: Consolidated settings and model store selectors
  const llmConfig = useSettingsStore(useShallow((state) => state.llmConfig));
  const { selectedProvider, selectedModel } = useModelStore(
    useShallow((state) => ({
      selectedProvider: state.selectedProvider,
      selectedModel: state.selectedModel,
    })),
  );

  // CHT-008 fix: Consolidated billing store selectors
  const { loadCostOverview: loadOverview } = useBillingUsageStore(
    useShallow((state) => ({
      loadCostOverview: state.loadCostOverview,
    })),
  );

  // Budget tracking moved to sub-component BudgetTracker

  // Incognito mode indicator — read active conversation's flag
  const isActiveConversationIncognito = useUnifiedChatStore((state) => {
    const active = state.conversations.find((c) => c.id === state.activeConversationId);
    return active?.incognito ?? false;
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  // Ref to store unlisten functions for synchronous cleanup
  // Note: Unlisten can return void or Promise<void> depending on the event type
  const unlistenFnsRef = useRef<Array<() => void | Promise<void>>>([]);
  // Guards async listener registration against StrictMode/dev double-mount races.
  const listenerSetupGenerationRef = useRef(0);
  const isMountedRef = useRef(true);
  const toolExecutionTimeoutsRef = useRef<
    Map<
      string,
      {
        conversationId: number;
        softTimeoutId: ReturnType<typeof setTimeout>;
        hardTimeoutId: ReturnType<typeof setTimeout>;
      }
    >
  >(new Map());

  // CHT-005 fix: Track active stream sessions to prevent race conditions
  const activeStreamSessionsRef = useRef<Map<number, string>>(new Map());

  // AUDIT-STREAM-059 fix: Track stream watchdog timeout
  const streamWatchdogTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastStreamActivityAtRef = useRef<number>(0);

  // Stream Throttling state - batches updates to avoid React saturation
  const streamBufferRef = useRef<Map<string, string>>(new Map());
  const rafIdRef = useRef<number | null>(null);

  // Auto-compaction: prevents repeated compaction within the same session
  const hasCompactedThisSessionRef = useRef(false);

  /**
   * Processes buffered stream updates using requestAnimationFrame.
   * This batches multiple chunks into a single React update per frame.
   */
  const processStreamBuffer = useCallback(() => {
    if (streamBufferRef.current.size === 0) {
      rafIdRef.current = null;
      return;
    }

    const state = useUnifiedChatStore.getState();
    streamBufferRef.current.forEach((content, messageId) => {
      state.updateMessage(messageId, {
        content,
        metadata: { streaming: true },
      });
    });

    streamBufferRef.current.clear();
    rafIdRef.current = requestAnimationFrame(processStreamBuffer);
  }, []);

  const queueStreamUpdate = useCallback(
    (messageId: string, fullContent: string) => {
      streamBufferRef.current.set(messageId, fullContent);
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(processStreamBuffer);
      }
    },
    [processStreamBuffer],
  ); // Added queueStreamUpdate via useCallback dependency

  const clearQueuedStreamUpdates = useCallback((messageId?: string) => {
    if (messageId) {
      streamBufferRef.current.delete(messageId);
    } else {
      streamBufferRef.current.clear();
    }

    if (streamBufferRef.current.size === 0 && rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const markStreamActivity = useCallback(() => {
    lastStreamActivityAtRef.current = Date.now();
  }, []);

  // AUDIT-STREAM-059 fix: Track stream watchdog timeout

  // CHT-003 fix: Custom confirmation dialog to replace window.confirm()
  const {
    state: riskConfirmState,
    confirm: confirmRisk,
    handleConfirm: handleRiskConfirm,
    handleCancel: handleRiskCancel,
  } = useRiskConfirmation();

  useAgenticEvents();
  useEffect(() => {
    void initializeExtensionEventListeners();
  }, []);

  // Initialize slash command parsing
  const { parseSlashCommand } = useSlashCommands();

  // Bug #300 fix: Use the extracted hook instead of inline event registration.
  // All ~26 Tauri stream event listeners are registered in useTauriStreamListeners.
  useTauriStreamListeners({
    abortControllerRef,
    unlistenFnsRef,
    listenerSetupGenerationRef,
    isMountedRef,
    toolExecutionTimeoutsRef,
    activeStreamSessionsRef,
    streamWatchdogTimeoutRef,
    rafIdRef,
    queueStreamUpdate,
    clearQueuedStreamUpdates,
    markStreamActivity,
  });

  useEffect(() => {
    if (defaultSidecarOpen === false) {
      setSidecarOpen(false);
    }
  }, [defaultSidecarOpen, setSidecarOpen]);

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

  const handleSendMessage = async (content: string, options: SendOptions = {}) => {
    // BUG-IX-04 fix: track whether this invocation is a slash command early-return so the
    // watchdog finally-block can skip scheduling a 120s timeout for commands that never
    // start a stream (e.g. /terminal, /browser, or any other builtin/project command).
    let isSlashCommand = false;

    // Mode guard: block chat when cloud mode is active (gateway LLM proxy not yet wired).
    const appMode = useAppModeStore.getState().mode;
    if (appMode === 'cloud') {
      toast.error('Cloud mode chat is not yet available. Switch to Local mode to chat.');
      return;
    }

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
        // Project slash commands must continue into the normal send path below.
        // `customSlashInstructions` is injected into merged custom instructions and
        // `customSlashMetadata` is attached to the eventual user message there.
        // Returning here breaks project slash commands entirely.
      } else {
        // BUG-IX-02 fix: declare userMessageId at the top of the enclosing else-block scope
        // so it is always defined in both the try body and the catch block.
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
            case 'plan':
              panel = await executePlanCommand(slashCommand.args);
              break;
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
      const conversationDbId = activeConversationId ? uuidToDbId(activeConversationId) : undefined;
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
        toast.error('Failed to queue message', {
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
    // This replaces the old local classifyTask and applyRouting functions
    const hasImages = options.attachments?.some((a) => a.type === 'image') ?? false;
    const currentModel = options.modelOverride ?? selectedModel ?? 'auto';

    // Check if user explicitly selected a specific model (not an auto mode)
    // User's explicit model selection should ALWAYS be respected over routing.
    // Only use intelligent routing when:
    // 1. User has selected "auto" mode (auto-economy, auto-balanced, auto-premium, or legacy 'auto')
    // 2. No explicit model override was provided
    const isExplicitModelSelection = !isAutoModel(currentModel);

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

    // Auto-compaction: if we have more than 50 messages and haven't compacted this session,
    // compact the context before sending to keep the conversation running smoothly.
    if (isTauri && !hasCompactedThisSessionRef.current) {
      const currentMessageCount = useChatStore.getState().messages.length;
      if (currentMessageCount > 50) {
        hasCompactedThisSessionRef.current = true;
        try {
          const autoCompactConvId = useUnifiedChatStore.getState().activeConversationId;
          const autoCompactDbId = autoCompactConvId ? uuidToDbId(autoCompactConvId) : undefined;
          const autoCompactUserId = supabaseAuth.getUser()?.id;
          await ipcInvoke('chat_compact_context', {
            conversationId: autoCompactDbId,
            focus: undefined,
            userId: autoCompactUserId,
          });
          toast.success('Context compacted', {
            description: 'Context compacted for continuous conversation',
            duration: 3000,
          });
        } catch {
          // Non-fatal: compaction failure should not block the send
          hasCompactedThisSessionRef.current = false;
        }
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

        // Extract @skill-id mentions from the message and inject their systemPrompts.
        // This ensures the LLM receives the full skill prompt when a user @-mentions a skill.
        const mentionedSkillIds = extractSkillMentions(content);
        if (mentionedSkillIds.length > 0) {
          const skillBlocks = mentionedSkillIds
            .map((skillId) => {
              const skill = getSkillById(skillId);
              if (!skill) return null;
              return `## Activated Skill: ${skill.name}\n\n${skill.systemPrompt}`;
            })
            .filter(Boolean)
            .join('\n\n---\n\n');

          if (skillBlocks) {
            mergedCustomInstructions = mergedCustomInstructions
              ? `${skillBlocks}\n\n${mergedCustomInstructions}`
              : skillBlocks;
          }
        }

        // Check if always use agent mode is enabled in settings
        const alwaysUseAgentMode =
          useSettingsStore.getState().chatPreferences.alwaysUseAgentMode ?? false;
        const shouldForceAgentMode = alwaysUseAgentMode && !isExplicitModelSelection;

        // Check if this conversation is in incognito mode
        const chatStoreState = useUnifiedChatStore.getState();
        const activeConvo = chatStoreState.conversations.find((c) => c.id === activeConversationId);
        const isIncognito = activeConvo?.incognito ?? false;

        // Get current project folder for scoped file operations
        const currentProjectFolder = useProjectStore.getState().currentFolder;

        // Nudge user to select a project folder when sending file-related messages
        if (!currentProjectFolder) {
          const fileKeywords =
            /\b(file|folder|directory|read|write|edit|create|delete|save|open|path|code|project|src|component)\b/i;
          if (fileKeywords.test(content)) {
            toast.message('No project folder selected', {
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
            customInstructions: mergedCustomInstructions || undefined, // Include merged custom instructions
            autoInjectSkills: useSettingsStore.getState().chatPreferences.autoInjectSkills ?? true,
            // Pass research task ID for deep research mode
            researchTaskId: isDeepResearchMode ? researchTaskId : undefined,
            // Enable agent mode priority:
            // (1) Toolbar toggle explicitly OFF (false) → send false, overrides global setting.
            // (2) Toolbar toggle ON, or global "Always Use Agent Mode" → send true.
            // (3) Neither set → send undefined (Rust auto-detects from prompt intent).
            enableAgentMode:
              options.enableAgentMode === false
                ? false
                : options.enableAgentMode === true || shouldForceAgentMode
                  ? true
                  : undefined,
            // Project folder for scoped file operations (like Claude Code)
            projectFolder: currentProjectFolder || undefined,
            // Model capabilities for tool filtering (Phase 6)
            modelCapabilities: modelCapabilities || undefined,
            // Incognito mode: skip persistence in backend
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
        // The response is just an acknowledgment that streaming started
        // setIsLoading will be set to false by the chat:stream-end event handler

        // However, for non-streaming fallback or future mixed modes, we check for credits here too
        if (response.credits) {
          useBillingStore.getState().updateCredits(response.credits);
        }

        // Trigger a credit refresh after message is sent to update UI with fresh balance
        // This helps users see their remaining credits in near real-time
        void refreshCreditsAfterMessage();
      }
    } catch (error) {
      console.error('[UnifiedAgenticChat] Error sending message:', error);
      const errorMessage = getSimpleErrorMessage(error);

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

      // BUG-IX-04 fix: skip watchdog scheduling for slash command early-returns.
      // Slash commands never start a stream, so the 120-second watchdog timeout would
      // fire spuriously and attempt to clean up a streaming state that was never set.
      // Note: cannot use `return` inside finally (no-unsafe-finally), so use a guard.
      if (!isSlashCommand) {
        const WATCHDOG_TIMEOUT_MS = 120 * 1000; // 120 seconds — covers reasoning models (o3, DeepSeek-R1, extended thinking) that take 30-90s before first token
        markStreamActivity();

        const scheduleWatchdog = () => {
          if (streamWatchdogTimeoutRef.current) {
            clearTimeout(streamWatchdogTimeoutRef.current);
          }
          streamWatchdogTimeoutRef.current = setTimeout(() => {
            const state = useUnifiedChatStore.getState();
            const idleMs = Date.now() - lastStreamActivityAtRef.current;

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
      } // end if (!isSlashCommand)
    }
  };

  const layoutClasses = {
    default: '',
    compact: '',
    immersive: '',
  };

  const handleStopGeneration = async () => {
    // AUDIT-STREAM-059 fix: Clear the stream watchdog when user stops generation
    if (streamWatchdogTimeoutRef.current) {
      clearTimeout(streamWatchdogTimeoutRef.current);
      streamWatchdogTimeoutRef.current = null;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // AUDIT-STREAM-038 fix: Pass conversation ID for scoped stop
    const activeConversationId = useUnifiedChatStore.getState().activeConversationId;
    const conversationDbId = activeConversationId ? uuidToDbId(activeConversationId) : undefined;

    if (isTauri) {
      try {
        await ipcInvoke('chat_stop_generation', { conversationId: conversationDbId });
      } catch (error) {
        console.warn('[UnifiedAgenticChat] Failed to stop generation:', error);
      }
    }

    const currentStreamingId = useUnifiedChatStore.getState().currentStreamingMessageId;
    if (currentStreamingId) {
      clearQueuedStreamUpdates(currentStreamingId);
      updateMessage(currentStreamingId, {
        metadata: { streaming: false },
      });
    } else {
      clearQueuedStreamUpdates();
    }

    // AUDIT-STREAM-037 fix: Clear per-tool timeout callbacks to prevent stale timeout errors
    toolExecutionTimeoutsRef.current.forEach((timeoutEntry) => {
      clearTimeout(timeoutEntry.softTimeoutId);
      clearTimeout(timeoutEntry.hardTimeoutId);
    });
    toolExecutionTimeoutsRef.current.clear();

    setIsLoading(false);
    setStreamingMessage(null);
  };

  useEffect(() => {
    const handleNewConversation = () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      activeStreamSessionsRef.current.clear();
      toolExecutionTimeoutsRef.current.forEach((timeoutEntry) => {
        clearTimeout(timeoutEntry.softTimeoutId);
        clearTimeout(timeoutEntry.hardTimeoutId);
      });
      toolExecutionTimeoutsRef.current.clear();

      if (isTauri) {
        void ipcInvoke('chat_stop_generation').catch((error: unknown) => {
          console.warn('[UnifiedAgenticChat] Failed to stop generation on new chat:', error);
        });
      }

      const state = useUnifiedChatStore.getState();
      if (state.currentStreamingMessageId) {
        clearQueuedStreamUpdates(state.currentStreamingMessageId);
        updateMessage(state.currentStreamingMessageId, {
          metadata: { streaming: false },
        });
      } else {
        clearQueuedStreamUpdates();
      }
      setIsLoading(false);
      setStreamingMessage(null);
      const unifiedState = useUnifiedChatStore.getState();
      unifiedState.clearActionTrail();
      unifiedState.clearToolStreams();
    };

    window.addEventListener(NEW_CHAT_ABORT_EVENT, handleNewConversation);
    return () => window.removeEventListener(NEW_CHAT_ABORT_EVENT, handleNewConversation);
  }, [clearQueuedStreamUpdates, setIsLoading, setStreamingMessage, updateMessage]);

  const openSidecar = (panel: SidecarMode, payload?: Record<string, unknown>) => {
    openSidecarStore(panel, payload?.['contextId'] as string | undefined, payload);
  };

  // ── Wired component state ───────────────────────────────────────────────

  // TokenCounter: read live token usage from chat store
  const tokenUsage = useChatStore(selectTokenUsage);
  const showTokenCounter = useSettingsStore((s) => s.chatPreferences.compactMode !== true);

  // PromptSuggestionsDropdown: surface suggestions when input is non-empty
  const draftContent = useUnifiedChatStore((s) => s.draftContent);
  const messages = useChatStore((s) => s.messages);
  const promptSuggestions = usePromptSuggestions(draftContent);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const isEmptyConversation = messages.length === 0;
  const showPromptSuggestions =
    isEmptyConversation && promptSuggestions.length > 0 && draftContent.length >= 3;
  const isSimpleMode = useSimpleModeStore(selectIsSimpleMode);
  const showEmptyStateUI = isEmptyConversation && !isSimpleMode;

  // ArtifactsView: toggleable side panel
  const [artifactsPanelOpen, setArtifactsPanelOpen] = useState(false);

  // AgentStepTimeline: derive steps from actionTrail
  const actionTrail = useUnifiedChatStore((s) => s.actionTrail);
  const agenticLoopStatus = useChatStore(selectAgenticLoopStatus);
  const agentSteps: AgentStep[] = actionTrail.map((entry) => ({
    id: entry.id,
    agentType:
      entry.type === 'thinking'
        ? 'planner'
        : entry.type === 'coding'
          ? 'executor'
          : entry.type === 'searching'
            ? 'executor'
            : entry.type === 'running'
              ? 'executor'
              : entry.type === 'completed'
                ? 'reviewer'
                : entry.type === 'error'
                  ? 'executor'
                  : 'coordinator',
    label: entry.message,
    status:
      entry.type === 'completed'
        ? 'complete'
        : entry.type === 'error'
          ? 'error'
          : entry.type === 'running' || entry.type === 'searching' || entry.type === 'coding'
            ? 'running'
            : 'pending',
    startedAt: entry.timestamp instanceof Date ? entry.timestamp.getTime() : undefined,
    completedAt:
      entry.type === 'completed' && entry.timestamp instanceof Date
        ? entry.timestamp.getTime()
        : undefined,
    details: entry.metadata?.['details'] as string | undefined,
  }));

  // CouncilView: multi-model council panel
  const [councilOpen, setCouncilOpen] = useState(false);

  // BriefStatus: derive from action trail
  const latestAction = actionTrail.length > 0 ? actionTrail[actionTrail.length - 1] : null;
  const briefStatusState: BriefStatusState = latestAction
    ? {
        message: latestAction.message,
        isComplete: latestAction.type === 'completed',
        isError: latestAction.type === 'error',
      }
    : { message: null, isComplete: false, isError: false };

  // DragDropOverlay: handle files dropped onto the chat
  const handleDragDropFiles = useCallback((files: File[]) => {
    const addContextItem = useUnifiedChatStore.getState().addContextItem;
    for (const file of files) {
      addContextItem({
        id: crypto.randomUUID(),
        type: 'file',
        name: file.name,
        path: (file as File & { path?: string }).path ?? file.name,
        size: file.size,
        icon: '📄',
        timestamp: new Date(),
      });
    }
    toast.success(`${files.length} file${files.length > 1 ? 's' : ''} attached`, {
      description: 'Files added as context for your next message',
      duration: 3000,
    });
  }, []);

  // AgentProgressFooter: open execution sidecar on chevron click
  const openExecutionSidecar = useCallback(() => {
    useExecutionSidecarStore.getState().open();
  }, []);

  // Context compaction handler for TokenCounter
  const handleCompactContext = useCallback(async () => {
    try {
      const activeConvId = useUnifiedChatStore.getState().activeConversationId;
      const dbId = activeConvId ? uuidToDbId(activeConvId) : undefined;
      const userId = supabaseAuth.getUser()?.id;
      await ipcInvoke('chat_compact_context', {
        conversationId: dbId,
        focus: undefined,
        userId,
      });
      toast.success('Context compacted', {
        description: 'Freed up token space for continued conversation',
        duration: 3000,
      });
    } catch {
      toast.error('Compaction failed', {
        description: 'Could not compact context. Try again later.',
        duration: 4000,
      });
    }
  }, []);

  // CHT-001 fix: Wrap entire chat interface with error boundary to prevent crashes
  return (
    <ChatErrorBoundary>
      <div
        className={`unified-agentic-chat relative flex h-full min-h-0 flex-col overflow-hidden bg-[#05060b] ${layoutClasses[layout]} ${className}`}
      >
        {/* DragDropOverlay — full-window overlay when files are dragged over the chat */}
        <DragDropOverlay
          onDrop={handleDragDropFiles}
          accept={[
            'image/*',
            'text/*',
            'application/pdf',
            'application/json',
            '.md',
            '.txt',
            '.js',
            '.ts',
            '.py',
            '.rs',
          ]}
          maxFiles={10}
        />

        <AppLayout>
          {activeView === 'chat' ? (
            <>
              {/* Header bar with token counter and background task indicator */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800/50">
                {/* Incognito mode indicator */}
                {isActiveConversationIncognito && (
                  <div className="flex items-center gap-1.5 text-violet-400 text-xs font-medium">
                    <EyeOff className="h-3.5 w-3.5" />
                    <span>Incognito — not saved to disk</span>
                  </div>
                )}

                {/* TokenCounter — compact inline display showing live token usage */}
                {showTokenCounter && tokenUsage.max > 0 && (
                  <TokenCounter
                    currentTokens={tokenUsage.current}
                    inputTokens={tokenUsage.inputTokens}
                    outputTokens={tokenUsage.outputTokens}
                    maxTokens={tokenUsage.max}
                    estimatedCost={tokenUsage.estimatedCost}
                    compact
                    showDetails
                    onCompact={handleCompactContext}
                    className="mx-2"
                  />
                )}

                <div
                  className={cn(
                    'flex items-center gap-3',
                    !isActiveConversationIncognito &&
                      !(showTokenCounter && tokenUsage.max > 0) &&
                      'ml-auto',
                  )}
                >
                  <BackgroundTaskIndicator
                    popoverSide="bottom"
                    popoverAlign="end"
                    panelMaxHeight="350px"
                  />
                </div>
              </div>

              {/* FocusSelector removed — FocusModeButtons in ChatInputArea handles focus mode selection */}

              <BudgetAlertsPanel />
              <BudgetTracker />
              {/* Main content area: chat stream + optional side panels */}
              <div className="flex flex-1 min-h-0 overflow-hidden">
                <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
                  <SectionErrorBoundary
                    sectionName="ChatStream"
                    fallback={
                      <div className="flex-1 flex items-center justify-center p-8">
                        <div className="text-center">
                          <p className="text-zinc-400 mb-4">Failed to load chat messages</p>
                          <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="px-4 py-2 bg-zinc-700 text-white rounded-lg hover:bg-zinc-600"
                          >
                            Reload
                          </button>
                        </div>
                      </div>
                    }
                  >
                    <ChatStream
                      onOpenSidecar={openSidecar}
                      onSuggestionClick={(prompt) => {
                        useUnifiedChatStore.getState().setDraftContent(prompt + ' ');
                      }}
                    />
                  </SectionErrorBoundary>

                  {/* AgentStepTimeline — shows execution steps when the agentic loop is active */}
                  {agenticLoopStatus?.active && agentSteps.length > 0 && (
                    <div className="px-4 py-2 border-t border-gray-800/30 max-h-48 overflow-y-auto">
                      <AgentStepTimeline steps={agentSteps} compact />
                    </div>
                  )}

                  {/* BriefStatus — minimal one-line status indicator for current agent action */}
                  {agenticLoopStatus?.active && briefStatusState.message && (
                    <div className="flex justify-center px-4 py-1">
                      <BriefStatus status={briefStatusState} />
                    </div>
                  )}
                </div>

                {/* ArtifactsView — toggleable side panel for generated artifacts */}
                {artifactsPanelOpen && (
                  <div className="w-[400px] border-l border-gray-800/50 overflow-hidden flex flex-col shrink-0">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800/50">
                      <span className="text-xs font-medium text-zinc-400">Artifacts</span>
                      <button
                        type="button"
                        onClick={() => setArtifactsPanelOpen(false)}
                        className="text-xs text-zinc-500 hover:text-zinc-300"
                      >
                        Close
                      </button>
                    </div>
                    <div className="flex-1 overflow-auto">
                      <ArtifactsView />
                    </div>
                  </div>
                )}

                {/* CouncilView — multi-model council panel for debate mode */}
                {councilOpen && (
                  <div className="w-[400px] border-l border-gray-800/50 overflow-hidden flex flex-col shrink-0">
                    <CouncilView
                      onClose={() => setCouncilOpen(false)}
                      onConsensusReady={(consensus) => {
                        useUnifiedChatStore.getState().setDraftContent(consensus);
                        setCouncilOpen(false);
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Pending queued messages — dimmed bubbles shown when agentic loop is active */}
              <PendingMessagesBubbles />
              {/* Interactive plan preview panel — shown when /plan triggered or Plan button clicked */}
              <PlanPreviewPanel />
              {/* Status bar: shown while agentic loop is running, hidden otherwise */}
              <AgenticLoopStatusBar />

              {/* AgentProgressFooter — persistent 40px execution bar above input */}
              <AgentProgressFooter onExpandSidecar={openExecutionSidecar} />

              {/* PromptSuggestionsDropdown — shown above input when typing and conversation is empty */}
              {showPromptSuggestions && (
                <div className="relative px-4">
                  <PromptSuggestionsDropdown
                    suggestions={promptSuggestions}
                    isVisible={showPromptSuggestions}
                    selectedIndex={suggestionIndex}
                    onSelectSuggestion={(suggestion) => {
                      useUnifiedChatStore.getState().setDraftContent(suggestion.text + ' ');
                      setSuggestionIndex(0);
                    }}
                    onMouseEnterSuggestion={setSuggestionIndex}
                  />
                </div>
              )}

              {/* Empty state UI — branded greeting, quick-start pills, prompt suggestions, connector bar */}
              {showEmptyStateUI && (
                <div className="flex flex-col items-center gap-4 px-4 pb-3">
                  {/* Personalized branded greeting */}
                  <BrandedGreeting className="mt-2" />

                  {/* Quick-start action pills — populate input or trigger features */}
                  <QuickStartPills
                    onPillClick={(_action, prompt) => {
                      useUnifiedChatStore.getState().setDraftContent(prompt);
                    }}
                  />

                  {/* Category-based prompt suggestion pills */}
                  <PromptSuggestions
                    onSelectPrompt={(text) => {
                      useUnifiedChatStore.getState().setDraftContent(text);
                    }}
                  />
                  <ConnectorDiscoveryBar />
                </div>
              )}

              {/* ChatInputToolbar — model selector, incognito toggle, auto/manual mode */}
              <ChatInputToolbar />

              <ChatInputArea onSend={handleSendMessage} onStopGeneration={handleStopGeneration} />
            </>
          ) : activeView === 'projects' ? (
            <ProjectsView />
          ) : activeView === 'tasks' ? (
            <TasksView />
          ) : activeView === 'artifacts' ? (
            <div className="flex-1 p-4">
              <CanvasWorkspace className="h-full" />
            </div>
          ) : activeView === 'help' ? (
            <div className="flex-1 overflow-auto p-4">
              <InteractiveHelp onClose={() => setActiveView('chat')} />
            </div>
          ) : activeView === 'calendar' ? (
            <div className="flex-1 overflow-hidden">
              <CalendarWorkspace className="h-full" />
            </div>
          ) : activeView === 'documents' ? (
            <div className="flex-1 overflow-hidden">
              <DocumentWorkspace className="h-full" />
            </div>
          ) : activeView === 'database' ? (
            <div className="flex-1 overflow-hidden">
              <DatabaseWorkspace className="h-full" />
            </div>
          ) : activeView === 'analytics' ? (
            <div className="flex-1 overflow-hidden">
              <CostDashboard />
            </div>
          ) : activeView === 'roi' ? (
            <div className="flex-1 overflow-hidden">
              <RealtimeROIDashboard />
            </div>
          ) : activeView === 'git' ? (
            <div className="flex-1 overflow-hidden p-4">
              <GitPanel repoPath="." className="h-full" />
            </div>
          ) : activeView === 'terminal' ? (
            <div className="flex-1 overflow-hidden">
              <TerminalWorkspace className="h-full" />
            </div>
          ) : activeView === 'vision' ? (
            <div className="flex-1 overflow-hidden">
              <VisionWorkspace />
            </div>
          ) : activeView === 'marketplace' ? (
            <div className="flex-1 overflow-hidden">
              <MarketplacePage />
            </div>
          ) : activeView === 'workflows' ? (
            <div className="flex-1 overflow-hidden">
              <WorkflowPanel className="h-full" />
            </div>
          ) : activeView === 'skills' ? (
            <div className="flex-1 overflow-hidden">
              <SkillsMarketplace />
            </div>
          ) : activeView === 'computer-use' ? (
            <div className="flex-1 overflow-hidden">
              <ComputerUseMonitor />
            </div>
          ) : activeView === 'automation' ? (
            <div className="flex-1 overflow-auto p-4">
              <ActionRecorder />
            </div>
          ) : activeView === 'governance' ? (
            <div className="flex-1 overflow-hidden">
              <GovernanceDashboard />
            </div>
          ) : activeView === 'teams' ? (
            <div className="flex-1 overflow-hidden">
              <TeamDashboard />
            </div>
          ) : activeView === 'cloud' ? (
            <div className="flex-1 overflow-hidden">
              <CloudStoragePanel />
            </div>
          ) : activeView === 'mobile' ? (
            <div className="flex-1 overflow-hidden">
              <MobileCompanionPanel />
            </div>
          ) : activeView === 'images' ? (
            <div className="flex-1 overflow-hidden">
              <ImagesGallery />
            </div>
          ) : activeView === 'schedules' ? (
            <div className="flex-1 overflow-hidden">
              <ScheduledTasksPage />
            </div>
          ) : activeView === 'artifacts-gallery' ? (
            <div className="flex-1 overflow-hidden">
              <ArtifactsGallery />
            </div>
          ) : activeView === 'deep-research' ? (
            <div className="flex-1 overflow-hidden">
              <DeepResearchPage />
            </div>
          ) : null}
        </AppLayout>

        {/* CHT-003 fix: Custom risk confirmation dialog */}
        <RiskConfirmationDialog
          isOpen={riskConfirmState.isOpen}
          riskLevel={riskConfirmState.riskLevel}
          message={riskConfirmState.message}
          onConfirm={handleRiskConfirm}
          onCancel={handleRiskCancel}
        />
      </div>
    </ChatErrorBoundary>
  );
};

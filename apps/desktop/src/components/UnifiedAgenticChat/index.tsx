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
import { listen, isTauri } from '../../lib/tauri-mock';
import { invoke as ipcInvoke } from '../../utils/ipc';
import React, { useEffect, useRef, useCallback } from 'react';
import { EyeOff, Loader2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

import { useAgenticEvents } from '../../hooks/useAgenticEvents';
import { useExtensionEvents } from '../../hooks/useExtensionEvents';
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
import { useBillingUsageStore, selectBudget } from '../../stores/billingUsage';
import { useModelStore } from '../../stores/modelStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useUnifiedChatStore, type SidecarMode, uuidToDbId } from '../../stores/unifiedChatStore';
import {
  useChatStore,
  selectAgenticLoopStatus,
  selectPendingMessages,
} from '../../stores/chat/chatStore';
import type { PendingUserMessage } from '../../stores/chat/types';
import { useBillingStore } from '../../stores/auth';
import { useCustomInstructionsStore } from '../../stores/customInstructionsStore';
import { useMemoryStore, buildMemoryContext } from '../../stores/memoryStore';
import { readMemoryPanelSettings } from '../Memory/MemoryPanel';
import { useExecutionStore } from '../../stores/executionStore';
import { useProjectStore } from '../../stores/projectStore';
import { supabaseAuth } from '../../services/supabaseAuth';
import type { Artifact, ResearchTask } from '../../types/chat';
import { formatErrorForChat } from '../../lib/friendlyErrors';
import { getSimpleErrorMessage } from '../../lib/errorMessages';
import { toast } from '../../hooks/useToast';
import { toast as sonnerToast } from 'sonner';
import { refreshCreditsAfterMessage } from '../../hooks/useCreditRefresh';
import { NEW_CHAT_ABORT_EVENT } from '../../lib/newChatReset';
import {
  normalizeToolNameForUi,
  toolNameToArtifactType,
  toolNameToTitle,
  buildProjectSlashCommandInstructions,
  normalizeInlineToolData,
  validateSlashCommandArgs,
} from '../../lib/chatToolUtils';
import { CanvasWorkspace } from '../Canvas';
import { InteractiveHelp } from '../Help/InteractiveHelp';
import { ChatErrorBoundary } from '../ErrorBoundary';
import { SectionErrorBoundary } from '../ui/SectionErrorBoundary';
import { AppLayout } from './AppLayout';
import { ApprovalModal } from './ApprovalModal';
import { BudgetAlertsPanel } from './BudgetAlertsPanel';
import { ChatInputArea, type SendOptions } from './ChatInputArea';
import { ChatStream } from './ChatStream';
import { ProjectsView } from './ProjectsView';
import { RiskConfirmationDialog, useRiskConfirmation } from './RiskConfirmationDialog';
import { BackgroundTaskIndicator } from '../BackgroundTasks';
import { resolveToolHardTimeoutMs, shouldAbortGenerationOnToolTimeout } from './toolTimeoutPolicy';
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
} from '../../handlers/slashCommandHandlers';

const TOOL_EXECUTION_SOFT_TIMEOUT_MS = 10_000;
const AGENT_THINKING_ACTION_SOURCE = 'agent:thinking';

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
 * BudgetTracker Component
 * Moves message-based budget calculations out of the main UnifiedAgenticChat
 * to prevent full-tree re-renders on every message update.
 */
const BudgetTracker: React.FC = () => {
  const budget = useBillingUsageStore(selectBudget);
  const messages = useUnifiedChatStore((state) => state.messages);
  const addTokenUsage = useBillingUsageStore((state) => state.addTokenUsage);
  const countedMessageIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!budget.enabled) return;
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
  }, [messages, budget.enabled, addTokenUsage]);

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
  useExtensionEvents();

  // Initialize slash command parsing
  const { parseSlashCommand } = useSlashCommands();

  useEffect(() => {
    if (!isTauri) return;

    const setupGeneration = ++listenerSetupGenerationRef.current;
    isMountedRef.current = true;
    // Clear any stale unlisten functions from previous render
    unlistenFnsRef.current = [];

    const setupListeners = async () => {
      // Helper to register unlisten functions as promises resolve
      const registerListener = async (listenerPromise: Promise<() => void>) => {
        try {
          const unlisten = await listenerPromise;
          const isActiveSetup =
            isMountedRef.current && listenerSetupGenerationRef.current === setupGeneration;
          if (isActiveSetup) {
            unlistenFnsRef.current.push(unlisten);
          } else {
            // Component unmounted while setting up, clean up immediately
            unlisten();
          }
        } catch (error) {
          console.error('[UnifiedAgenticChat] Failed to setup listener:', error);
        }
      };

      const getConversationMessagesForStream = (conversationId: number) => {
        const state = useUnifiedChatStore.getState();

        if (
          state.activeConversationId &&
          uuidToDbId(state.activeConversationId) === conversationId
        ) {
          return state.messages;
        }

        const matchingConversationId = Object.keys(state.messagesByConversation).find(
          (id) => uuidToDbId(id) === conversationId,
        );

        if (matchingConversationId) {
          return state.messagesByConversation[matchingConversationId] ?? [];
        }

        return [];
      };

      const findMessageById = (messageId: string) => {
        const state = useUnifiedChatStore.getState();
        const direct = state.messages.find((msg) => msg.id === messageId);
        if (direct) return direct;

        for (const messages of Object.values(state.messagesByConversation)) {
          const found = messages.find((msg) => msg.id === messageId);
          if (found) return found;
        }
        return null;
      };

      const resolveStreamTargetMessageId = (
        conversationId: number,
        payloadMessageId?: string | number,
      ): string | null => {
        const state = useUnifiedChatStore.getState();
        const conversationMessages = getConversationMessagesForStream(conversationId);
        const sessionMessageId = activeStreamSessionsRef.current.get(conversationId);
        const normalizedPayloadId =
          payloadMessageId === undefined || payloadMessageId === null
            ? null
            : String(payloadMessageId);

        // Priority 1: Session-tracked message for this conversation
        if (sessionMessageId && conversationMessages.some((m) => m.id === sessionMessageId)) {
          return sessionMessageId;
        }
        // Priority 2: Explicit message ID from payload
        if (
          normalizedPayloadId &&
          conversationMessages.some((m) => String(m.id) === normalizedPayloadId)
        ) {
          return normalizedPayloadId;
        }
        // Priority 3: Current streaming message (only if it belongs to this conversation)
        if (
          state.currentStreamingMessageId &&
          conversationMessages.some((m) => String(m.id) === String(state.currentStreamingMessageId))
        ) {
          return state.currentStreamingMessageId;
        }

        // Priority 4: find an assistant message still marked streaming in this conversation.
        if (conversationMessages.length > 0) {
          const streamingAssistant = conversationMessages.find(
            (m) => m.role === 'assistant' && m.metadata?.streaming,
          );
          if (streamingAssistant) {
            return streamingAssistant.id;
          }
        }

        // Priority 5 (global fallback): conversation ID mapping may not exist yet (race
        // between stream events and the linkConversationId call that follows ipcInvoke).
        // The Rust backend always uses the frontend-assigned UUID as message_id, so a
        // global store search by that ID is always safe and never causes cross-conversation
        // confusion (UUIDs are unique).
        if (sessionMessageId && findMessageById(sessionMessageId)) {
          return sessionMessageId;
        }
        if (normalizedPayloadId && findMessageById(normalizedPayloadId)) {
          return normalizedPayloadId;
        }

        return null;
      };

      const upsertToolArtifact = (
        conversationId: number,
        toolCallId: string,
        patch: Record<string, unknown>,
        payloadMessageId?: string | number,
      ) => {
        const state = useUnifiedChatStore.getState();
        const targetMessageId = resolveStreamTargetMessageId(conversationId, payloadMessageId);
        if (!targetMessageId) {
          console.warn('[upsertToolArtifact] No target message found for toolCallId:', toolCallId);
          return;
        }

        const targetMessage = findMessageById(targetMessageId);
        if (!targetMessage) {
          console.warn('[upsertToolArtifact] Message not found for id:', targetMessageId);
          return;
        }

        const baseArtifacts = [
          ...(targetMessage.artifacts || []),
          ...(((targetMessage.metadata?.artifacts as Artifact[] | undefined) || []).filter(
            (artifact) =>
              !targetMessage.artifacts?.some(
                (existing) => existing.id === artifact.id || existing.content === artifact.content,
              ),
          ) as Artifact[]),
        ] as Artifact[];

        const index = baseArtifacts.findIndex((artifact) => artifact.id === toolCallId);
        const existing = index >= 0 ? baseArtifacts[index] : null;
        const patchToolName = String(
          patch['toolName'] || (existing as Record<string, unknown> | null)?.['toolName'] || 'code',
        );
        const patchContent = String(
          patch['content'] || (existing as Record<string, unknown> | null)?.['content'] || '',
        );
        const nextArtifact = {
          id: toolCallId,
          type: toolNameToArtifactType(patchToolName),
          title: toolNameToTitle(patchToolName),
          content: patchContent,
          ...existing,
          ...patch,
        };

        const nextArtifacts =
          index >= 0
            ? baseArtifacts.map((artifact, i) => (i === index ? nextArtifact : artifact))
            : [...baseArtifacts, nextArtifact];

        state.updateMessage(targetMessageId, {
          artifacts: nextArtifacts as Artifact[],
          metadata: {
            artifacts: nextArtifacts as Artifact[],
          },
        });
      };

      const finalizeRunningArtifactsForMessage = (
        messageId: string,
        status: 'completed' | 'failed' | 'cancelled',
        reason: string,
      ) => {
        const state = useUnifiedChatStore.getState();
        const targetMessage = findMessageById(messageId);
        if (!targetMessage) return;

        const baseArtifacts = [
          ...(targetMessage.artifacts || []),
          ...(((targetMessage.metadata?.artifacts as Artifact[] | undefined) || []).filter(
            (artifact) =>
              !targetMessage.artifacts?.some(
                (existing) => existing.id === artifact.id || existing.content === artifact.content,
              ),
          ) as Artifact[]),
        ] as Artifact[];
        if (baseArtifacts.length === 0) return;

        let changed = false;
        const nextArtifacts = baseArtifacts.map((artifact) => {
          const withRuntimeFields = artifact as Artifact & {
            status?: string;
            success?: boolean;
            error?: string;
            content?: string;
          };
          if (withRuntimeFields.status !== 'running') {
            return artifact;
          }
          changed = true;
          const currentContent = (withRuntimeFields.content || '').trim();
          if (status === 'completed') {
            return {
              ...withRuntimeFields,
              status: 'completed',
              success: true,
              content: currentContent || 'Tool completed. Output included in assistant response.',
            } as Artifact;
          }
          if (status === 'cancelled') {
            return {
              ...withRuntimeFields,
              status: 'cancelled',
              success: false,
              error: reason,
              content: currentContent || reason,
            } as Artifact;
          }
          return {
            ...withRuntimeFields,
            status: 'failed',
            success: false,
            error: reason,
            content: currentContent || reason,
          } as Artifact;
        });

        if (!changed) return;
        state.updateMessage(messageId, {
          artifacts: nextArtifacts as Artifact[],
          metadata: {
            artifacts: nextArtifacts as Artifact[],
          },
        });
      };

      const clearAgentIterationEntries = () => {
        const state = useUnifiedChatStore.getState();
        const entriesToRemove = state.actionTrail.filter((entry) => {
          if (entry.type !== 'running') return false;
          const metadata = entry.metadata as Record<string, unknown> | undefined;
          if (metadata?.['agent_progress'] === true) return true;
          return entry.message.startsWith('Agent iteration ');
        });
        for (const entry of entriesToRemove) {
          state.removeActionTrailEntry(entry.id);
        }
      };

      const clearToolExecutionTimeout = (toolCallId: string) => {
        const timeoutEntry = toolExecutionTimeoutsRef.current.get(toolCallId);
        if (timeoutEntry) {
          clearTimeout(timeoutEntry.softTimeoutId);
          clearTimeout(timeoutEntry.hardTimeoutId);
          toolExecutionTimeoutsRef.current.delete(toolCallId);
        }
      };

      const clearToolExecutionTimeoutsForConversation = (conversationId: number) => {
        for (const [toolCallId, timeoutEntry] of toolExecutionTimeoutsRef.current.entries()) {
          if (timeoutEntry.conversationId !== conversationId) {
            continue;
          }
          clearTimeout(timeoutEntry.softTimeoutId);
          clearTimeout(timeoutEntry.hardTimeoutId);
          toolExecutionTimeoutsRef.current.delete(toolCallId);
        }
      };

      const syncGlobalStreamingState = () => {
        const state = useUnifiedChatStore.getState();
        const activeConversationDbId = state.activeConversationId
          ? uuidToDbId(state.activeConversationId)
          : undefined;
        const activeConversationStreamId =
          typeof activeConversationDbId === 'number'
            ? (activeStreamSessionsRef.current.get(activeConversationDbId) ?? null)
            : null;
        const streamSessionValues = [...activeStreamSessionsRef.current.values()];
        const fallbackStreamId =
          streamSessionValues.length > 0
            ? streamSessionValues[streamSessionValues.length - 1]!
            : null;
        const nextStreamingMessageId = activeConversationStreamId ?? fallbackStreamId;

        state.setIsLoading(nextStreamingMessageId !== null);
        state.setStreamingMessage(nextStreamingMessageId);
      };

      const scheduleToolExecutionTimeout = (
        toolCallId: string,
        toolName: string,
        conversationId: number,
        resetExisting: boolean,
        payloadMessageId?: string | number,
      ) => {
        if (resetExisting) {
          clearToolExecutionTimeout(toolCallId);
        } else if (toolExecutionTimeoutsRef.current.has(toolCallId)) {
          return;
        }

        const toolHardTimeoutMs = resolveToolHardTimeoutMs(toolName);
        const softTimeoutId = setTimeout(() => {
          if (!isMountedRef.current) return;
          if (!toolExecutionTimeoutsRef.current.has(toolCallId)) return;

          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'running',
            message: `${toolName} is still running... retrying status check`,
            metadata: {
              tool_call_id: toolCallId,
              timeout_ms: TOOL_EXECUTION_SOFT_TIMEOUT_MS,
            },
            fadeAfter: 3500,
          });
        }, TOOL_EXECUTION_SOFT_TIMEOUT_MS);

        const hardTimeoutId = setTimeout(() => {
          if (!isMountedRef.current) return;
          if (!toolExecutionTimeoutsRef.current.has(toolCallId)) return;

          console.warn(
            `[UnifiedAgenticChat] Tool execution timed out: ${toolName} (${toolCallId})`,
          );
          const timeoutMessage =
            'Tool is taking longer than expected. Waiting for a final result from the agent.';
          const abortOnTimeout = shouldAbortGenerationOnToolTimeout(toolName);

          if (abortOnTimeout) {
            upsertToolArtifact(
              conversationId,
              toolCallId,
              {
                toolName,
                type: toolNameToArtifactType(toolName),
                title: toolNameToTitle(toolName),
                status: 'failed',
                success: false,
                error:
                  'Tool timed out waiting for completion. Please retry the request or narrow the operation scope.',
                content:
                  'Tool timed out waiting for completion. Please retry the request or narrow the operation scope.',
              },
              payloadMessageId,
            );
            useUnifiedChatStore.getState().addActionTrailEntry({
              type: 'error',
              message: `${toolName} timed out after ${Math.round(toolHardTimeoutMs / 1000)}s`,
              metadata: {
                tool_call_id: toolCallId,
                timeout_ms: toolHardTimeoutMs,
              },
              fadeAfter: 4500,
            });

            const state = useUnifiedChatStore.getState();
            const conversationStreamMessageId =
              activeStreamSessionsRef.current.get(conversationId) ?? null;
            if (conversationStreamMessageId) {
              clearQueuedStreamUpdates(conversationStreamMessageId);
              state.updateMessage(conversationStreamMessageId, {
                metadata: { streaming: false },
              });
            }
            activeStreamSessionsRef.current.delete(conversationId);
            clearToolExecutionTimeoutsForConversation(conversationId);
            syncGlobalStreamingState();
            if (isTauri) {
              void ipcInvoke('chat_stop_generation', { conversationId }).catch((error: unknown) => {
                console.warn(
                  '[UnifiedAgenticChat] Failed to stop generation after tool timeout:',
                  error,
                );
              });
            }
          } else {
            upsertToolArtifact(
              conversationId,
              toolCallId,
              {
                toolName,
                type: toolNameToArtifactType(toolName),
                title: toolNameToTitle(toolName),
                status: 'running',
                success: undefined,
                content: timeoutMessage,
                timeoutWarning: true,
              },
              payloadMessageId,
            );
            useUnifiedChatStore.getState().addActionTrailEntry({
              type: 'running',
              message: `${toolName} is taking longer than expected. Waiting for completion...`,
              metadata: {
                tool_call_id: toolCallId,
                timeout_ms: toolHardTimeoutMs,
                timeout_warning: true,
              },
              fadeAfter: 5000,
            });
          }
          clearToolExecutionTimeout(toolCallId);
        }, toolHardTimeoutMs);

        toolExecutionTimeoutsRef.current.set(toolCallId, {
          conversationId,
          softTimeoutId,
          hardTimeoutId,
        });
      };

      /**
       * Shared stream teardown helper extracted from stream-end and stream-error handlers.
       * Clears queued updates, abort controller, loading state, tool timeouts, and agent status.
       */
      const finalizeStream = (
        conversationId: number,
        finalizedMessageId: string | null,
        agentOutcome: 'completed' | 'failed',
        agentError?: string,
      ) => {
        if (finalizedMessageId) {
          clearQueuedStreamUpdates(finalizedMessageId);
        } else {
          clearQueuedStreamUpdates();
        }
        abortControllerRef.current = null;

        clearToolExecutionTimeoutsForConversation(conversationId);
        syncGlobalStreamingState();

        const currentAgent = useUnifiedChatStore.getState().agentStatus;
        if (currentAgent?.status === 'running') {
          useUnifiedChatStore.getState().setAgentStatus({
            ...currentAgent,
            status: agentOutcome,
            completedAt: new Date(),
            ...(agentOutcome === 'failed' && agentError ? { error: agentError } : {}),
          });
        }
        clearAgentIterationEntries();
      };

      registerListener(
        listen<{ conversation_id: number; message_id: string | number; created_at: string }>(
          'chat:stream-start',
          ({ payload }) => {
            if (!isMountedRef.current) return;
            markStreamActivity();

            // Create new AbortController for this streaming session
            // This allows handleStopGeneration to cancel the current stream
            abortControllerRef.current = new AbortController();

            // CHT-005 fix: Register this stream session with conversation-to-message mapping
            // This prevents race conditions when multiple streams are active
            const messageId = String(payload.message_id);
            activeStreamSessionsRef.current.set(payload.conversation_id, messageId);

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
          markStreamActivity();
          const authoritativeId = resolveStreamTargetMessageId(
            payload.conversation_id,
            payload.message_id,
          );

          if (authoritativeId) {
            queueStreamUpdate(authoritativeId, payload.content);
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
          markStreamActivity();
          const state = useUnifiedChatStore.getState();
          const messageId = String(payload.message_id);
          const currentStreamingId = state.currentStreamingMessageId;

          // CHT-005 fix: Use session tracking for reliable message identification
          const sessionMessageId = activeStreamSessionsRef.current.get(payload.conversation_id);
          const targetId = resolveStreamTargetMessageId(
            payload.conversation_id,
            payload.message_id,
          );
          const currentMatchesSession =
            !!currentStreamingId &&
            (currentStreamingId === sessionMessageId || currentStreamingId === messageId);
          let finalizedMessageId: string | null = null;
          let hasValidTarget = targetId !== null || currentMatchesSession;

          // AUDIT-STREAM-033 fix: Only clear global state if we have a valid target
          // This prevents stale stream-end events from one conversation clearing
          // active loading state for a different in-flight chat
          if (targetId) {
            finalizedMessageId = targetId;
            state.updateMessage(targetId, {
              metadata: {
                streaming: false,
                tokenCount: payload.usage?.total_tokens,
                cost: payload.credits?.cost_cents ? payload.credits.cost_cents / 100 : undefined,
              },
            });
            finalizeRunningArtifactsForMessage(
              targetId,
              'completed',
              'Tool completed without explicit terminal event.',
            );
          } else if (currentStreamingId && currentMatchesSession) {
            finalizedMessageId = currentStreamingId;
            state.updateMessage(currentStreamingId, {
              metadata: {
                streaming: false,
                tokenCount: payload.usage?.total_tokens,
                cost: payload.credits?.cost_cents ? payload.credits.cost_cents / 100 : undefined,
              },
            });
            finalizeRunningArtifactsForMessage(
              currentStreamingId,
              'completed',
              'Tool completed without explicit terminal event.',
            );
          } else {
            // Fallback: clear any assistant message still marked as streaming to
            // avoid stale "Generating" UI when stream-end IDs don't resolve cleanly.
            const fallbackStreaming = [...getConversationMessagesForStream(payload.conversation_id)]
              .reverse()
              .find((m) => m.role === 'assistant' && m.metadata?.streaming);
            if (fallbackStreaming) {
              finalizedMessageId = fallbackStreaming.id;
              hasValidTarget = true;
              state.updateMessage(fallbackStreaming.id, {
                metadata: {
                  streaming: false,
                  tokenCount: payload.usage?.total_tokens,
                  cost: payload.credits?.cost_cents ? payload.credits.cost_cents / 100 : undefined,
                },
              });
              finalizeRunningArtifactsForMessage(
                fallbackStreaming.id,
                'completed',
                'Tool completed without explicit terminal event.',
              );
            }
          }

          // CHT-005 fix: Clean up stream session tracking
          activeStreamSessionsRef.current.delete(payload.conversation_id);

          // AUDIT-STREAM-059 fix: Clear the stream watchdog since we got a valid stream-end
          if (streamWatchdogTimeoutRef.current) {
            clearTimeout(streamWatchdogTimeoutRef.current);
            streamWatchdogTimeoutRef.current = null;
          }

          // Update billing store with new credit info
          if (payload.credits) {
            useBillingStore.getState().updateCredits(payload.credits);
          }

          const hasOtherActiveStreams = activeStreamSessionsRef.current.size > 0;
          const shouldClearGlobalState = hasValidTarget || !hasOtherActiveStreams;

          if (!hasValidTarget) {
            console.warn(
              '[UnifiedAgenticChat] stream-end received without valid target; applying fallback cleanup policy',
              {
                payloadMessageId: messageId,
                sessionMessageId,
                currentStreamingId,
                finalizedMessageId,
                hasOtherActiveStreams,
              },
            );
          }

          if (shouldClearGlobalState) {
            finalizeStream(payload.conversation_id, finalizedMessageId, 'completed');
          }
        }),
      );

      // Listen for stream errors
      registerListener(
        listen<{ conversation_id: number; message_id: string | number; error: string }>(
          'chat:stream-error',
          ({ payload }) => {
            markStreamActivity();
            const state = useUnifiedChatStore.getState();
            const messageId = String(payload.message_id);
            const currentStreamingId = state.currentStreamingMessageId;

            // CHT-005 fix: Use session tracking for reliable message identification
            const sessionMessageId = activeStreamSessionsRef.current.get(payload.conversation_id);
            const targetId = resolveStreamTargetMessageId(
              payload.conversation_id,
              payload.message_id,
            );
            const currentMatchesSession =
              !!currentStreamingId &&
              (currentStreamingId === sessionMessageId || currentStreamingId === messageId);

            // AUDIT-STREAM-033 fix: Only clear global state if we have a valid target
            let hasValidTarget = targetId !== null || currentMatchesSession;
            let finalizedMessageId: string | null = null;

            if (targetId) {
              finalizedMessageId = targetId;
              // Always use friendly error messages — no raw error strings in the UI
              const displayError = formatErrorForChat(payload.error, true);

              state.updateMessage(targetId, {
                content: displayError,
                metadata: { streaming: false },
                error: payload.error,
              });
              finalizeRunningArtifactsForMessage(
                targetId,
                'failed',
                payload.error || 'Tool failed while generating the response.',
              );
            } else if (currentStreamingId && currentMatchesSession) {
              finalizedMessageId = currentStreamingId;
              const displayError = formatErrorForChat(payload.error, true);

              state.updateMessage(currentStreamingId, {
                content: displayError,
                metadata: { streaming: false },
                error: payload.error,
              });
              finalizeRunningArtifactsForMessage(
                currentStreamingId,
                'failed',
                payload.error || 'Tool failed while generating the response.',
              );
            } else {
              // Fallback: clear any assistant message still marked as streaming to
              // avoid stale "Generating" UI when stream-error IDs don't resolve cleanly.
              const fallbackStreaming = [
                ...getConversationMessagesForStream(payload.conversation_id),
              ]
                .reverse()
                .find((m) => m.role === 'assistant' && m.metadata?.streaming);
              if (fallbackStreaming) {
                finalizedMessageId = fallbackStreaming.id;
                hasValidTarget = true;
                const displayError = formatErrorForChat(payload.error, true);
                state.updateMessage(fallbackStreaming.id, {
                  content: displayError,
                  metadata: { streaming: false },
                  error: payload.error,
                });
                finalizeRunningArtifactsForMessage(
                  fallbackStreaming.id,
                  'failed',
                  payload.error || 'Tool failed while generating the response.',
                );
              }
            }

            // CHT-005 fix: Clean up stream session tracking on error
            activeStreamSessionsRef.current.delete(payload.conversation_id);

            // AUDIT-STREAM-059 fix: Clear the stream watchdog since we got a valid stream-error
            if (streamWatchdogTimeoutRef.current) {
              clearTimeout(streamWatchdogTimeoutRef.current);
              streamWatchdogTimeoutRef.current = null;
            }

            const hasOtherActiveStreams = activeStreamSessionsRef.current.size > 0;
            const shouldClearGlobalState = hasValidTarget || !hasOtherActiveStreams;

            if (!hasValidTarget) {
              console.warn(
                '[UnifiedAgenticChat] stream-error received without valid target; applying fallback cleanup policy',
                {
                  payloadMessageId: messageId,
                  sessionMessageId,
                  currentStreamingId,
                  finalizedMessageId,
                  hasOtherActiveStreams,
                },
              );
            }

            if (shouldClearGlobalState) {
              finalizeStream(payload.conversation_id, finalizedMessageId, 'failed', payload.error);
            }
          },
        ),
      );

      // Pending message event listeners
      registerListener(
        listen<{ id: string; content: string; timestamp: string; conversation_id?: number }>(
          'chat:pending-message-added',
          ({ payload }) => {
            useUnifiedChatStore.getState().addPendingMessage(payload);
          },
        ),
      );

      registerListener(
        listen<{ message: { id: string; content: string }; remaining: number }>(
          'chat:pending-message-consumed',
          ({ payload }) => {
            useUnifiedChatStore.getState().removePendingMessage(payload.message.id);
          },
        ),
      );

      registerListener(
        listen<{ count: number }>('chat:pending-messages-cleared', () => {
          useUnifiedChatStore.getState().clearPendingMessages();
        }),
      );

      registerListener(
        listen<{
          pending_messages: Array<{ id: string; content: string }>;
          current_tool?: string;
          current_phase?: string;
          count: number;
        }>('chat:pending-context-available', () => {
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
          // Auto-process pending messages by sending them as follow-up
          // This creates a seamless experience where queued messages are automatically sent
          // Process messages sequentially with delays to avoid race conditions
          for (let i = 0; i < payload.pending_messages.length; i++) {
            // Check if component is still mounted before processing each message
            if (!isMountedRef.current) {
              break;
            }

            const pending = payload.pending_messages[i];
            if (!pending) continue;

            // Actually send the pending message as a follow-up
            // Add delay between messages to avoid race conditions
            if (i > 0) {
              await new Promise((resolve) => setTimeout(resolve, 500));
            }

            try {
              // Dispatch a custom event that ChatInputArea listens to for auto-send
              window.dispatchEvent(
                new CustomEvent('chat:auto-send-pending', {
                  detail: {
                    pendingMessage: {
                      ...pending,
                      conversation_id: payload.conversation_id,
                    },
                  },
                }),
              );
            } catch (err) {
              console.error('[UnifiedAgenticChat] Failed to send pending message:', err);
              // CHT-002 fix: Show user-visible error for pending message send failure
              toast({
                variant: 'destructive',
                title: 'Failed to send queued message. Please try again.',
              });
            }
          }
        }),
      );

      // Listen for agent thinking state
      registerListener(
        listen<{ agent_id?: string; thinking: boolean; phase?: string; message?: string }>(
          'agent:thinking',
          ({ payload }) => {
            const chatState = useUnifiedChatStore.getState();

            // Update action trail with thinking status
            if (payload.thinking) {
              chatState.addActionTrailEntry({
                type: 'thinking',
                message: payload.message || payload.phase || 'Thinking...',
                fadeAfter: 30000, // Fade after 30 seconds if not cleared
                metadata: {
                  source: AGENT_THINKING_ACTION_SOURCE,
                  ...(payload.agent_id ? { agentId: payload.agent_id } : {}),
                },
              });
              return;
            }

            const matchingEntry =
              [...chatState.getActiveActionTrail()].reverse().find((entry) => {
                if (entry.type !== 'thinking') {
                  return false;
                }

                const metadataSource = entry.metadata?.['source'];
                const metadataAgentId = entry.metadata?.['agentId'];

                if (metadataSource === AGENT_THINKING_ACTION_SOURCE) {
                  return payload.agent_id === undefined || metadataAgentId === payload.agent_id;
                }

                // Fallback for stale pre-patch entries that did not tag the source.
                return payload.agent_id === undefined;
              }) ?? null;

            if (matchingEntry) {
              chatState.removeActionTrailEntry(matchingEntry.id);
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
          // Update action trail with completion status
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: payload.success ? 'completed' : 'error',
            message: payload.success
              ? payload.result || 'Task completed successfully'
              : payload.error || 'Task failed',
            fadeAfter: 5000,
            metadata: { duration_ms: payload.duration_ms },
          });

          // Clear any running agent status
          // Note: agent:finished event may not fire in all cases, so we also clear on tool result
          const currentAgent = useUnifiedChatStore.getState().agentStatus;
          if (currentAgent && currentAgent.status === 'running') {
            useUnifiedChatStore.getState().setAgentStatus({
              ...currentAgent,
              status: payload.success ? 'completed' : 'failed',
              completedAt: new Date(),
              error: payload.error,
            });
          }
          clearAgentIterationEntries();
        }),
      );

      // Listen for extended thinking events (thinking:event from ThinkingState)
      // event_type: "start" | "delta" | "complete"
      registerListener(
        listen<{
          event_type: 'start' | 'delta' | 'complete';
          content: string;
          message_id?: string | null;
          tokens?: number | null;
          timestamp: number;
        }>('thinking:event', ({ payload }) => {
          if (!isMountedRef.current) return;
          markStreamActivity();

          // Resolve which message this thinking belongs to
          const activeStreamValues = [...activeStreamSessionsRef.current.values()];
          const targetMessageId =
            (payload.message_id ? String(payload.message_id) : null) ??
            (activeStreamValues.length > 0
              ? activeStreamValues[activeStreamValues.length - 1]!
              : null);

          if (!targetMessageId) return;

          const chatState = useChatStore.getState();

          if (payload.event_type === 'start') {
            chatState.clearThinkingContent(targetMessageId);
          } else if (payload.event_type === 'delta' && payload.content) {
            chatState.appendThinkingContent(targetMessageId, payload.content);
          } else if (payload.event_type === 'complete' && payload.content) {
            // On complete, replace accumulated content with the final authoritative string
            chatState.clearThinkingContent(targetMessageId);
            chatState.appendThinkingContent(targetMessageId, payload.content);
          }
        }),
      );

      // AUDIT-APPROVAL-047 fix: Removed duplicate tool:confirmation_required handler.
      // The tool confirmation flow is now handled exclusively by useAgenticEvents which
      // adds approvals to pendingApprovals store. The ApprovalModal then handles
      // user responses via useApprovalActions, which correctly routes to either
      // respond_tool_confirmation (for MCP/tool confirmations) or agent_resolve_approval
      // (for agent-level approvals).

      // Tool execution event listeners - display tool calls in the UI
      registerListener(
        listen<{
          conversation_id: number;
          message_id?: string | number;
          tool_calls: Array<{
            index: number;
            id: string;
            name: string;
            arguments: string;
          }>;
          streaming: boolean;
        }>('chat:tool-calls', ({ payload }) => {
          markStreamActivity();

          // CHT-009 fix: Update message metadata so MessageBubble renders the ToolCallCard
          // Find the target message
          const state = useUnifiedChatStore.getState();
          // Resolve deterministically: stream session map first, then explicit payload.message_id.

          const targetMessageId = resolveStreamTargetMessageId(
            payload.conversation_id,
            payload.message_id,
          );

          // If we found a target message, update its metadata
          if (targetMessageId) {
            const firstTool = payload.tool_calls[0];
            if (firstTool) {
              const normalizedFirstToolName = normalizeToolNameForUi(firstTool.name);
              state.updateMessage(targetMessageId, {
                metadata: {
                  // key fields for MessageBubble to detect tool call
                  tool: normalizedFirstToolName,
                  tool_call: firstTool.id,
                  actionId: firstTool.id, // AUDIT-UI-035: Add actionId for MessageBubble store linkage
                  name: normalizedFirstToolName,
                  status: 'running',
                  // also keep streaming true so it shows as active
                  streaming: true,
                },
              });
            }
          }

          // Add to action trail to show which tools are being called
          for (const tc of payload.tool_calls) {
            const normalizedToolName = normalizeToolNameForUi(tc.name);
            let parsedArguments: Record<string, unknown> = {};
            try {
              parsedArguments = tc.arguments
                ? (JSON.parse(tc.arguments) as Record<string, unknown>)
                : {};
            } catch {
              // Keep fallback empty object if arguments are partial/non-JSON.
            }

            upsertToolArtifact(
              payload.conversation_id,
              tc.id,
              {
                toolName: normalizedToolName, // Use normalized tool names for renderer lookups
                type: toolNameToArtifactType(normalizedToolName),
                title: toolNameToTitle(normalizedToolName),
                status: 'running',
                content: '',
                ...(parsedArguments['prompt'] ? { prompt: parsedArguments['prompt'] } : {}),
                ...(parsedArguments['output_path']
                  ? { filePath: parsedArguments['output_path'] }
                  : {}),
                ...(parsedArguments['file_path'] ? { filePath: parsedArguments['file_path'] } : {}),
              },
              payload.message_id,
            );

            useUnifiedChatStore.getState().addActionTrailEntry({
              type: 'running',
              message: `Calling ${normalizedToolName}...`,
              metadata: { tool_call_id: tc.id, arguments: tc.arguments },
            });

            // Guard against dropped/missed `chat:tool-executing` events.
            // We start a timeout here as a fallback so every running tool resolves.
            scheduleToolExecutionTimeout(
              tc.id,
              normalizedToolName,
              payload.conversation_id,
              false,
              payload.message_id,
            );
          }
        }),
      );

      registerListener(
        listen<{
          conversation_id: number;
          message_id?: string | number;
          tool_call_id: string;
          tool_name: string;
          arguments: string;
        }>('chat:tool-executing', ({ payload }) => {
          markStreamActivity();
          const normalizedToolName = normalizeToolNameForUi(payload.tool_name);
          scheduleToolExecutionTimeout(
            payload.tool_call_id,
            normalizedToolName,
            payload.conversation_id,
            true,
            payload.message_id,
          );

          // Update action trail with executing status
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'running',
            message: `Executing ${normalizedToolName}...`,
            metadata: { tool_call_id: payload.tool_call_id },
          });
        }),
      );

      // Listen for agent progress events (iteration tracking for OpenClaw-style runs)
      registerListener(
        listen<{
          conversation_id: number;
          iteration: number;
          max_iterations: number;
          status: string;
          tool_count?: number;
        }>('chat:agent-progress', ({ payload }) => {
          markStreamActivity();
          clearAgentIterationEntries();
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: payload.status === 'limit_reached' ? 'error' : 'running',
            message:
              payload.status === 'limit_reached'
                ? `Agent reached iteration limit (${payload.max_iterations})`
                : `Agent iteration ${payload.iteration}/${payload.max_iterations}${payload.tool_count ? ` — ${payload.tool_count} tool(s)` : ''}`,
            metadata: {
              agent_progress: true,
              iteration: payload.iteration,
              max_iterations: payload.max_iterations,
            },
            fadeAfter: payload.status === 'limit_reached' ? 5000 : 60000,
          });
        }),
      );

      registerListener(
        listen<{
          conversation_id: number;
          message_id?: string | number;
          tool_call_id: string;
          tool_name: string;
          success: boolean;
          result: string;
          result_data?: Record<string, unknown>;
        }>('chat:tool-result', ({ payload }) => {
          markStreamActivity();
          const normalizedToolName = normalizeToolNameForUi(payload.tool_name);
          clearToolExecutionTimeout(payload.tool_call_id);

          let parsedData: Record<string, unknown> = payload.result_data || {};
          if (!payload.result_data && payload.result) {
            try {
              const parsed = JSON.parse(payload.result);
              if (parsed && typeof parsed === 'object') {
                parsedData = parsed as Record<string, unknown>;
              }
            } catch {
              // Keep raw string available so inline renderers can still display content.
              parsedData = { raw_result: payload.result };
            }
          }

          const normalizedData = normalizeInlineToolData(normalizedToolName, parsedData);

          upsertToolArtifact(
            payload.conversation_id,
            payload.tool_call_id,
            {
              toolName: normalizedToolName,
              type: toolNameToArtifactType(normalizedToolName),
              title: toolNameToTitle(normalizedToolName),
              status: payload.success ? 'completed' : 'failed',
              success: payload.success,
              error: payload.success ? undefined : payload.result,
              content: payload.result || '',
              ...normalizedData,
            },
            payload.message_id,
          );

          // AUDIT-UI-034: Update message metadata status when tool result arrives
          // This ensures the tool card transitions from "running" to "completed/failed"
          const targetMessageId = resolveStreamTargetMessageId(
            payload.conversation_id,
            payload.message_id,
          );
          if (targetMessageId) {
            useUnifiedChatStore.getState().updateMessage(targetMessageId, {
              metadata: {
                status: payload.success ? 'completed' : 'failed',
                streaming: false, // Stop streaming indicator
              },
            });
          }

          // Update action trail with result
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: payload.success ? 'completed' : 'error',
            message: payload.success
              ? `${normalizedToolName} completed`
              : `${normalizedToolName} failed`,
            metadata: { tool_call_id: payload.tool_call_id, result_preview: payload.result },
            fadeAfter: 3000,
          });

          // Remove the old "running" entry for this tool_call_id to prevent "Running..." from staying
          const state = useUnifiedChatStore.getState();
          const actionTrail = state.actionTrail;
          const runningEntries = actionTrail.filter((entry) => {
            if (entry.type !== 'running') return false;
            const metadataToolCallId = (entry.metadata as Record<string, unknown> | undefined)?.[
              'tool_call_id'
            ];
            if (metadataToolCallId === payload.tool_call_id) return true;
            // Backward compatibility: clear legacy running entries that were added without metadata.
            return (
              entry.message === `Executing ${normalizedToolName}...` ||
              entry.message === `Calling ${normalizedToolName}...`
            );
          });
          for (const runningEntry of runningEntries) {
            state.removeActionTrailEntry(runningEntry.id);
          }

          // Keep agent status coherent during multi-step runs:
          // a single tool result should update step text, not mark the whole run complete.
          const currentAgent = useUnifiedChatStore.getState().agentStatus;
          if (currentAgent && currentAgent.status === 'running') {
            useUnifiedChatStore.getState().setAgentStatus({
              ...currentAgent,
              currentStep: payload.success
                ? `Completed ${normalizedToolName}`
                : `Failed ${normalizedToolName}`,
            });
          }
        }),
      );

      // AUDIT-STREAM-022 fix: Listen for agi:tool_stream cancelled events
      // This ensures cancellation is properly handled for both event channels:
      // - agi:tool_stream (handled by useAgenticEvents.ts via activeToolStreams)
      // - chat:tool-* (handled here for UI updates)
      registerListener(
        listen<{
          event: {
            type: string;
            tool_id: string;
            reason?: string;
            duration_ms: number;
          };
          timestamp: string;
        }>('agi:tool_stream', (event) => {
          if (!isMountedRef.current) return;
          const { event: streamEvent, timestamp } = event.payload;

          // Mark activity on every AGI tool stream event so the watchdog
          // doesn't fire during long-running tools (e.g. image generation 30-90s)
          markStreamActivity();

          // Only handle cancelled events for cancellation cleanup
          if (streamEvent.type !== 'cancelled') return;

          const cancelledEvent = streamEvent as {
            type: 'cancelled';
            tool_id: string;
            reason?: string;
            duration_ms: number;
          };

          // Clear any tool execution timeout that might be pending
          clearToolExecutionTimeout(cancelledEvent.tool_id);

          // Update action trail to reflect cancellation
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'error',
            message: `Tool cancelled: ${cancelledEvent.reason || 'Cancelled by user'}`,
            metadata: { tool_call_id: cancelledEvent.tool_id },
            fadeAfter: 3000,
          });

          // Update message metadata to reflect cancelled status
          // We need to find the message that contains this tool's artifact
          const state = useUnifiedChatStore.getState();
          for (const message of state.messages) {
            const artifacts = message.artifacts || [];
            const artifactIndex = artifacts.findIndex((a) => a.id === cancelledEvent.tool_id);
            if (artifactIndex >= 0) {
              const existingArtifact = artifacts[artifactIndex];
              if (existingArtifact) {
                const updatedArtifact = {
                  ...existingArtifact,
                  metadata: {
                    ...existingArtifact.metadata,
                    status: 'cancelled',
                    error: cancelledEvent.reason,
                    completedAt: new Date(timestamp).toISOString(),
                    duration_ms: cancelledEvent.duration_ms,
                  },
                };
                const updatedArtifacts = [...artifacts];
                updatedArtifacts[artifactIndex] = updatedArtifact;

                state.updateMessage(message.id, {
                  artifacts: updatedArtifacts,
                  metadata: {
                    ...message.metadata,
                    artifacts: updatedArtifacts,
                    status: 'cancelled',
                    streaming: false,
                  },
                });
              }
              break;
            }
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

      // Tool progress events — show subtle progress indicators when media tools are processing
      registerListener(
        listen<{
          conversation_id: number;
          tool_name: string;
          status: string;
          message?: string;
        }>('chat:tool-progress', ({ payload }) => {
          if (payload.status !== 'processing_result') return;

          // Find the streaming message for this conversation and surface the progress hint
          const state = useUnifiedChatStore.getState();
          const currentId = state.currentStreamingMessageId;
          if (!currentId) return;

          const progressText =
            payload.message ?? `Processing ${payload.tool_name.replace(/_/g, ' ')}...`;

          state.updateMessage(currentId, {
            metadata: {
              status: 'tool_progress',
              label: progressText,
              streaming: true,
            },
          });
        }),
      );

      // Agent mode tool-blocked events — notify user when a tool is blocked by the current mode
      registerListener(
        listen<{ tool_name: string; mode: string }>('tool:blocked_by_mode', ({ payload }) => {
          sonnerToast.error(`Tool "${payload.tool_name}" is blocked in Safe mode`);
        }),
      );
    };

    // Start setting up listeners
    setupListeners().catch((error) => {
      console.error('[UnifiedAgenticChat] Failed to setup listeners:', error);
    });

    // Capture ref values inside the effect for safe cleanup
    const activeStreamSessions = activeStreamSessionsRef.current;

    return () => {
      // Mark as unmounted first to prevent new registrations
      isMountedRef.current = false;

      // Clean up RAF
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }

      // Abort any active streaming to prevent background work after unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      // Clear stale stream session tracking
      activeStreamSessions.clear();
      // Copy ref value to variable for cleanup to avoid stale closure issues
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const timeouts = new Map(toolExecutionTimeoutsRef.current);
      timeouts.forEach((timeoutEntry) => {
        clearTimeout(timeoutEntry.softTimeoutId);
        clearTimeout(timeoutEntry.hardTimeoutId);
      });
      timeouts.clear();

      // Clean up all registered listeners - handle both sync and async unlisten functions
      // Some Tauri listeners may return promises that need to be caught to avoid unhandled rejections
      const listeners = [...unlistenFnsRef.current];
      unlistenFnsRef.current = [];

      listeners.forEach((unlisten) => {
        try {
          const result = unlisten();
          // Handle async unlisten functions that return promises
          if (result && typeof result === 'object' && 'catch' in result) {
            (result as Promise<void>).catch((error) => {
              // Suppress "listeners[eventId].handleId" errors - these occur when
              // the event system is cleaning up during component unmount
              if (!String(error).includes('listeners[eventId]')) {
                console.warn('[UnifiedAgenticChat] Async listener cleanup warning:', error);
              }
            });
          }
        } catch (error) {
          // Suppress the specific Tauri internal error during cleanup
          if (!String(error).includes('listeners[eventId]')) {
            console.error('[UnifiedAgenticChat] Error during listener cleanup:', error);
          }
        }
      });
    };
    // AUDIT-005-014 fix: Remove stable store actions from dependency array
    // updateMessage and setStreamingMessage are stable zustand actions that don't change
    // Including them causes unnecessary re-registrations of event listeners
  }, [clearQueuedStreamUpdates, markStreamActivity, queueStreamUpdate]);

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
      } else {
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
          updateMessage(userMessageId, {
            error: errorMessage,
          });
        }
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
            conversation_id: conversationDbId,
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
            enableThinking: useModelStore.getState().thinkingModeEnabled,
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

  // CHT-001 fix: Wrap entire chat interface with error boundary to prevent crashes
  return (
    <ChatErrorBoundary>
      <div
        className={`unified-agentic-chat relative flex h-full min-h-0 flex-col overflow-hidden bg-[#05060b] ${layoutClasses[layout]} ${className}`}
      >
        <AppLayout>
          {activeView === 'chat' ? (
            <>
              {/* Header bar with background task indicator */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800/50">
                {/* Incognito mode indicator */}
                {isActiveConversationIncognito && (
                  <div className="flex items-center gap-1.5 text-violet-400 text-xs font-medium">
                    <EyeOff className="h-3.5 w-3.5" />
                    <span>Incognito — not saved to disk</span>
                  </div>
                )}
                <div className={!isActiveConversationIncognito ? 'ml-auto' : ''}>
                  <BackgroundTaskIndicator
                    popoverSide="bottom"
                    popoverAlign="end"
                    panelMaxHeight="350px"
                  />
                </div>
              </div>
              <BudgetAlertsPanel />
              <BudgetTracker />
              <SectionErrorBoundary
                sectionName="ChatStream"
                fallback={
                  <div className="flex-1 flex items-center justify-center p-8">
                    <div className="text-center">
                      <p className="text-zinc-400 mb-4">Failed to load chat messages</p>
                      <button
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
              {/* Pending queued messages — dimmed bubbles shown when agentic loop is active */}
              <PendingMessagesBubbles />
              {/* Status bar: shown while agentic loop is running, hidden otherwise */}
              <AgenticLoopStatusBar />
              <ChatInputArea onSend={handleSendMessage} onStopGeneration={handleStopGeneration} />
            </>
          ) : activeView === 'projects' ? (
            <ProjectsView />
          ) : activeView === 'artifacts' ? (
            <div className="flex-1 p-4">
              <CanvasWorkspace className="h-full" />
            </div>
          ) : activeView === 'help' ? (
            <div className="flex-1 overflow-auto p-4">
              <InteractiveHelp onClose={() => setActiveView('chat')} />
            </div>
          ) : null}
        </AppLayout>

        <ApprovalModal />

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

export default UnifiedAgenticChat;

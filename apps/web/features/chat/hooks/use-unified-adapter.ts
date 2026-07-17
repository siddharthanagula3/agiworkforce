/**
 * Unified Adapter Hooks
 *
 * Bridges the shape gap between the shared unified-chat store
 * (`@agiworkforce/unified-chat`) and the richer UI-adapter types used by
 * desktop-parity components.
 *
 * These are zero-cost reshaping adapters with no business logic.
 * All heavy state subscription is handled by the caller via useChatStore.
 */

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from '@agiworkforce/unified-chat';
import type { ChatMessage, Conversation } from '@agiworkforce/unified-chat';
import type { ToolExecution } from '@shared/stores/tool-store';
import { useModelStore } from '@shared/stores/model-store';

// ============================================================================
// Adapter Types
// ============================================================================

export interface AdaptedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  streaming?: boolean;
  metadata?: {
    tokensUsed?: number;
    model?: string;
    timestamp?: number;
  };
  thinking?: string;
  toolCalls?: AdaptedToolCall[];
}

export interface AdaptedToolCall {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  durationMs?: number;
  args?: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  lastMessage?: string;
  updatedAt: Date;
  messageCount: number;
  isPinned?: boolean;
  isArchived?: boolean;
}

export interface AdaptedToolEvent {
  id: string;
  toolName: string;
  displayName: string;
  status: 'running' | 'completed' | 'failed';
  durationMs?: number;
  input?: Record<string, unknown>;
  output?: unknown;
  error?: string;
  timestamp: Date;
}

export interface AdaptedModelState {
  selectedModelId: string;
  updateModel: (id: string) => void;
}

// ============================================================================
// Pure transformation functions (exported for testing)
// ============================================================================

export function adaptMessage(msg: ChatMessage): AdaptedMessage {
  const meta = msg.metadata as
    | {
        tools?: Array<{
          name: string;
          status: 'pending' | 'running' | 'completed' | 'failed';
          durationMs?: number;
          args?: string;
        }>;
        thinkingSteps?: string[];
        tokensUsed?: number;
        model?: string;
      }
    | undefined;

  const tools = meta?.tools;
  const thinkingSteps = meta?.thinkingSteps;
  const createdAtDate = msg.createdAt ? new Date(msg.createdAt) : new Date();

  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: createdAtDate,
    streaming: msg.isStreaming,
    metadata: {
      tokensUsed: meta?.tokensUsed,
      model: meta?.model,
      timestamp: createdAtDate.getTime(),
    },
    thinking: thinkingSteps && thinkingSteps.length > 0 ? thinkingSteps.join('\n') : undefined,
    toolCalls:
      tools && tools.length > 0
        ? tools.map((t) => ({
            name: t.name,
            status: t.status,
            durationMs: t.durationMs,
            args: t.args,
          }))
        : undefined,
  };
}

export function adaptConversation(conv: Conversation): ConversationSummary {
  return {
    id: conv.id,
    title: conv.title,
    lastMessage: conv.lastMessage,
    updatedAt: new Date(conv.updatedAt),
    messageCount: conv.messageCount ?? 0,
    isPinned: conv.pinned ?? false,
    isArchived: conv.archived ?? false,
  };
}

/** @deprecated Use adaptConversation. Kept for call-site compatibility. */
export const adaptSession = adaptConversation;

export function adaptToolExecution(exec: ToolExecution): AdaptedToolEvent {
  return {
    id: exec.id,
    toolName: exec.toolName,
    displayName: formatDisplayName(exec.toolName),
    status: exec.error ? 'failed' : exec.success ? 'completed' : 'running',
    durationMs: exec.duration,
    input: exec.input,
    output: exec.output,
    error: exec.error,
    timestamp: exec.timestamp,
  };
}

function formatDisplayName(toolName: string): string {
  // Convert snake_case or camelCase tool names to readable labels
  return toolName
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Adapts the active conversation's messages from ChatMessage[] to AdaptedMessage[].
 * Memoized - only recomputes when the raw messages array changes.
 */
export function useAdaptedMessages(): AdaptedMessage[] {
  const { activeConversationId, messagesByConversation } = useChatStore(
    useShallow((s) => ({
      activeConversationId: s.activeConversationId,
      messagesByConversation: s.messagesByConversation,
    })),
  );

  return useMemo(() => {
    if (!activeConversationId) return [];
    const raw = messagesByConversation[activeConversationId] ?? [];
    return raw.map(adaptMessage);
  }, [activeConversationId, messagesByConversation]);
}

/**
 * Adapts all conversations to ConversationSummary[].
 * Memoized - only recomputes when the conversations array changes.
 */
export function useAdaptedSessions(): ConversationSummary[] {
  const conversations = useChatStore(useShallow((s) => s.conversations));

  return useMemo(() => conversations.map(adaptConversation), [conversations]);
}

/**
 * Adapts a single conversation by id to ConversationSummary.
 * Returns null if the conversation is not found.
 */
export function useAdaptedSession(sessionId: string): ConversationSummary | null {
  const conversations = useChatStore(useShallow((s) => s.conversations));

  return useMemo(() => {
    const conv = conversations.find((c) => c.id === sessionId);
    return conv ? adaptConversation(conv) : null;
  }, [conversations, sessionId]);
}

/**
 * Adapts ToolExecution[] to AdaptedToolEvent[] for the ToolTimeline component.
 * Accepts the raw executions array from useToolStore so the caller controls
 * which store slice to subscribe to.
 */
export function useAdaptedToolEvents(executions: ToolExecution[]): AdaptedToolEvent[] {
  return useMemo(() => executions.map(adaptToolExecution), [executions]);
}

/**
 * Returns the selected model state in the adapter shape expected by
 * desktop-parity components.
 */
export function useAdaptedModelState(): AdaptedModelState {
  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const setSelectedModelId = useModelStore((s) => s.setSelectedModelId);

  return useMemo(
    () => ({
      selectedModelId,
      updateModel: setSelectedModelId,
    }),
    [selectedModelId, setSelectedModelId],
  );
}

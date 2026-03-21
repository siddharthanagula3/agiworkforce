/**
 * Unified Adapter Hooks
 *
 * Bridges the shape gap between:
 * - features/chat/stores/chat-store.ts  (Supabase-backed, simple types)
 * - stores/unified/chat/types.ts         (desktop-parity, rich types)
 *
 * These are zero-cost reshaping adapters with no business logic.
 * All heavy state subscription is handled by the caller via useChatStore.
 */

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from '../stores/chat-store';
import type { ChatMessage, ChatSession } from '../stores/chat-store';
import type { ToolExecution } from '@/stores/unified/chat/toolStore';

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
  status: 'running' | 'completed' | 'failed';
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
  const tools = msg.metadata?.tools;
  const thinkingSteps = msg.metadata?.thinkingSteps;

  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: msg.createdAt,
    streaming: msg.isStreaming,
    metadata: {
      tokensUsed: msg.metadata?.tokensUsed,
      model: msg.metadata?.model,
      timestamp: msg.createdAt.getTime(),
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

export function adaptSession(session: ChatSession): ConversationSummary {
  return {
    id: session.id,
    title: session.title,
    lastMessage: session.preview || undefined,
    updatedAt: session.updatedAt,
    messageCount: session.messageCount,
    isPinned: false,
    isArchived: false,
  };
}

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
 * Adapts the active session's messages from ChatMessage[] to AdaptedMessage[].
 * Memoized — only recomputes when the raw messages array changes.
 */
export function useAdaptedMessages(): AdaptedMessage[] {
  const { activeSessionId, messages } = useChatStore(
    useShallow((s) => ({
      activeSessionId: s.activeSessionId,
      messages: s.messages,
    })),
  );

  return useMemo(() => {
    if (!activeSessionId) return [];
    const raw = messages[activeSessionId] ?? [];
    return raw.map(adaptMessage);
  }, [activeSessionId, messages]);
}

/**
 * Adapts all sessions to ConversationSummary[].
 * Memoized — only recomputes when the sessions array changes.
 */
export function useAdaptedSessions(): ConversationSummary[] {
  const sessions = useChatStore(useShallow((s) => s.sessions));

  return useMemo(() => sessions.map(adaptSession), [sessions]);
}

/**
 * Adapts a single session by id to ConversationSummary.
 * Returns null if the session is not found.
 */
export function useAdaptedSession(sessionId: string): ConversationSummary | null {
  const sessions = useChatStore(useShallow((s) => s.sessions));

  return useMemo(() => {
    const session = sessions.find((s) => s.id === sessionId);
    return session ? adaptSession(session) : null;
  }, [sessions, sessionId]);
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
 * Returns a minimal model state shape.
 * The web app uses a stub modelStore; this hook provides a stable interface
 * so downstream components don't need to branch on platform.
 */
export function useAdaptedModelState(): AdaptedModelState {
  // Web stub — modelStore is a no-op on web (see stores/unified/modelStore.ts stub).
  // Callers can replace this with a real implementation once modelStore is ported.
  return useMemo(
    () => ({
      selectedModelId: '',
      updateModel: (_id: string) => {},
    }),
    [],
  );
}

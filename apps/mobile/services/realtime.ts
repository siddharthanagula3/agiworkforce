import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase, getCurrentUser } from './supabase';
import { useChatStore } from '@/stores/chatStore';
import type { ChatMessage, ConversationSummary } from '@/types/chat';

/**
 * Supabase Realtime subscription service for cross-surface sync.
 * Subscribes to conversations and messages tables, updating the local
 * chat store when changes arrive from other surfaces (desktop, web, etc.).
 */

let conversationsChannel: RealtimeChannel | null = null;
let messagesChannel: RealtimeChannel | null = null;

/**
 * Map a Supabase conversations row to a ConversationSummary.
 */
function mapConversationRow(row: Record<string, unknown>): ConversationSummary {
  return {
    id: row.id as string,
    title: (row.title as string) ?? 'New Chat',
    updatedAt: (row.updated_at as string) ?? new Date().toISOString(),
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    messageCount: (row.message_count as number) ?? 0,
    pinned: false,
    model: row.model as string | undefined,
  };
}

/**
 * Map a Supabase messages row to a ChatMessage.
 */
function mapMessageRow(row: Record<string, unknown>): ChatMessage {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    role: row.role as 'user' | 'assistant' | 'system',
    content: (row.content as string) ?? '',
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    model: row.model as string | undefined,
  };
}

/**
 * Handle conversation changes from Supabase Realtime.
 */
function handleConversationChange(
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
): void {
  const store = useChatStore.getState();

  switch (payload.eventType) {
    case 'INSERT': {
      const conv = mapConversationRow(payload.new);
      // Only add if we don't already have it (avoid duplicates from our own writes)
      if (!store.conversations.some((c) => c.id === conv.id)) {
        useChatStore.setState((state) => ({
          conversations: [conv, ...state.conversations],
          messages: { ...state.messages, [conv.id]: [] },
        }));
      }
      break;
    }
    case 'UPDATE': {
      const conv = mapConversationRow(payload.new);
      useChatStore.setState((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === conv.id
            ? {
                ...c,
                title: conv.title,
                updatedAt: conv.updatedAt,
                messageCount: conv.messageCount,
              }
            : c,
        ),
      }));
      break;
    }
    case 'DELETE': {
      const oldId = (payload.old as Record<string, unknown>).id as string | undefined;
      if (oldId) {
        useChatStore.setState((state) => {
          const { [oldId]: _, ...remainingMessages } = state.messages;
          return {
            conversations: state.conversations.filter((c) => c.id !== oldId),
            messages: remainingMessages,
            currentConversationId:
              state.currentConversationId === oldId ? null : state.currentConversationId,
          };
        });
      }
      break;
    }
  }
}

/**
 * Handle message changes from Supabase Realtime.
 */
function handleMessageChange(
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
): void {
  switch (payload.eventType) {
    case 'INSERT': {
      const msg = mapMessageRow(payload.new);
      const store = useChatStore.getState();
      const existing = store.messages[msg.conversationId] ?? [];

      // Avoid duplicates from our own writes
      if (existing.some((m) => m.id === msg.id)) break;

      useChatStore.setState((state) => ({
        messages: {
          ...state.messages,
          [msg.conversationId]: [...(state.messages[msg.conversationId] ?? []), msg],
        },
      }));
      break;
    }
    case 'UPDATE': {
      const msg = mapMessageRow(payload.new);
      useChatStore.setState((state) => {
        const msgs = state.messages[msg.conversationId];
        if (!msgs) return state;
        return {
          messages: {
            ...state.messages,
            [msg.conversationId]: msgs.map((m) =>
              m.id === msg.id ? { ...m, content: msg.content } : m,
            ),
          },
        };
      });
      break;
    }
    case 'DELETE': {
      const oldRow = payload.old as Record<string, unknown>;
      const msgId = oldRow.id as string | undefined;
      const convId = oldRow.conversation_id as string | undefined;
      if (msgId && convId) {
        useChatStore.setState((state) => {
          const msgs = state.messages[convId];
          if (!msgs) return state;
          return {
            messages: {
              ...state.messages,
              [convId]: msgs.filter((m) => m.id !== msgId),
            },
          };
        });
      }
      break;
    }
  }
}

/**
 * Subscribe to Supabase Realtime for conversations and messages.
 * Filters by the current authenticated user's ID.
 * Returns an unsubscribe function.
 */
export async function subscribeToRealtime(): Promise<() => void> {
  const user = await getCurrentUser();
  if (!user) {
    console.warn('[realtime] No authenticated user — skipping Realtime subscription');
    return () => {};
  }

  const userId = user.id;

  // Subscribe to conversations changes for this user
  conversationsChannel = supabase
    .channel('mobile-conversations')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'conversations',
        filter: `user_id=eq.${userId}`,
      },
      handleConversationChange,
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // Subscribed to conversations — no-op
      }
    });

  // Subscribe to messages changes for this user
  messagesChannel = supabase
    .channel('mobile-messages')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `user_id=eq.${userId}`,
      },
      handleMessageChange,
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // Subscribed to messages — no-op
      }
    });

  return () => {
    unsubscribeFromRealtime();
  };
}

/**
 * Unsubscribe from all Realtime channels.
 */
export function unsubscribeFromRealtime(): void {
  if (conversationsChannel) {
    supabase.removeChannel(conversationsChannel);
    conversationsChannel = null;
  }
  if (messagesChannel) {
    supabase.removeChannel(messagesChannel);
    messagesChannel = null;
  }
}

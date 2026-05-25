/**
 * Chat Real-Time Subscriptions Service (no-op stub)
 *
 * Supabase Realtime has been removed. These functions are retained as no-op
 * stubs so that call sites continue to compile. Real-time features will be
 * re-implemented with a different provider or polling approach.
 */

import type {
  AgentCollaboration,
  RealtimeConversationUpdate,
  RealtimeParticipantUpdate,
  TypingIndicator,
  PresenceState,
} from '@shared/types/multi-agent-chat';

// =============================================
// TYPES
// =============================================

type ConversationUpdateCallback = (update: RealtimeConversationUpdate) => void;
type ParticipantUpdateCallback = (update: RealtimeParticipantUpdate) => void;
// Updated: Jan 15th 2026 - Fixed any type
type MessageCallback = (payload: Record<string, unknown>) => void;
type TypingCallback = (indicator: TypingIndicator) => void;
type PresenceCallback = (state: PresenceState[]) => void;
type ConnectionStateCallback = (state: 'connected' | 'disconnected' | 'reconnecting') => void;

// =============================================
// SUBSCRIPTION MANAGER CLASS
// =============================================

export class ChatRealtimeSubscriptionManager {
  /**
   * Subscribes to conversation updates (no-op stub)
   */
  subscribeToConversation(
    conversationId: string,
    _onUpdate: ConversationUpdateCallback,
    _onConnectionStateChange?: ConnectionStateCallback,
  ): () => void {
    console.warn(
      `[ChatRealtimeSubscriptionManager] subscribeToConversation called for ${conversationId} but Supabase Realtime has been removed. No subscription created.`,
    );
    return () => {};
  }

  /**
   * Subscribes to participant updates (no-op stub)
   */
  subscribeToParticipants(
    conversationId: string,
    _onUpdate: ParticipantUpdateCallback,
    _onConnectionStateChange?: ConnectionStateCallback,
  ): () => void {
    console.warn(
      `[ChatRealtimeSubscriptionManager] subscribeToParticipants called for ${conversationId} but Supabase Realtime has been removed. No subscription created.`,
    );
    return () => {};
  }

  /**
   * Subscribes to collaboration updates (no-op stub)
   */
  subscribeToCollaborations(
    conversationId: string,
    _onUpdate: (collaboration: AgentCollaboration) => void,
    _onConnectionStateChange?: ConnectionStateCallback,
  ): () => void {
    console.warn(
      `[ChatRealtimeSubscriptionManager] subscribeToCollaborations called for ${conversationId} but Supabase Realtime has been removed. No subscription created.`,
    );
    return () => {};
  }

  /**
   * Subscribes to chat messages for a conversation (no-op stub)
   */
  subscribeToMessages(
    conversationId: string,
    _onMessage: MessageCallback,
    _onConnectionStateChange?: ConnectionStateCallback,
  ): () => void {
    console.warn(
      `[ChatRealtimeSubscriptionManager] subscribeToMessages called for ${conversationId} but Supabase Realtime has been removed. No subscription created.`,
    );
    return () => {};
  }

  /**
   * Subscribes to typing indicators for a conversation (no-op stub)
   */
  subscribeToTypingIndicators(_conversationId: string, _onTyping: TypingCallback): () => void {
    console.warn(
      '[ChatRealtimeSubscriptionManager] subscribeToTypingIndicators called but Supabase Realtime has been removed. No subscription created.',
    );
    return () => {};
  }

  /**
   * Broadcasts a typing indicator (no-op stub)
   */
  async broadcastTyping(
    _conversationId: string,
    _participantId: string,
    _employeeName: string,
    _isTyping: boolean,
  ): Promise<void> {
    console.warn(
      '[ChatRealtimeSubscriptionManager] broadcastTyping called but Supabase Realtime has been removed. No broadcast sent.',
    );
  }

  /**
   * Subscribes to presence tracking for a conversation (no-op stub)
   */
  subscribeToPresence(
    _conversationId: string,
    _participantId: string,
    _onPresenceChange: PresenceCallback,
  ): () => void {
    console.warn(
      '[ChatRealtimeSubscriptionManager] subscribeToPresence called but Supabase Realtime has been removed. No subscription created.',
    );
    return () => {};
  }

  /**
   * Updates presence status (no-op stub)
   */
  async updatePresenceStatus(
    _conversationId: string,
    _participantId: string,
    _status: 'online' | 'offline' | 'busy',
  ): Promise<void> {
    console.warn(
      '[ChatRealtimeSubscriptionManager] updatePresenceStatus called but Supabase Realtime has been removed.',
    );
  }

  /**
   * Unsubscribes from a specific channel (no-op stub)
   */
  unsubscribe(_channelName: string): void {}

  /**
   * Unsubscribes from all channels (no-op stub)
   */
  // Updated: Jan 15th 2026 - Enhanced cleanup to prevent memory leaks from subscription tokens
  unsubscribeAll(): void {}

  /**
   * Gets the connection state of a channel
   */
  getChannelState(_channelName: string): string | undefined {
    return undefined;
  }

  /**
   * Gets all active channels
   */
  getActiveChannels(): string[] {
    return [];
  }
}

// =============================================
// SINGLETON INSTANCE
// =============================================

let subscriptionManager: ChatRealtimeSubscriptionManager | null = null;

/**
 * Gets the singleton subscription manager instance
 */
export function getSubscriptionManager(): ChatRealtimeSubscriptionManager {
  if (!subscriptionManager) {
    subscriptionManager = new ChatRealtimeSubscriptionManager();
  }
  return subscriptionManager;
}

/**
 * Resets the subscription manager (useful for testing)
 */
export function resetSubscriptionManager(): void {
  if (subscriptionManager) {
    subscriptionManager.unsubscribeAll();
    subscriptionManager = null;
  }
}

// =============================================
// CONVENIENCE FUNCTIONS
// =============================================

/**
 * Subscribes to all updates for a conversation (no-op stub)
 */
export function subscribeToConversationUpdates(
  conversationId: string,
  callbacks: {
    onConversationUpdate?: ConversationUpdateCallback;
    onParticipantUpdate?: ParticipantUpdateCallback;
    onMessage?: MessageCallback;
    onTyping?: TypingCallback;
    onPresenceChange?: PresenceCallback;
    onConnectionStateChange?: ConnectionStateCallback;
  },
  _options?: {
    participantId?: string;
  },
): () => void {
  console.warn(
    `[subscribeToConversationUpdates] Called for ${conversationId} but Supabase Realtime has been removed. No subscriptions created.`,
  );
  void callbacks;
  return () => {};
}

/**
 * Broadcasts typing status for a participant (no-op stub)
 */
export async function broadcastTypingStatus(
  _conversationId: string,
  _participantId: string,
  _employeeName: string,
  _isTyping: boolean,
): Promise<void> {
  console.warn(
    '[broadcastTypingStatus] Called but Supabase Realtime has been removed. No broadcast sent.',
  );
}

/**
 * Updates participant presence status (no-op stub)
 */
export async function updatePresence(
  _conversationId: string,
  _participantId: string,
  _status: 'online' | 'offline' | 'busy',
): Promise<void> {
  console.warn('[updatePresence] Called but Supabase Realtime has been removed.');
}

/**
 * Cleans up all subscriptions (no-op stub)
 */
export function cleanupSubscriptions(): void {
  const manager = getSubscriptionManager();
  manager.unsubscribeAll();
}

// =============================================
// REACT HOOKS (Optional - for convenience)
// =============================================

/**
 * React hook for subscribing to conversation updates (no-op stub)
 */
export function useConversationSubscription(
  _conversationId: string,
  _callbacks: Parameters<typeof subscribeToConversationUpdates>[1],
  _options?: Parameters<typeof subscribeToConversationUpdates>[2],
) {
  console.warn(
    'useConversationSubscription: Supabase Realtime has been removed. This hook is a no-op.',
  );
}

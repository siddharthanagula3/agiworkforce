
import { invoke } from '../lib/tauri-mock';
import { toast } from 'sonner';
import type { Message } from '../types/chat';

export type UserIntent = 'conversation' | 'action_request' | 'stop' | 'clarification';

export interface IntentResult {
  intent: UserIntent;
  confidence: number;
  action_verbs: string[];
  should_auto_execute: boolean;
}

/**
 * Detect the intent of a user message
 *
 * Uses smart pattern matching to determine if the user wants to:
 * - Have a conversation (ask questions, discuss)
 * - Request an action (do something)
 * - Stop the current operation
 * - Ask for clarification about a previous action
 *
 * @param content - The user's message content
 * @returns IntentResult with intent type, confidence, and detected action verbs
 *
 * @example
 * ```ts
 * const result = await detectIntent("Open Chrome and go to gmail.com");
 * // { intent: "action_request", confidence: 0.85, action_verbs: ["open", "go to"], should_auto_execute: true }
 *
 * const result2 = await detectIntent("What is the weather like?");
 * // { intent: "conversation", confidence: 0.7, action_verbs: [], should_auto_execute: false }
 *
 * const result3 = await detectIntent("stop");
 * // { intent: "stop", confidence: 0.95, action_verbs: [], should_auto_execute: true }
 * ```
 */
export async function detectIntent(content: string): Promise<IntentResult> {
  return invoke<IntentResult>('chat_detect_intent', { content });
}

/**
 * Quick check if a message is a stop command
 *
 * Useful for checking user input in real-time without full intent detection.
 * Recognizes patterns like: "stop", "wait", "cancel", "abort", "nevermind", etc.
 *
 * @param content - The user's message content
 * @returns true if the message is a stop command
 *
 * @example
 * ```ts
 * if (await isStopCommand("stop that")) {
 *   // Handle stop
 * }
 * ```
 */
export async function isStopCommand(content: string): Promise<boolean> {
  return invoke<boolean>('chat_is_stop_command', { content }).catch((e) => {
    console.error('[chat] chat_is_stop_command failed:', e);
    return false;
  });
}

/**
 * Handle a stop command
 *
 * Sets the stop flag, emits stop events, and attempts to cancel
 * any running AGI orchestrator operations.
 *
 * @returns true if stop was successfully initiated
 *
 * @example
 * ```ts
 * await handleStop();
 * // All running operations will be signaled to stop
 * ```
 */
export async function handleStop(): Promise<boolean> {
  return invoke<boolean>('chat_handle_stop').catch((e) => {
    console.error('[chat] chat_handle_stop failed:', e);
    toast.error('Failed to stop generation');
    return false;
  });
}

/**
 * Stop any ongoing chat generation
 * @param conversationId - Optional conversation ID to scope the stop to (AUDIT-STREAM-038 fix)
 *
 * @deprecated Use handleStop() instead which also handles AGI operations
 */
export async function stopGeneration(conversationId?: number): Promise<void> {
  return invoke<void>('chat_stop_generation', { conversationId }).catch((e) => {
    console.error('[chat] chat_stop_generation failed:', e);
  });
}

/**
 * Load all messages for a conversation
 *
 * Retrieves the message history for a specific conversation.
 * Requires user ownership verification - only messages from conversations
 * owned by the specified user can be loaded.
 *
 * @param conversationId - The ID of the conversation to load messages from
 * @param userId - The ID of the user who owns the conversation
 * @returns Array of messages in the conversation
 * @throws Error if conversation not found, access denied, or user doesn't own the conversation
 *
 * @example
 * ```ts
 * const messages = await loadConversationMessages(123, 'user-uuid-here');
 * // messages: Message[]
 * ```
 */
export async function loadConversationMessages(
  conversationId: number,
  userId: string,
): Promise<Message[]> {
  return invoke<Message[]>('chat_get_messages', { conversationId, userId }).catch((e) => {
    console.error('[chat] chat_get_messages failed:', e);
    throw new Error(`Failed to load messages: ${e}`);
  });
}

export class ChatClient {
  static async detectIntent(content: string): Promise<IntentResult> {
    return detectIntent(content);
  }

  static async isStopCommand(content: string): Promise<boolean> {
    return isStopCommand(content);
  }

  static async handleStop(): Promise<boolean> {
    return handleStop();
  }

  /**
   * Stop generation (deprecated)
   * @param conversationId - Optional conversation ID to scope the stop to
   * @deprecated Use handleStop() instead
   */
  static async stopGeneration(conversationId?: number): Promise<void> {
    return stopGeneration(conversationId);
  }

  static async loadConversationMessages(
    conversationId: number,
    userId: string,
  ): Promise<Message[]> {
    return loadConversationMessages(conversationId, userId);
  }

  static shouldAutoExecute(result: IntentResult): boolean {
    return result.should_auto_execute && result.confidence > 0.5;
  }

  static requiresAction(result: IntentResult): boolean {
    return result.intent === 'action_request' || result.intent === 'stop';
  }

  static isConversational(result: IntentResult): boolean {
    return result.intent === 'conversation' || result.intent === 'clarification';
  }
}

export default ChatClient;

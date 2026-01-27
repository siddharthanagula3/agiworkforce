/**
 * Chat API - Intent Detection, Stop Command Handling, and Message Loading
 *
 * Provides TypeScript bindings for smart intent detection
 * that automatically determines whether user messages are:
 * - Conversation (questions, discussion)
 * - Action requests (do something)
 * - Stop commands (halt current operation)
 * - Clarification requests (follow-up questions)
 *
 * Also provides message loading functionality for conversations.
 */

import { invoke } from '@tauri-apps/api/core';
import type { Message } from '../types/chat';

/**
 * User intent types for smart routing
 */
export type UserIntent = 'conversation' | 'action_request' | 'stop' | 'clarification';

/**
 * Result of intent detection with confidence scoring
 */
export interface IntentResult {
  /** The detected intent type */
  intent: UserIntent;
  /** Confidence score from 0.0 to 1.0 */
  confidence: number;
  /** Detected action verbs if any */
  action_verbs: string[];
  /** Whether auto mode should be activated for this intent */
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
  return invoke<boolean>('chat_is_stop_command', { content });
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
  return invoke<boolean>('chat_handle_stop');
}

/**
 * Stop any ongoing chat generation
 *
 * @deprecated Use handleStop() instead which also handles AGI operations
 */
export async function stopGeneration(): Promise<void> {
  return invoke<void>('chat_stop_generation');
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
  return invoke<Message[]>('chat_get_messages', { conversationId, userId });
}

/**
 * ChatClient - Convenience class for chat operations
 */
export class ChatClient {
  /**
   * Detect intent from user message
   */
  static async detectIntent(content: string): Promise<IntentResult> {
    return detectIntent(content);
  }

  /**
   * Check if message is a stop command
   */
  static async isStopCommand(content: string): Promise<boolean> {
    return isStopCommand(content);
  }

  /**
   * Handle stop command
   */
  static async handleStop(): Promise<boolean> {
    return handleStop();
  }

  /**
   * Stop generation (deprecated)
   * @deprecated Use handleStop() instead
   */
  static async stopGeneration(): Promise<void> {
    return stopGeneration();
  }

  /**
   * Load all messages for a conversation
   */
  static async loadConversationMessages(
    conversationId: number,
    userId: string,
  ): Promise<Message[]> {
    return loadConversationMessages(conversationId, userId);
  }

  /**
   * Determine if auto mode should be activated based on intent
   */
  static shouldAutoExecute(result: IntentResult): boolean {
    return result.should_auto_execute && result.confidence > 0.5;
  }

  /**
   * Check if intent requires immediate action
   */
  static requiresAction(result: IntentResult): boolean {
    return result.intent === 'action_request' || result.intent === 'stop';
  }

  /**
   * Check if intent is conversational
   */
  static isConversational(result: IntentResult): boolean {
    return result.intent === 'conversation' || result.intent === 'clarification';
  }
}

export default ChatClient;

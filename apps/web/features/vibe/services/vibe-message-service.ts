/**
 * VIBE Message Service
 *
 * Handles all database operations for vibe_messages table
 * Uses /api/llm/completion SSE streaming for AI responses
 * Provides real-time message streaming and chunking
 */

import { supabase } from '@shared/lib/supabase-client';
import { useModelStore } from '@shared/stores/model-store';

export interface VibeMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  user_id?: string | null;
  employee_id?: string | null;
  employee_name?: string | null;
  employee_role?: string | null;
  timestamp?: string | null;
  // Updated: Jan 15th 2026 - Fixed any type
  metadata?: Record<string, unknown> | null;
  is_streaming?: boolean | null;
}

export interface CreateMessageParams {
  id?: string;
  sessionId: string;
  userId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  employeeName?: string;
  employeeRole?: string;
  metadata?: Record<string, unknown>;
  isStreaming?: boolean;
}

export interface ProcessUserMessageParams {
  sessionId: string;
  userId: string;
  content: string;
  conversationHistory: Array<{ role: string; content: string }>;
  onChunk?: (chunk: string) => void;
  onComplete?: (fullResponse: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Message Service Class
 * Provides all CRUD operations for vibe_messages
 */
export class VibeMessageService {
  /**
   * Fetch all messages for a session
   */
  static async getMessages(sessionId: string): Promise<VibeMessage[]> {
    const { data, error } = await supabase
      .from('vibe_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('[VibeMessageService] Failed to fetch messages:', error);
      throw new Error(`Failed to fetch messages: ${error.message}`);
    }

    return (data as VibeMessage[]) || [];
  }

  /**
   * Create a new message in the database
   */
  static async createMessage(params: CreateMessageParams): Promise<VibeMessage> {
    const messageId = params.id || crypto.randomUUID();
    const message: Partial<VibeMessage> = {
      id: messageId,
      session_id: params.sessionId,
      user_id: params.userId,
      role: params.role,
      content: params.content,
      employee_name: params.employeeName,
      employee_role: params.employeeRole,
      metadata: params.metadata || {},
      is_streaming: params.isStreaming || false,
    };

    const { data, error } = await (
      supabase.from('vibe_messages') as ReturnType<typeof supabase.from>
    )
      .insert(message)
      .select()
      .maybeSingle();

    if (error) {
      console.error('[VibeMessageService] Failed to create message:', error);
      throw new Error(`Failed to create message: ${error.message}`);
    }

    if (!data) {
      throw new Error('Failed to create message: No data returned');
    }

    return data as VibeMessage;
  }

  /**
   * Update an existing message
   */
  static async updateMessage(
    messageId: string,
    updates: Partial<VibeMessage>,
  ): Promise<VibeMessage> {
    const { data, error } = await (
      supabase.from('vibe_messages') as ReturnType<typeof supabase.from>
    )
      .update(updates)
      .eq('id', messageId)
      .select()
      .maybeSingle();

    if (error) {
      console.error('[VibeMessageService] Failed to update message:', error);
      throw new Error(`Failed to update message: ${error.message}`);
    }

    if (!data) {
      throw new Error('Message not found');
    }

    return data as VibeMessage;
  }

  /**
   * Delete a message (with ownership verification)
   */
  static async deleteMessage(messageId: string, userId?: string): Promise<void> {
    let query = supabase.from('vibe_messages').delete().eq('id', messageId);
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { error } = await query;

    if (error) {
      console.error('[VibeMessageService] Failed to delete message:', error);
      throw new Error(`Failed to delete message: ${error.message}`);
    }
  }

  /**
   * Process user message through /api/llm/completion SSE streaming.
   * Handles the complete flow:
   * 1. Create user message in database
   * 2. Call /api/llm/completion with SSE streaming
   * 3. Stream response chunks via onChunk callback
   * 4. Save assistant response to database
   */
  static async processUserMessage(params: ProcessUserMessageParams): Promise<VibeMessage> {
    const { sessionId, userId, content, conversationHistory, onChunk, onComplete, onError } =
      params;

    // Track assistant message ID for cleanup on error
    let assistantMessageId: string | null = null;

    try {
      // Step 1: Get auth session BEFORE creating messages (H10: auth must precede DB writes)
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      const selectedModelId = useModelStore.getState().selectedModelId;

      // Step 2: Create user message

      // Build messages for API
      const messages = [
        ...conversationHistory.map((msg) => ({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
        })),
        { role: 'user' as const, content },
      ];

      // Step 3: Create streaming assistant message
      const assistantMessage = await this.createMessage({
        sessionId,
        userId,
        role: 'assistant',
        content: '',
        employeeName: 'Vibe Assistant',
        isStreaming: true,
      });
      assistantMessageId = assistantMessage.id;

      // Step 4: Call /api/llm/completion with SSE
      const response = await fetch('/api/llm/completion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          model: selectedModelId,
          messages,
          stream: true,
          max_tokens: 4096,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({ error: 'Request failed' }))) as {
          error?: string;
        };
        throw new Error(errorData.error || `API request failed with status ${response.status}`);
      }

      let fullResponse = '';

      if (!response.body) {
        // Non-streaming fallback
        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        fullResponse = data.choices?.[0]?.message?.content || '';
        if (onChunk) onChunk(fullResponse);
      } else {
        // Stream SSE response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const jsonStr = trimmed.slice(6).trim();
            if (jsonStr === '[DONE]') continue;

            try {
              const parsed = JSON.parse(jsonStr) as {
                choices?: Array<{ delta?: { content?: string } }>;
                delta?: { text?: string };
              };
              const chunk = parsed.choices?.[0]?.delta?.content || parsed.delta?.text || '';
              if (chunk) {
                fullResponse += chunk;
                if (onChunk) onChunk(chunk);
              }
            } catch {
              // Skip malformed SSE lines
            }
          }
        }
      }

      if (!fullResponse) {
        throw new Error('No response received from AI');
      }

      // Step 5: Mark as complete
      const finalMessage = await this.updateMessage(assistantMessageId, {
        content: fullResponse,
        is_streaming: false,
      });

      if (onComplete) {
        onComplete(fullResponse);
      }

      return finalMessage;
    } catch (error) {
      console.error('[VibeMessageService] Processing failed:', error);

      // Reset streaming state if assistant message was created
      if (assistantMessageId) {
        try {
          await this.updateMessage(assistantMessageId, {
            is_streaming: false,
            content: '[Error: Message generation failed]',
          });
        } catch (updateError) {
          console.error('[VibeMessageService] Failed to reset streaming state:', updateError);
        }
      }

      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
      throw error;
    }
  }

  /**
   * Subscribe to real-time message updates for a session
   */
  static subscribeToMessages(
    sessionId: string,
    onMessage: (message: VibeMessage) => void,
    onError?: (error: Error) => void,
  ) {
    const channel = supabase
      .channel(`vibe-messages-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vibe_messages',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          // Guard: DELETE events have empty payload.new — only forward INSERT/UPDATE
          if (payload.eventType !== 'DELETE' && payload.new) {
            onMessage(payload.new as VibeMessage);
          }
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' && onError) {
          onError(new Error('Failed to subscribe to message updates'));
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }

  /**
   * Get the latest N messages for a session
   */
  static async getRecentMessages(sessionId: string, limit: number = 50): Promise<VibeMessage[]> {
    const { data, error } = await supabase
      .from('vibe_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[VibeMessageService] Failed to fetch recent messages:', error);
      throw new Error(`Failed to fetch recent messages: ${error.message}`);
    }

    // Reverse to get chronological order
    return ((data as VibeMessage[]) || []).reverse();
  }

  /**
   * Clear all messages for a session (with ownership verification)
   */
  static async clearSessionMessages(sessionId: string, userId?: string): Promise<void> {
    let query = supabase.from('vibe_messages').delete().eq('session_id', sessionId);
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { error } = await query;

    if (error) {
      console.error('[VibeMessageService] Failed to clear messages:', error);
      throw new Error(`Failed to clear messages: ${error.message}`);
    }
  }
}

'use client';

import { useCallback, useRef, useEffect } from 'react';
import { useChatStore, type Message, type Attachment } from '@/stores/chatStore';

interface SendMessageOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  attachments?: Attachment[];
  conversationId?: string;
}

interface UseChatStreamReturn {
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<void>;
  stopGeneration: () => void;
  isStreaming: boolean;
}

/**
 * Hook for handling SSE streaming chat with the LLM API
 */
export function useChatStream(): UseChatStreamReturn {
  const abortControllerRef = useRef<AbortController | null>(null);

  // Store actions
  const addMessage = useChatStore((state) => state.addMessage);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const appendToMessage = useChatStore((state) => state.appendToMessage);
  const startStreaming = useChatStore((state) => state.startStreaming);
  const stopStreaming = useChatStore((state) => state.stopStreaming);
  const setLoading = useChatStore((state) => state.setLoading);
  const setError = useChatStore((state) => state.setError);
  const selectedModel = useChatStore((state) => state.selectedModel);
  const isStreaming = useChatStore((state) => state.isStreaming);

  // Cleanup AbortController on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const sendMessage = useCallback(
    async (content: string, options: SendMessageOptions = {}) => {
      if (!content.trim()) return;

      // Cancel any existing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const model = options.model || selectedModel;

      // Add user message
      const userMessageId = crypto.randomUUID();
      const userMessage: Message = {
        id: userMessageId,
        role: 'user',
        content: content.trim(),
        createdAt: new Date().toISOString(),
        attachments: options.attachments,
      };
      addMessage(userMessage);

      // Create assistant message placeholder
      const assistantMessageId = crypto.randomUUID();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
        model,
        isStreaming: true,
      };
      addMessage(assistantMessage);
      startStreaming(assistantMessageId);
      setLoading(true);
      setError(null);

      try {
        // Message content can be string or array (for multimodal)
        type MessageContent =
          | string
          | Array<{ type: string; text?: string; image_url?: { url: string } }>;
        type ApiMessage = { role: string; content: MessageContent };

        // Get current messages from store to avoid stale closure
        const currentMessages = useChatStore.getState().messages;

        // Build messages array for API (exclude the placeholder assistant message we just added)
        const apiMessages: ApiMessage[] = [
          ...currentMessages
            .filter((m) => m.id !== assistantMessageId)
            .map((m) => ({
              role: m.role,
              content: m.content as MessageContent,
            })),
        ];

        // If there are image attachments, format the last user message for the API
        if (options.attachments?.some((a) => a.type === 'image')) {
          const lastUserMsgIndex = apiMessages.length - 1;
          if (lastUserMsgIndex >= 0 && apiMessages[lastUserMsgIndex].role === 'user') {
            const formattedContent: MessageContent = [
              { type: 'text', text: content.trim() },
              ...options.attachments
                .filter((a) => a.type === 'image' && a.content)
                .map((a) => ({
                  type: 'image_url' as const,
                  image_url: { url: a.content! },
                })),
            ];
            apiMessages[lastUserMsgIndex].content = formattedContent;
          }
        }

        const response = await fetch('/api/llm/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await getAuthToken()}`,
          },
          body: JSON.stringify({
            model,
            messages: apiMessages,
            stream: true,
            temperature: options.temperature,
            max_tokens: options.maxTokens,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `Request failed: ${response.status}`);
        }

        if (!response.body) {
          throw new Error('No response body');
        }

        // Parse SSE stream
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
            const trimmedLine = line.trim();
            if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

            const data = trimmedLine.slice(6);
            if (data === '[DONE]') {
              stopStreaming();
              setLoading(false);
              return;
            }

            try {
              const parsed = JSON.parse(data);

              // Handle OpenAI-compatible format
              if (parsed.choices?.[0]?.delta?.content) {
                appendToMessage(assistantMessageId, parsed.choices[0].delta.content);
              }

              // Handle Anthropic format
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                appendToMessage(assistantMessageId, parsed.delta.text);
              }

              // Handle finish reason
              if (parsed.choices?.[0]?.finish_reason || parsed.type === 'message_stop') {
                updateMessage(assistantMessageId, {
                  isStreaming: false,
                  model: parsed.model || model,
                });
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }

        // Ensure streaming is stopped
        stopStreaming();
        setLoading(false);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          // User cancelled - update message to show partial content
          updateMessage(assistantMessageId, { isStreaming: false });
        } else {
          // Real error - update message with error state
          updateMessage(assistantMessageId, {
            isStreaming: false,
            content: 'Sorry, there was an error generating a response. Please try again.',
          });
          setError(error instanceof Error ? error.message : 'An error occurred');
        }
        stopStreaming();
        setLoading(false);
      }
    },
    [
      selectedModel,
      addMessage,
      updateMessage,
      appendToMessage,
      startStreaming,
      stopStreaming,
      setLoading,
      setError,
    ],
  );

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    stopStreaming();
    setLoading(false);
  }, [stopStreaming, setLoading]);

  return {
    sendMessage,
    stopGeneration,
    isStreaming,
  };
}

/**
 * Get the current auth token from Supabase
 */
async function getAuthToken(): Promise<string> {
  // For client-side, we need to get the token from the Supabase client
  const { getSupabaseClient } = await import('@/services/supabase');
  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  return session.access_token;
}

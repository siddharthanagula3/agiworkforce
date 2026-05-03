'use client';

import { useCallback, useRef, useEffect } from 'react';
import { useChatStore, type Message, type Attachment } from '@/stores/chatStore';

interface SendMessageOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  attachments?: Attachment[];
  conversationId?: string;
  webSearch?: boolean;
}

interface UseChatStreamReturn {
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<void>;
  stopGeneration: () => void;
  isStreaming: boolean;
}

/**
 * Save a message to the database
 */
async function saveMessageToDb(
  conversationId: string,
  message: { role: string; content: string; model?: string },
  authToken: string,
): Promise<{ id: string } | null> {
  try {
    const response = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        role: message.role,
        content: message.content,
        model: message.model,
        skipLlm: true, // Flag to save message without triggering LLM call
      }),
    });

    if (!response.ok) {
      console.error('[useChatStream] Failed to save message to DB:', response.status);
      return null;
    }

    const data = await response.json();
    return data.message || data.userMessage || { id: crypto.randomUUID() };
  } catch (error) {
    console.error('[useChatStream] Error saving message to DB:', error);
    return null;
  }
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
  const appendToThinking = useChatStore((state) => state.appendToThinking);
  const setSearching = useChatStore((state) => state.setSearching);
  const setSearchResults = useChatStore((state) => state.setSearchResults);
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

      // Get conversation ID - either from options or read fresh from store to avoid stale closures
      const conversationId = options.conversationId || useChatStore.getState().activeConversationId;
      if (!conversationId) {
        console.error('[useChatStream] No conversation ID available');
        setError('No active conversation. Please create a new conversation first.');
        return;
      }

      // Cancel any existing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const model = options.model || selectedModel;
      const authToken = await getAuthToken();

      // Add user message to UI immediately
      const userMessageId = crypto.randomUUID();
      const userMessage: Message = {
        id: userMessageId,
        role: 'user',
        content: content.trim(),
        createdAt: new Date().toISOString(),
        attachments: options.attachments,
      };
      addMessage(userMessage);

      // Save user message to database (fire and forget, don't block)
      saveMessageToDb(conversationId, { role: 'user', content: content.trim() }, authToken).catch(
        (err) => console.error('[useChatStream] Failed to save user message:', err),
      );

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
          if (lastUserMsgIndex >= 0 && apiMessages[lastUserMsgIndex]?.role === 'user') {
            const formattedContent: MessageContent = [
              { type: 'text', text: content.trim() },
              ...options.attachments
                .filter((a) => a.type === 'image' && a.content)
                .map((a) => ({
                  type: 'image_url' as const,
                  image_url: { url: a.content! },
                })),
            ];
            apiMessages[lastUserMsgIndex]!.content = formattedContent;
          }
        }

        const response = await fetch('/api/llm/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            model,
            messages: apiMessages,
            stream: true,
            temperature: options.temperature,
            max_tokens: options.maxTokens,
            web_search: options.webSearch || undefined,
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
        let fullAssistantContent = '';
        // Extended-thinking state: tracks whether we're currently inside a <thinking> block
        let inThinkingBlock = false;

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
              // Close any dangling thinking block
              if (inThinkingBlock) {
                updateMessage(assistantMessageId, {
                  metadata: {
                    isThinkingStreaming: false,
                    thinkingCompletedAt: new Date().toISOString(),
                  },
                });
                inThinkingBlock = false;
              }
              // Clear any lingering search indicator
              setSearching(assistantMessageId, false);
              if (fullAssistantContent) {
                saveMessageToDb(
                  conversationId,
                  { role: 'assistant', content: fullAssistantContent, model },
                  authToken,
                ).catch((err) =>
                  console.error('[useChatStream] Failed to save assistant message:', err),
                );
              }
              stopStreaming();
              setLoading(false);
              return;
            }

            try {
              const parsed = JSON.parse(data);

              // Resolve content chunk from OpenAI-compatible or raw Anthropic format
              let chunk: string | null = null;
              if (parsed.choices?.[0]?.delta?.content != null) {
                chunk = parsed.choices[0].delta.content;
              } else if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                chunk = parsed.delta.text;
              }

              if (chunk !== null) {
                if (chunk === '<thinking>') {
                  // Server signals the start of an extended thinking block
                  inThinkingBlock = true;
                  updateMessage(assistantMessageId, {
                    metadata: {
                      isThinkingStreaming: true,
                      thinkingStartedAt: new Date().toISOString(),
                    },
                  });
                } else if (chunk === '</thinking>') {
                  // Server signals the end of an extended thinking block
                  inThinkingBlock = false;
                  updateMessage(assistantMessageId, {
                    metadata: {
                      isThinkingStreaming: false,
                      thinkingCompletedAt: new Date().toISOString(),
                    },
                  });
                } else if (inThinkingBlock) {
                  appendToThinking(assistantMessageId, chunk);
                } else {
                  fullAssistantContent += chunk;
                  appendToMessage(assistantMessageId, chunk);
                }
              }

              // Handle web search status indicator (server-managed tool starting)
              const toolStatus = parsed.choices?.[0]?.delta?.x_tool_status;
              if (toolStatus?.status === 'searching') {
                setSearching(assistantMessageId, true);
              }

              // Handle web search results (server-managed tool completed)
              const searchResultsBlock = parsed.choices?.[0]?.delta?.x_search_results;
              if (searchResultsBlock?.content && Array.isArray(searchResultsBlock.content)) {
                const results = (searchResultsBlock.content as Record<string, unknown>[])
                  .filter((r) => r['type'] === 'web_search_result' && r['url'])
                  .map((r) => ({
                    url: r['url'] as string,
                    title: (r['title'] as string) || (r['url'] as string),
                    snippet: (r['encrypted_content'] as string) || '',
                  }));
                if (results.length > 0) {
                  setSearchResults(assistantMessageId, results);
                }
              }

              // Handle finish reason
              // We keep the originally selected model name for display consistency — the API
              // may return a different model name due to fallback or version differences.
              if (parsed.choices?.[0]?.finish_reason || parsed.type === 'message_stop') {
                updateMessage(assistantMessageId, { isStreaming: false });
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }

        // Save the complete assistant message to database (in case [DONE] wasn't received)
        if (fullAssistantContent) {
          saveMessageToDb(
            conversationId,
            { role: 'assistant', content: fullAssistantContent, model },
            authToken,
          ).catch((err) => console.error('[useChatStream] Failed to save assistant message:', err));
        }

        // Ensure streaming is stopped
        stopStreaming();
        setLoading(false);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          // User cancelled - update message to show partial content
          updateMessage(assistantMessageId, { isStreaming: false });
        } else {
          // Real error - show the actual error message to help with debugging
          const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
          console.error('[useChatStream] API Error:', errorMessage, error);

          // Show the actual error in the message for visibility
          // This helps users and developers understand what went wrong
          updateMessage(assistantMessageId, {
            isStreaming: false,
            content: `⚠️ Error: ${errorMessage}\n\nPlease check the console for more details or try again.`,
            error: true,
          });
          setError(errorMessage);
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
      appendToThinking,
      setSearching,
      setSearchResults,
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

/**
 * useSSEStreaming - Custom hook for SSE streaming from /api/llm/completion
 *
 * Extracted from VibeDashboard.tsx to reduce component complexity.
 * Streams response chunks and updates message state in real-time.
 */

import { useCallback, useRef, useEffect } from 'react';
import { supabase } from '@shared/lib/supabase-client';
import { useModelStore } from '@shared/stores/model-store';
import type { AgentMessage } from '../components/agent-panel/AgentMessageList';

interface SSEParsedChunk {
  choices?: Array<{ delta?: { content?: string } }>;
  delta?: { text?: string };
}

interface SSENonStreamingResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

interface SSEErrorResponse {
  error?: string;
}

interface UseSSEStreamingOptions {
  setMessages: React.Dispatch<React.SetStateAction<AgentMessage[]>>;
}

export function useSSEStreaming({ setMessages }: UseSSEStreamingOptions) {
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const streamSSEResponse = useCallback(
    async (
      messageId: string,
      conversationHistory: Array<{ role: string; content: string }>,
    ): Promise<string> => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      const selectedModelId = useModelStore.getState().selectedModelId;

      // Cancel any previous streaming request
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const response = await fetch('/api/llm/completion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          model: selectedModelId,
          messages: conversationHistory,
          stream: true,
          max_tokens: 4096,
          temperature: 0.7,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = (await response
          .json()
          .catch(() => ({ error: 'Request failed' }))) as SSEErrorResponse;
        throw new Error(errorData.error || `API request failed with status ${response.status}`);
      }

      // Non-streaming fallback
      if (!response.body) {
        const data = (await response.json()) as SSENonStreamingResponse;
        const text = data.choices?.[0]?.message?.content || '';
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId ? { ...msg, content: text, isStreaming: false } : msg,
          ),
        );
        return text;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
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
            const parsed = JSON.parse(jsonStr) as SSEParsedChunk;
            const content = parsed.choices?.[0]?.delta?.content || parsed.delta?.text || '';
            if (content) {
              fullResponse += content;
              // Guard: don't update state if stream was aborted
              if (!controller.signal.aborted) {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === messageId ? { ...msg, content: fullResponse } : msg,
                  ),
                );
              }
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim() && buffer.trim().startsWith('data: ')) {
        const jsonStr = buffer.trim().slice(6).trim();
        if (jsonStr !== '[DONE]') {
          try {
            const parsed = JSON.parse(jsonStr) as SSEParsedChunk;
            const content = parsed.choices?.[0]?.delta?.content || parsed.delta?.text || '';
            if (content) {
              fullResponse += content;
            }
          } catch {
            // Skip
          }
        }
      }

      // Mark streaming complete
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, content: fullResponse, isStreaming: false } : msg,
        ),
      );

      return fullResponse;
    },
    [setMessages],
  );

  const abortStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return { streamSSEResponse, abortStreaming };
}

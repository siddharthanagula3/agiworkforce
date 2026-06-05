'use client';

import { useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import {
  useChatStore,
  type Message,
  type Attachment,
  type MessageMetadata,
  type MessageToolEntry,
} from '@/stores/chatStore';
import { useThinkingStore } from '@shared/stores/thinking-store';
import type { Effort } from '@agiworkforce/types';
import { addCsrfHeaders } from '@/lib/client/csrf';
import {
  buildAutoEconomyTrialPaywallSlot,
  isAutoEconomyTrialErrorCode,
  useAutoEconomyTrialStore,
} from '@/features/chat/stores/autoEconomyTrialStore';

interface SendMessageOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  attachments?: Attachment[];
  conversationId?: string;
  webSearch?: boolean;
  webFetch?: boolean;
  codeExecution?: boolean;
  thinkingEnabled?: boolean;
  thinkingEffort?: Effort;
  /** Output style hint. When set and not 'normal', a system message is prepended. */
  styleMode?: string;
  /** Skill body injected as a system message at the start of the request. */
  skillBody?: string;
}

const STYLE_SYSTEM_INSTRUCTIONS: Record<string, string> = {
  concise: 'Be concise. Give short, direct answers without unnecessary detail.',
  formal: 'Use formal, professional language. Be precise and structured.',
  explanatory: 'Be thorough and educational. Explain concepts in detail with examples.',
};

interface UseChatStreamReturn {
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<void>;
  stopGeneration: () => void;
  isStreaming: boolean;
}

class ChatApiError extends Error {
  code: string | undefined;
  status: number | undefined;

  constructor(message: string, options: { code?: string; status?: number } = {}) {
    super(message);
    this.name = 'ChatApiError';
    this.code = options.code;
    this.status = options.status;
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readChatApiErrorPayload(
  payload: unknown,
  fallbackMessage: string,
): { message: string; code?: string } {
  if (!payload || typeof payload !== 'object') {
    return { message: fallbackMessage };
  }

  const body = payload as Record<string, unknown>;
  const topLevelMessage = readString(body['message']);
  const topLevelCode = readString(body['code']);
  const error = body['error'];

  if (typeof error === 'string') {
    return { message: readString(error) ?? fallbackMessage, code: topLevelCode };
  }

  if (error && typeof error === 'object') {
    const errorBody = error as Record<string, unknown>;
    const nestedMessage = readString(errorBody['message']);
    const nestedCode = readString(errorBody['code']);
    return {
      message: nestedMessage ?? topLevelMessage ?? fallbackMessage,
      code: nestedCode ?? topLevelCode,
    };
  }

  return { message: topLevelMessage ?? fallbackMessage, code: topLevelCode };
}

function getVisibleErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return 'An unknown error occurred';
}

function buildAssistantErrorContent(message: string): string {
  return `Error: ${message}\n\nTry again, or start a new chat if this response is stuck.`;
}

/**
 * Save a message to the database
 */
async function saveMessageToDb(
  conversationId: string,
  message: {
    id?: string;
    role: string;
    content: string;
    model?: string;
    metadata?: MessageMetadata;
  },
  authToken: string,
): Promise<{ id: string } | null> {
  try {
    const headers = await addCsrfHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    });
    const response = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: message.id,
        role: message.role,
        content: message.content,
        model: message.model,
        metadata: message.metadata,
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
  const { getToken } = useAuth();
  const abortControllerRef = useRef<AbortController | null>(null);

  // Store actions
  const addMessage = useChatStore((state) => state.addMessage);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const appendToMessage = useChatStore((state) => state.appendToMessage);
  const appendToThinking = useChatStore((state) => state.appendToThinking);
  const setSearching = useChatStore((state) => state.setSearching);
  const setSearchResults = useChatStore((state) => state.setSearchResults);
  const setExecutingCode = useChatStore((state) => state.setExecutingCode);
  const setToolTimeline = useChatStore((state) => state.setToolTimeline);
  const setCodeExecutionResult = useChatStore((state) => state.setCodeExecutionResult);
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
      const authToken = await getToken();
      if (!authToken) {
        throw new Error('Not authenticated');
      }

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
      // Skip DB persistence for temporary/incognito conversations
      const isTemporaryConversation = useChatStore
        .getState()
        .conversations.find((conversation) => conversation.id === conversationId)?.isTemporary;
      if (!isTemporaryConversation) {
        saveMessageToDb(
          conversationId,
          { id: userMessageId, role: 'user', content: content.trim() },
          authToken,
        )
          .then((saved) => {
            if (saved?.id && saved.id !== userMessageId) {
              updateMessage(userMessageId, { id: saved.id });
            }
          })
          .catch((err) => console.error('[useChatStream] Failed to save user message:', err));
      }

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

      const toolTimeline: MessageToolEntry[] = [];
      const toolStartTimes = new Map<string, number>();
      let currentSearchResults: MessageMetadata['searchResults'];
      let currentCodeExecutionResult: MessageMetadata['codeExecutionResult'];

      const publishToolTimeline = () => {
        if (toolTimeline.length === 0) return;
        setToolTimeline(
          assistantMessageId,
          toolTimeline.map((tool) => ({ ...tool })),
        );
      };

      const findLastToolIndex = (name: string, statuses?: MessageToolEntry['status'][]) => {
        for (let index = toolTimeline.length - 1; index >= 0; index -= 1) {
          const tool = toolTimeline[index];
          if (!tool || tool.name !== name) continue;
          if (!statuses || statuses.includes(tool.status)) return index;
        }
        return -1;
      };

      const createToolId = (name: string) =>
        `${assistantMessageId}-${name.replace(/[^a-z0-9_-]/gi, '-').toLowerCase()}-${
          toolTimeline.length + 1
        }`;

      const normalizeToolName = (name: unknown) =>
        typeof name === 'string' && name.trim() ? name.trim() : 'server_tool';

      const startTool = (rawName: unknown, args?: string) => {
        const name = normalizeToolName(rawName);
        const existingIndex = findLastToolIndex(name, ['pending', 'running']);
        if (existingIndex >= 0) {
          const existing = toolTimeline[existingIndex];
          if (existing) {
            existing.status = 'running';
            existing.args = args ?? existing.args;
          }
          publishToolTimeline();
          return;
        }

        const id = createToolId(name);
        toolStartTimes.set(id, Date.now());
        toolTimeline.push({
          id,
          name,
          status: 'running',
          args,
        });
        publishToolTimeline();
      };

      const finishTool = (
        rawName: unknown,
        status: Extract<MessageToolEntry['status'], 'completed' | 'failed'>,
        error?: string,
      ) => {
        const name = normalizeToolName(rawName);
        let index = findLastToolIndex(name, ['pending', 'running']);
        if (index < 0) {
          const id = createToolId(name);
          toolStartTimes.set(id, Date.now());
          toolTimeline.push({ id, name, status: 'running' });
          index = toolTimeline.length - 1;
        }

        const tool = toolTimeline[index];
        if (!tool) return;
        const startedAt = tool.id ? toolStartTimes.get(tool.id) : undefined;
        tool.status = status;
        tool.durationMs = startedAt ? Date.now() - startedAt : tool.durationMs;
        tool.error = error;
        publishToolTimeline();
      };

      const finishRunningTools = (
        status: Extract<MessageToolEntry['status'], 'completed' | 'failed'> = 'completed',
        error?: string,
      ) => {
        for (const tool of toolTimeline) {
          if (tool.status !== 'pending' && tool.status !== 'running') continue;
          const startedAt = tool.id ? toolStartTimes.get(tool.id) : undefined;
          tool.status = status;
          tool.durationMs = startedAt ? Date.now() - startedAt : tool.durationMs;
          tool.error = error;
        }
        publishToolTimeline();
      };

      const buildAssistantMetadata = (): MessageMetadata | undefined => {
        const metadata: MessageMetadata = {};
        if (toolTimeline.length > 0) {
          metadata.tools = toolTimeline.map((tool) => ({ ...tool }));
        }
        if (currentSearchResults && currentSearchResults.length > 0) {
          metadata.searchResults = currentSearchResults;
        }
        if (currentCodeExecutionResult) {
          metadata.codeExecutionResult = currentCodeExecutionResult;
        }

        return Object.keys(metadata).length > 0 ? metadata : undefined;
      };

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

        // Prepend the selected skill's body as a system message. This is injected
        // invisibly and does not appear in chat bubbles.
        if (options.skillBody) {
          apiMessages.unshift({ role: 'system', content: options.skillBody });
        }

        // Prepend a style system message when the user has selected a non-default style.
        // This is injected invisibly into the API call and does not appear in chat bubbles.
        // Placed after skillBody so style sits at index 0 (processed last by the model).
        if (options.styleMode && options.styleMode !== 'normal') {
          const styleInstruction = STYLE_SYSTEM_INSTRUCTIONS[options.styleMode];
          if (styleInstruction) {
            apiMessages.unshift({ role: 'system', content: styleInstruction });
          }
        }

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

        const headers = await addCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        });
        const thinkingState = useThinkingStore.getState();
        const thinkingEnabled = options.thinkingEnabled ?? thinkingState.enabled;
        const thinkingEffort = options.thinkingEffort ?? thinkingState.effort;
        const response = await fetch('/api/llm/v1/chat/completions', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            messages: apiMessages,
            stream: true,
            temperature: options.temperature,
            max_tokens: options.maxTokens,
            web_search: options.webSearch || undefined,
            web_fetch: options.webFetch || undefined,
            code_execution: options.codeExecution || undefined,
            thinking_mode: thinkingEnabled || undefined,
            effort: thinkingEnabled ? thinkingEffort : undefined,
            use_prompt_cache: true,
          }),
          signal: abortControllerRef.current.signal,
        });

        useAutoEconomyTrialStore.getState().applyHeaders(response.headers);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const { message, code } = readChatApiErrorPayload(
            errorData,
            `Request failed: ${response.status}`,
          );
          throw new ChatApiError(message, {
            code,
            status: response.status,
          });
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
        // Content buffer for split-chunk thinking marker detection.
        // SSE chunks can arrive mid-tag (e.g. "<thin" then "king>"), so we
        // accumulate raw content here and scan for complete markers before
        // dispatching to the thinking or regular content paths.
        let contentBuffer = '';

        // Minimum bytes to hold back so a split marker at the tail is caught
        // on the next iteration. Length of "</thinking>" minus 1 = 11 chars.
        const HOLD_BACK = 11;

        /**
         * Flush as much of contentBuffer as is safe without losing a partial
         * marker at the tail.
         *
         * The caller passes `isFinal = true` when the stream is done so we
         * emit everything regardless of a potential partial marker.
         */
        const flushContentBuffer = (isFinal = false) => {
          // Process all complete <thinking> / </thinking> markers in the buffer.
          while (true) {
            const openIdx = contentBuffer.indexOf('<thinking>');
            const closeIdx = contentBuffer.indexOf('</thinking>');

            if (!inThinkingBlock && openIdx !== -1) {
              // Emit everything before the marker as regular content.
              const before = contentBuffer.slice(0, openIdx);
              if (before) {
                fullAssistantContent += before;
                appendToMessage(assistantMessageId, before);
              }
              inThinkingBlock = true;
              updateMessage(assistantMessageId, {
                metadata: {
                  isThinkingStreaming: true,
                  thinkingStartedAt: new Date().toISOString(),
                },
              });
              contentBuffer = contentBuffer.slice(openIdx + '<thinking>'.length);
              continue;
            }

            if (inThinkingBlock && closeIdx !== -1) {
              // Emit thinking content before the closing marker.
              const thinkingPart = contentBuffer.slice(0, closeIdx);
              if (thinkingPart) {
                appendToThinking(assistantMessageId, thinkingPart);
              }
              inThinkingBlock = false;
              updateMessage(assistantMessageId, {
                metadata: {
                  isThinkingStreaming: false,
                  thinkingCompletedAt: new Date().toISOString(),
                },
              });
              contentBuffer = contentBuffer.slice(closeIdx + '</thinking>'.length);
              continue;
            }

            // No complete marker found. If final, emit everything; otherwise
            // hold back enough bytes to catch a split marker on the next call.
            if (isFinal) {
              if (contentBuffer) {
                if (inThinkingBlock) {
                  appendToThinking(assistantMessageId, contentBuffer);
                } else {
                  fullAssistantContent += contentBuffer;
                  appendToMessage(assistantMessageId, contentBuffer);
                }
                contentBuffer = '';
              }
            } else if (contentBuffer.length > HOLD_BACK) {
              const safe = contentBuffer.slice(0, contentBuffer.length - HOLD_BACK);
              if (inThinkingBlock) {
                appendToThinking(assistantMessageId, safe);
              } else {
                fullAssistantContent += safe;
                appendToMessage(assistantMessageId, safe);
              }
              contentBuffer = contentBuffer.slice(contentBuffer.length - HOLD_BACK);
            }
            break;
          }
        };

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
              // Flush any remaining buffered content before closing.
              flushContentBuffer(true);
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
              // Clear any lingering tool indicators
              finishRunningTools();
              setSearching(assistantMessageId, false);
              setExecutingCode(assistantMessageId, false);
              if (fullAssistantContent && !isTemporaryConversation) {
                saveMessageToDb(
                  conversationId,
                  {
                    id: assistantMessageId,
                    role: 'assistant',
                    content: fullAssistantContent,
                    model,
                    metadata: buildAssistantMetadata(),
                  },
                  authToken,
                )
                  .then((saved) => {
                    if (saved?.id && saved.id !== assistantMessageId) {
                      updateMessage(assistantMessageId, { id: saved.id });
                    }
                  })
                  .catch((err) =>
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
                // Accumulate into content buffer and scan for split thinking markers.
                contentBuffer += chunk;
                flushContentBuffer(false);
              }

              // Handle server-managed tool status indicators
              const toolStatus = parsed.choices?.[0]?.delta?.x_tool_status;
              if (toolStatus?.type === 'server_tool_use') {
                startTool(toolStatus.name, toolStatus.status);
              }
              if (toolStatus?.status === 'searching' || toolStatus?.status === 'fetching') {
                setSearching(assistantMessageId, true);
              } else if (toolStatus?.status === 'executing') {
                setExecutingCode(assistantMessageId, true);
              }

              // Handle code execution result
              const codeResultBlock = parsed.choices?.[0]?.delta?.x_code_result;
              if (codeResultBlock) {
                const content = Array.isArray(codeResultBlock.content)
                  ? (codeResultBlock.content as Record<string, unknown>[])
                  : [];
                const textItem = content.find((c) => c['type'] === 'text');
                const rawText = (textItem?.['text'] as string) || '';
                const images = content
                  .filter((c) => c['type'] === 'image')
                  .map((c) => {
                    const src = c['source'] as Record<string, unknown> | undefined;
                    return {
                      mediaType: (src?.['media_type'] as string) || 'image/png',
                      data: (src?.['data'] as string) || '',
                    };
                  })
                  .filter((img) => img.data);

                // Parse stdout/stderr/return_code from the text block.
                // Anthropic formats this as: <stdout>...</stdout><stderr>...</stderr><return_code>N</return_code>
                const stdout = rawText.match(/<stdout>([\s\S]*?)<\/stdout>/)?.[1] ?? rawText;
                const stderr = rawText.match(/<stderr>([\s\S]*?)<\/stderr>/)?.[1] ?? '';
                const returnCode = parseInt(
                  rawText.match(/<return_code>(\d+)<\/return_code>/)?.[1] ?? '0',
                  10,
                );
                currentCodeExecutionResult = {
                  stdout,
                  stderr,
                  returnCode,
                  images: images.length > 0 ? images : undefined,
                };
                setCodeExecutionResult(assistantMessageId, currentCodeExecutionResult);
                finishTool('code_execution', 'completed');
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
                  currentSearchResults = results;
                  setSearchResults(assistantMessageId, results);
                  finishTool('web_search', 'completed');
                }
              }

              // Handle finish reason
              // We keep the originally selected model name for display consistency - the API
              // may return a different model name due to fallback or version differences.
              if (parsed.choices?.[0]?.finish_reason || parsed.type === 'message_stop') {
                updateMessage(assistantMessageId, { isStreaming: false });
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }

        // Flush any remaining buffered content (in case [DONE] wasn't received)
        flushContentBuffer(true);
        // Save the complete assistant message to database (in case [DONE] wasn't received)
        finishRunningTools();
        if (fullAssistantContent && !isTemporaryConversation) {
          saveMessageToDb(
            conversationId,
            {
              id: assistantMessageId,
              role: 'assistant',
              content: fullAssistantContent,
              model,
              metadata: buildAssistantMetadata(),
            },
            authToken,
          )
            .then((saved) => {
              if (saved?.id && saved.id !== assistantMessageId) {
                updateMessage(assistantMessageId, { id: saved.id });
              }
            })
            .catch((err) =>
              console.error('[useChatStream] Failed to save assistant message:', err),
            );
        }

        // Ensure streaming is stopped
        stopStreaming();
        setLoading(false);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          // User cancelled - update message to show partial content
          updateMessage(assistantMessageId, { isStreaming: false });
        } else {
          const errorMessage = getVisibleErrorMessage(error);
          const errorCode = error instanceof ChatApiError ? error.code : undefined;
          if (isAutoEconomyTrialErrorCode(errorCode)) {
            if (errorCode === 'website_trial_prompt_limit_reached') {
              useAutoEconomyTrialStore.getState().markExhausted();
            }
            finishRunningTools('failed', errorMessage);
            updateMessage(assistantMessageId, {
              isStreaming: false,
              content: '',
              error: false,
              metadata: {
                paywall: buildAutoEconomyTrialPaywallSlot(errorCode, errorMessage),
              },
            });
            setError(errorMessage);
            stopStreaming();
            setLoading(false);
            return;
          }

          finishRunningTools('failed', errorMessage);

          updateMessage(assistantMessageId, {
            isStreaming: false,
            content: buildAssistantErrorContent(errorMessage),
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
      setExecutingCode,
      setToolTimeline,
      setCodeExecutionResult,
      startStreaming,
      stopStreaming,
      setLoading,
      setError,
      getToken,
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

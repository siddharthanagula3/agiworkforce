'use client';

/**
 * Web implementation of the `@agiworkforce/stores` `ChatStorePort`.
 *
 * This is the load-bearing transport seam between the shared vanilla chat store
 * (`createChatStore`) and the web surface's backend:
 *   - `sendChat`   → SSE fetch to `/api/llm/v1/chat/completions`
 *   - `loadConversations` / CRUD → `/api/chat/conversations`
 *   - `persistMessage` → `POST /api/chat/conversations/{id}/messages` (skipLlm)
 *
 * The port does NOT import `next/navigation`, `zustand`, or any store directly.
 * It takes a `getToken` function (from `@clerk/nextjs useAuth().getToken`) and
 * the web CSRF helper as constructor params so the port stays tree-shakeable and
 * testable without a full Next.js environment.
 *
 * IMPORTANT: The actual `/chat` page (`WebChatPage.tsx`) currently wires its
 * streaming through `useChatStream.ts`, which calls `useChatStore` methods that
 * have the same signatures as the shared store's actions (by design). The shared
 * store's method names intentionally match — see `packages/stores/src/chat/chatStore.ts`
 * header comment. This file formalises the port contract and is used by any
 * consumer that wants to instantiate the shared `createChatStore` with web's
 * transport (e.g. the desktop-parity proof slice).
 *
 * @module lib/chat/webChatPort
 */

import type {
  ChatStorePort,
  SendChatParams,
  SendChatCallbacks,
  ChatConversation,
  ChatMessage,
  ChatToolEntry,
} from '@agiworkforce/stores';
import { addCsrfHeaders } from '@/lib/client/csrf';
import {
  createSendReplayMetadata,
  hasWebSearchSources,
} from '@/features/chat/types/message-metadata';
import {
  buildFreeTrialPaywallSlot,
  isFreeTrialErrorCode,
} from '@/features/chat/stores/freeTrialStore';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readChatApiError(payload: unknown, fallback: string): { message: string; code?: string } {
  if (!payload || typeof payload !== 'object') return { message: fallback };
  const body = payload as Record<string, unknown>;
  const topMessage = readString(body['message']);
  const topCode = readString(body['code']);
  const error = body['error'];
  if (typeof error === 'string') return { message: readString(error) ?? fallback, code: topCode };
  if (error && typeof error === 'object') {
    const eb = error as Record<string, unknown>;
    return {
      message: readString(eb['message']) ?? topMessage ?? fallback,
      code: readString(eb['code']) ?? topCode,
    };
  }
  return { message: topMessage ?? fallback, code: topCode };
}

// Minimum byte look-back to avoid splitting a `</thinking>` marker across chunks.
const HOLD_BACK = 11;

// ---------------------------------------------------------------------------
// Port factory
// ---------------------------------------------------------------------------

export interface WebChatPortOptions {
  /** Token getter from Clerk `useAuth().getToken`. */
  getToken: () => Promise<string | null>;
}

/**
 * Build a `ChatStorePort` wired against the web API surface.
 *
 * @example
 * ```ts
 * const { getToken } = useAuth();
 * const port = makeWebChatPort({ getToken });
 * const store = createChatStore({ port, initialModelId: 'auto-balanced' });
 * ```
 */
export function makeWebChatPort(options: WebChatPortOptions): ChatStorePort {
  const { getToken } = options;

  // --- helpers ---

  async function authedHeaders(extra?: Record<string, string>) {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');
    return addCsrfHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(extra ?? {}),
    });
  }

  // --- port methods ---

  const loadConversations: ChatStorePort['loadConversations'] = async () => {
    const headers = await authedHeaders();
    const res = await fetch('/api/chat/conversations', { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(readChatApiError(err, 'Failed to fetch conversations').message);
    }
    const data = await res.json();
    return ((data.conversations ?? []) as Record<string, unknown>[]).map(
      (c): ChatConversation => ({
        id: String(c['id'] ?? ''),
        title: String(c['title'] ?? ''),
        updatedAt: String(c['updated_at'] ?? new Date().toISOString()),
        pinned: Boolean(c['pinned']),
        projectId: (c['project_id'] as string | null) ?? null,
      }),
    );
  };

  const createRemoteConversation: ChatStorePort['createRemoteConversation'] = async (title) => {
    const headers = await authedHeaders();
    const res = await fetch('/api/chat/conversations', {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: title ?? 'New Chat' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(readChatApiError(err, 'Failed to create conversation').message);
    }
    const data = await res.json();
    const c = data.conversation as Record<string, unknown>;
    return {
      id: String(c['id'] ?? ''),
      title: String(c['title'] ?? ''),
      updatedAt: String(c['updated_at'] ?? new Date().toISOString()),
    };
  };

  const loadConversationMessages: ChatStorePort['loadConversationMessages'] = async (id) => {
    const headers = await authedHeaders();
    const res = await fetch(`/api/chat/conversations/${id}`, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(readChatApiError(err, 'Failed to load conversation').message);
    }
    const data = await res.json();
    return ((data.messages ?? []) as Record<string, unknown>[]).map(
      (m): ChatMessage => ({
        id: String(m['id'] ?? ''),
        conversationId: id,
        role: (m['role'] as 'user' | 'assistant' | 'system') ?? 'assistant',
        content: String(m['content'] ?? ''),
        createdAt: String(m['created_at'] ?? new Date().toISOString()),
        model: m['model'] as string | undefined,
        metadata: m['metadata'] as Record<string, unknown> | undefined,
      }),
    );
  };

  const persistMessage: ChatStorePort['persistMessage'] = async (conversationId, message) => {
    const headers = await authedHeaders();
    await fetch(`/api/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: message.id,
        role: message.role,
        content: message.content,
        model: message.model,
        metadata: message.metadata,
        skipLlm: true,
      }),
    });
  };

  const deleteRemoteConversation: ChatStorePort['deleteRemoteConversation'] = async (id) => {
    const headers = await authedHeaders();
    const res = await fetch(`/api/chat/conversations/${id}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(readChatApiError(err, 'Failed to delete conversation').message);
    }
  };

  /**
   * Core send: SSE fetch to `/api/llm/v1/chat/completions`.
   *
   * Mirrors the logic in `useChatStream.ts` exactly (same chunk parsing,
   * thinking-block detection, tool-status, search-results, code-execution)
   * but routes events through the shared port callbacks instead of calling
   * the store directly. This lets the shared `createChatStore.send()` drive
   * streaming from the same backend without coupling to web's React store.
   */
  const sendChat: ChatStorePort['sendChat'] = async (
    params: SendChatParams,
    callbacks: SendChatCallbacks,
  ) => {
    const {
      conversationId: _conversationId,
      assistantMessageId,
      content: _content,
      model,
      messages,
      webSearch,
      thinkingEnabled,
      codeExecution,
      effort,
      extra,
      signal,
    } = params;

    const skillBody = extra?.['skillBody'] as string | undefined;
    const styleMode = extra?.['styleMode'] as string | undefined;

    const sendReplay = createSendReplayMetadata({
      webSearchEnabled: webSearch,
      thinkingEnabled,
      codeExecutionEnabled: codeExecution,
      styleMode,
      hasSkillInstruction: Boolean(skillBody),
    });

    const token = await getToken();
    if (!token) {
      callbacks.onError('Not authenticated');
      return;
    }

    type MessageContent =
      | string
      | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    type ApiMessage = { role: string; content: MessageContent };

    const apiMessages: ApiMessage[] = messages
      .filter((m) => m.id !== assistantMessageId)
      .map((m) => ({ role: m.role, content: m.content as MessageContent }));

    if (skillBody) apiMessages.unshift({ role: 'system', content: skillBody });

    const STYLE_INSTRUCTIONS: Record<string, string> = {
      concise: 'Be concise. Give short, direct answers without unnecessary detail.',
      formal: 'Use formal, professional language. Be precise and structured.',
      explanatory: 'Be thorough and educational. Explain concepts in detail with examples.',
    };
    if (styleMode && styleMode !== 'normal') {
      const inst = STYLE_INSTRUCTIONS[styleMode];
      if (inst) apiMessages.unshift({ role: 'system', content: inst });
    }

    const headers = await addCsrfHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    });

    const response = await fetch('/api/llm/v1/chat/completions', {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        model,
        messages: apiMessages,
        stream: true,
        web_search: webSearch || undefined,
        code_execution: codeExecution || undefined,
        thinking_mode: thinkingEnabled || undefined,
        effort: thinkingEnabled ? effort : undefined,
        use_prompt_cache: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const { message, code } = readChatApiError(errorData, `Request failed: ${response.status}`);

      if (isFreeTrialErrorCode(code)) {
        callbacks.onMessagePatch({
          isStreaming: false,
          content: '',
          metadata: {
            paywall: buildFreeTrialPaywallSlot(code!, message),
          },
        });
        callbacks.onError(message);
        return;
      }
      throw new Error(message);
    }

    if (!response.body) throw new Error('No response body');

    // ---- SSE parsing (mirrors useChatStream.ts) ----
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let inThinkingBlock = false;
    let contentBuffer = '';

    const toolTimeline: ChatToolEntry[] = [];
    const toolStartTimes = new Map<string, number>();
    let currentSearchResults: Array<{ url: string; title: string; snippet: string }> | undefined;

    const publishTools = () => {
      if (toolTimeline.length === 0) return;
      callbacks.onToolTimeline(toolTimeline.map((t) => ({ ...t })));
    };

    const findLastTool = (name: string, statuses?: ChatToolEntry['status'][]) => {
      for (let i = toolTimeline.length - 1; i >= 0; i--) {
        const t = toolTimeline[i];
        if (!t || t.name !== name) continue;
        if (!statuses || statuses.includes(t.status)) return i;
      }
      return -1;
    };

    const startTool = (rawName: unknown, args?: string) => {
      const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : 'server_tool';
      const idx = findLastTool(name, ['pending', 'running']);
      if (idx >= 0) {
        const t = toolTimeline[idx];
        if (t) {
          t.status = 'running';
          t.args = args ?? t.args;
        }
        publishTools();
        return;
      }
      const id = `${assistantMessageId}-${name.replace(/[^a-z0-9_-]/gi, '-').toLowerCase()}-${toolTimeline.length + 1}`;
      toolStartTimes.set(id, Date.now());
      toolTimeline.push({ id, name, status: 'running', args });
      publishTools();
    };

    const finishTool = (rawName: unknown, status: 'completed' | 'failed', error?: string) => {
      const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : 'server_tool';
      let idx = findLastTool(name, ['pending', 'running']);
      if (idx < 0) {
        const id = `${assistantMessageId}-${name}-${toolTimeline.length + 1}`;
        toolStartTimes.set(id, Date.now());
        toolTimeline.push({ id, name, status: 'running' });
        idx = toolTimeline.length - 1;
      }
      const t = toolTimeline[idx];
      if (!t) return;
      const start = t.id ? toolStartTimes.get(t.id) : undefined;
      t.status = status;
      t.durationMs = start ? Date.now() - start : t.durationMs;
      t.error = error;
      publishTools();
    };

    const finishRunning = (status: 'completed' | 'failed' = 'completed', error?: string) => {
      for (const t of toolTimeline) {
        if (t.status !== 'pending' && t.status !== 'running') continue;
        const start = t.id ? toolStartTimes.get(t.id) : undefined;
        t.status = status;
        t.durationMs = start ? Date.now() - start : t.durationMs;
        t.error = error;
      }
      publishTools();
    };

    const flushContent = (isFinal = false) => {
      while (true) {
        const openIdx = contentBuffer.indexOf('<thinking>');
        const closeIdx = contentBuffer.indexOf('</thinking>');

        if (!inThinkingBlock && openIdx !== -1) {
          const before = contentBuffer.slice(0, openIdx);
          if (before) {
            fullContent += before;
            callbacks.onContent(before);
          }
          inThinkingBlock = true;
          callbacks.onMessagePatch({
            metadata: { isThinkingStreaming: true, thinkingStartedAt: new Date().toISOString() },
          });
          contentBuffer = contentBuffer.slice(openIdx + '<thinking>'.length);
          continue;
        }

        if (inThinkingBlock && closeIdx !== -1) {
          const part = contentBuffer.slice(0, closeIdx);
          if (part) callbacks.onThinking(part);
          inThinkingBlock = false;
          callbacks.onMessagePatch({
            metadata: { isThinkingStreaming: false, thinkingCompletedAt: new Date().toISOString() },
          });
          contentBuffer = contentBuffer.slice(closeIdx + '</thinking>'.length);
          continue;
        }

        if (isFinal) {
          if (contentBuffer) {
            if (inThinkingBlock) callbacks.onThinking(contentBuffer);
            else {
              fullContent += contentBuffer;
              callbacks.onContent(contentBuffer);
            }
            contentBuffer = '';
          }
        } else if (contentBuffer.length > HOLD_BACK) {
          const safe = contentBuffer.slice(0, contentBuffer.length - HOLD_BACK);
          if (inThinkingBlock) callbacks.onThinking(safe);
          else {
            fullContent += safe;
            callbacks.onContent(safe);
          }
          contentBuffer = contentBuffer.slice(contentBuffer.length - HOLD_BACK);
        }
        break;
      }
    };

    const handleDone = () => {
      flushContent(true);
      if (inThinkingBlock) {
        callbacks.onMessagePatch({
          metadata: { isThinkingStreaming: false, thinkingCompletedAt: new Date().toISOString() },
        });
        inThinkingBlock = false;
      }
      finishRunning();
      callbacks.onSearching(false);
      callbacks.onExecutingCode(false);
      if (sendReplay && fullContent) {
        callbacks.onMessagePatch({ metadata: { sendReplay } });
      }
      if (currentSearchResults && hasWebSearchSources(currentSearchResults)) {
        callbacks.onSearchResults(currentSearchResults);
      }
      callbacks.onDone();
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          handleDone();
          return;
        }

        try {
          const parsed = JSON.parse(data);

          let chunk: string | null = null;
          if (parsed.choices?.[0]?.delta?.content != null) {
            chunk = parsed.choices[0].delta.content;
          } else if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            chunk = parsed.delta.text;
          }
          if (chunk !== null) {
            contentBuffer += chunk;
            flushContent(false);
          }

          const toolStatus = parsed.choices?.[0]?.delta?.x_tool_status;
          if (toolStatus?.type === 'server_tool_use') startTool(toolStatus.name, toolStatus.status);
          if (toolStatus?.status === 'searching' || toolStatus?.status === 'fetching') {
            callbacks.onSearching(true);
          } else if (toolStatus?.status === 'executing') {
            callbacks.onExecutingCode(true);
          }

          const codeResult = parsed.choices?.[0]?.delta?.x_code_result;
          if (codeResult) {
            const items = Array.isArray(codeResult.content)
              ? (codeResult.content as Record<string, unknown>[])
              : [];
            const textItem = items.find((c) => c['type'] === 'text');
            const rawText = (textItem?.['text'] as string) || '';
            const images = items
              .filter((c) => c['type'] === 'image')
              .map((c) => {
                const src = c['source'] as Record<string, unknown> | undefined;
                return {
                  mediaType: (src?.['media_type'] as string) || 'image/png',
                  data: (src?.['data'] as string) || '',
                };
              })
              .filter((img) => img.data);
            const stdout = rawText.match(/<stdout>([\s\S]*?)<\/stdout>/)?.[1] ?? rawText;
            const stderr = rawText.match(/<stderr>([\s\S]*?)<\/stderr>/)?.[1] ?? '';
            const returnCode = parseInt(
              rawText.match(/<return_code>(\d+)<\/return_code>/)?.[1] ?? '0',
              10,
            );
            callbacks.onCodeExecutionResult({
              stdout,
              stderr,
              returnCode,
              images: images.length > 0 ? images : undefined,
            });
            finishTool('code_execution', 'completed');
          }

          const searchBlock = parsed.choices?.[0]?.delta?.x_search_results;
          if (searchBlock?.content && Array.isArray(searchBlock.content)) {
            const results = (searchBlock.content as Record<string, unknown>[])
              .filter((r) => r['type'] === 'web_search_result' && r['url'])
              .map((r) => ({
                url: r['url'] as string,
                title: (r['title'] as string) || (r['url'] as string),
                snippet: (r['encrypted_content'] as string) || '',
              }));
            if (results.length > 0) {
              currentSearchResults = results;
              callbacks.onSearchResults(results);
              finishTool('web_search', 'completed');
            }
          }

          if (parsed.choices?.[0]?.finish_reason || parsed.type === 'message_stop') {
            callbacks.onMessagePatch({ isStreaming: false });
          }
        } catch {
          // ignore partial chunks
        }
      }
    }

    // No [DONE] received — flush and finalize
    flushContent(true);
    finishRunning();
    callbacks.onDone();
  };

  return {
    loadConversations,
    createRemoteConversation,
    loadConversationMessages,
    persistMessage,
    deleteRemoteConversation,
    sendChat,
  };
}

'use client';

import { createContext, useCallback, useContext, useRef, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { toast } from 'sonner';
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
  buildFreeTrialPaywallSlot,
  isFreeTrialErrorCode,
  useFreeTrialStore,
} from '@/features/chat/stores/freeTrialStore';
import {
  createSendReplayMetadata,
  hasWebSearchSources,
} from '@/features/chat/types/message-metadata';

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
  /** Display name of the active skill, used to emit a timeline step. */
  skillName?: string;
  /** Deep Research mode: forces web_search and injects a research system prompt. */
  research?: boolean;
}

const STYLE_SYSTEM_INSTRUCTIONS: Record<string, string> = {
  concise: 'Be concise. Give short, direct answers without unnecessary detail.',
  formal: 'Use formal, professional language. Be precise and structured.',
  explanatory: 'Be thorough and educational. Explain concepts in detail with examples.',
};

/** Decision the user made on a single pending tool call. */
export type ToolApprovalDecision = 'approved' | 'rejected';

interface UseChatStreamReturn {
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<void>;
  stopGeneration: () => void;
  /**
   * Resolve one pending tool-approval card (see the manual-approval flow). Records
   * the per-tool_call decision; once EVERY pending tool call in the suspended turn
   * is decided, POSTs the resume request (thread + suspended assistant tool_call
   * turn + tool_approvals) to /api/llm/v1/chat/completions/approve and streams the
   * continuation into the same assistant message.
   */
  resolveToolApproval: (
    assistantMessageId: string,
    toolCallId: string,
    decision: ToolApprovalDecision,
  ) => Promise<void>;
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

const DEFAULT_SAVE_MAX_ATTEMPTS = 3;
const DEFAULT_SAVE_RETRY_DELAY_MS = 350;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Provider that yields a CURRENTLY-valid Clerk session token. Clerk JWTs are
 * short-lived (~60s default), so a token captured when a request STARTS is
 * expired by the time a long web-search / deep-research / long-generation
 * stream finishes — persisting the assistant turn with that stale Bearer then
 * fails (401 on the save route, plus 403 CSRF_VALIDATION_FAILED because an
 * expired Bearer no longer qualifies for the Bearer CSRF-bypass and the
 * cookie-derived session no longer matches the userId-bound CSRF token). The
 * save path therefore takes a PROVIDER, not a captured string, and calls it at
 * save time (and on every retry) so `getToken()` hands back a fresh token.
 */
type AuthTokenProvider = () => Promise<string>;

interface SaveRetryOptions {
  /** Total attempts including the first try. Default 3 (1 + 2 retries). */
  maxAttempts?: number;
  /** Base backoff between attempts; multiplied by attempt number. Default 350ms. */
  retryDelayMs?: number;
}

/**
 * Persist a chat message to the database, returning the saved row id.
 *
 * Durability contract (P1 silent-data-loss fix): the previous implementation
 * swallowed every non-OK response and returned null, so a transient 500 /
 * network blip silently lost the assistant (and sometimes the paired user)
 * turn on reload — the store does not persist messages. This version:
 *   - retries transient failures (5xx / network) with backoff, since most
 *     persistence blips self-heal on a second attempt;
 *   - THROWS on a hard, non-recoverable failure (any non-retryable 4xx
 *     INCLUDING 429, or 5xx / network after exhausting retries) so the caller
 *     surfaces it to the user instead of dropping the turn silently. A 429 here
 *     means the persist write was rate-limited and the turn is NOT saved — there
 *     is no automatic re-save, so it is surfaced like any other failure rather
 *     than swallowed. (Retrying a 429 in-request is futile: the rate-limit
 *     window outlasts the request, so 429 is not retried, only surfaced.)
 * The POST route is idempotent on the client-supplied id (ON CONFLICT), so a
 * retry of an already-committed message cannot create a duplicate.
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
  getAuthToken: AuthTokenProvider,
  options: SaveRetryOptions = {},
): Promise<{ id: string }> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_SAVE_MAX_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_SAVE_RETRY_DELAY_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    try {
      // Fetch a FRESH token for THIS attempt. Reusing a token captured when the
      // request started would already be expired after a long stream (see
      // AuthTokenProvider). Clerk's getToken() returns a valid token, refreshing
      // the session as needed, so a slow response always persists.
      const authToken = await getAuthToken();
      const headers = await addCsrfHeaders({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      });
      response = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
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
    } catch (networkError) {
      // Network-level failure (offline, DNS, connection reset) — transient.
      lastError = networkError;
      if (attempt < maxAttempts) {
        await delay(retryDelayMs * attempt);
        continue;
      }
      throw networkError instanceof Error
        ? networkError
        : new Error('Network error while saving message');
    }

    if (response.ok) {
      const data = await response.json().catch(() => ({}) as Record<string, unknown>);
      // On a 200 with no body we still know the row was saved; fall back to the
      // id we sent (the route uses it via coalesce) so the store id stays in
      // sync — never invent a random id that won't match the DB.
      return (
        (data as { message?: { id: string } }).message ||
        (data as { userMessage?: { id: string } }).userMessage ||
        (message.id ? { id: message.id } : { id: crypto.randomUUID() })
      );
    }

    // A 429 means the persist write was rate-limited, so the turn was NOT saved.
    // It is not retried (the rate-limit window outlasts the request) — fall
    // through to the throw below so the caller surfaces it instead of silently
    // dropping the turn. Logged distinctly for diagnostics.
    if (response.status === 429) {
      console.warn('[useChatStream] Message persistence rate-limited (429); turn not saved');
    }

    // 5xx is transient — retry before giving up.
    if (response.status >= 500 && attempt < maxAttempts) {
      lastError = new Error(`Save failed: ${response.status}`);
      await delay(retryDelayMs * attempt);
      continue;
    }

    // Non-retryable 4xx, or a 5xx after exhausting retries: a real failure the
    // caller must surface so the turn is not silently lost.
    throw new Error(`Failed to save message to DB: ${response.status}`);
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to save message to DB');
}

/**
 * Surface a message-persistence failure to the user instead of dropping the
 * turn silently. Called from the save callers' catch handlers (a quiet 429
 * returns null and never reaches here).
 */
function notifyPersistenceFailure(kind: 'user' | 'assistant', error: unknown): void {
  console.error(`[useChatStream] Failed to save ${kind} message:`, error);
  toast.error(
    kind === 'assistant'
      ? "Couldn't save this response — it may not appear after you reload."
      : "Couldn't save your message — it may not appear after you reload.",
    { duration: 6000 },
  );
}

export { saveMessageToDb, notifyPersistenceFailure };

// ─── Shared SSE-stream types + module-level approval registry ───────────────

type MessageContent = string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
type ApiMessage = {
  role: string;
  content: MessageContent;
  tool_calls?: unknown[];
  tool_call_id?: string;
};

/** One tool call the server suspended for user approval (from x_tool_approval_request). */
interface PendingApprovalCall {
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * Context captured for a suspended turn so the resume request can be rebuilt
 * statelessly (the server keeps no loop state). Keyed by assistantMessageId in a
 * MODULE-level registry so any component (e.g. a per-message MessageBubble) can
 * resolve the approval, not only the hook instance that sent the message.
 */
interface PendingTurn {
  priorMessages: ApiMessage[];
  model: string;
  conversationId: string;
  isTemporaryConversation: boolean;
  calls: PendingApprovalCall[];
  decisions: Map<string, ToolApprovalDecision>;
  /** Set once the resume request has been dispatched, to prevent double-submit. */
  resolving: boolean;
}

const pendingTurns = new Map<string, PendingTurn>();

/** TEST-ONLY: clear the module-level pending-approval registry between tests. */
export function __resetPendingTurnsForTests(): void {
  pendingTurns.clear();
}

/**
 * Context carrying the tool-approval resolver down to per-message components
 * (MessageBubble) WITHOUT prop-drilling through the memoized message-list layers.
 * The provider is mounted by the chat page (which owns the Clerk-authenticated
 * resolver); `useToolApprovalResolver()` returns `null` when no provider is
 * present, so a standalone/provider-less render (e.g. unit tests) simply leaves
 * the approve/reject affordances unwired instead of calling useAuth and throwing.
 */
type ResolveToolApprovalFn = UseChatStreamReturn['resolveToolApproval'];
const ToolApprovalContext = createContext<ResolveToolApprovalFn | null>(null);
export const ToolApprovalProvider = ToolApprovalContext.Provider;
export function useToolApprovalResolver(): ResolveToolApprovalFn | null {
  return useContext(ToolApprovalContext);
}

interface StreamOutcome {
  /** True when the turn suspended on a tool-approval request (no final answer yet). */
  suspended: boolean;
  pendingCalls: PendingApprovalCall[];
}

interface ConsumeStreamContext {
  response: Response;
  assistantMessageId: string;
  model: string;
  conversationId: string;
  isTemporaryConversation: boolean;
  getAuthToken: AuthTokenProvider;
  /** Seed the accumulated assistant text (for the resume continuation). */
  seedContent?: string;
  /** Seed the tool timeline (for the resume continuation, so prior cards persist). */
  seedTools?: MessageToolEntry[];
}

/**
 * Consume an OpenAI-compatible SSE stream into the given assistant message.
 * Owns the thinking-marker holdback, tool-timeline bookkeeping, x_tool_* event
 * handling, and the terminal persistence + streaming teardown. Shared by
 * `sendMessage` (initial request) and `resolveToolApproval` (resume
 * continuation) so both drive IDENTICAL rendering + persistence.
 *
 * Returns a StreamOutcome describing whether the turn suspended on a
 * tool-approval request and, if so, which tool calls are pending.
 */
async function consumeAssistantStream(ctx: ConsumeStreamContext): Promise<StreamOutcome> {
  const {
    response,
    assistantMessageId,
    model,
    conversationId,
    isTemporaryConversation,
    getAuthToken,
  } = ctx;

  const store = useChatStore.getState();
  const updateMessage = store.updateMessage;
  const appendToMessage = store.appendToMessage;
  const appendToThinking = store.appendToThinking;
  const setSearching = store.setSearching;
  const setExecutingCode = store.setExecutingCode;
  const setSearchResults = store.setSearchResults;
  const setCodeExecutionResult = store.setCodeExecutionResult;
  const setToolTimeline = store.setToolTimeline;
  const stopStreaming = store.stopStreaming;
  const setLoading = store.setLoading;

  const toolTimeline: MessageToolEntry[] = ctx.seedTools
    ? ctx.seedTools.map((t) => ({ ...t }))
    : [];
  const toolStartTimes = new Map<string, number>();
  const pendingCalls: PendingApprovalCall[] = [];
  let suspended = false;
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

  const startTool = (
    rawName: unknown,
    args?: string,
    statusPhrase?: string,
    parameters?: Record<string, unknown>,
  ) => {
    const name = normalizeToolName(rawName);
    const existingIndex = findLastToolIndex(name, ['pending', 'running']);
    if (existingIndex >= 0) {
      const existing = toolTimeline[existingIndex];
      if (existing) {
        existing.status = 'running';
        existing.args = args ?? existing.args;
        if (statusPhrase) existing.statusPhrase = statusPhrase;
        if (parameters && Object.keys(parameters).length > 0) existing.parameters = parameters;
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
      statusPhrase,
      parameters,
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
      // Leave awaiting_approval cards untouched — a suspended turn must not be
      // force-completed by the trailing flush; it is resolved by the user.
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
    if (hasWebSearchSources(currentSearchResults)) {
      metadata.searchResults = currentSearchResults;
    }
    if (currentCodeExecutionResult) {
      metadata.codeExecutionResult = currentCodeExecutionResult;
    }
    return Object.keys(metadata).length > 0 ? metadata : undefined;
  };

  const persistAssistant = (fullContent: string) => {
    if (!fullContent || isTemporaryConversation) return;
    saveMessageToDb(
      conversationId,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: fullContent,
        model,
        metadata: buildAssistantMetadata(),
      },
      getAuthToken,
    )
      .then((saved) => {
        if (saved?.id && saved.id !== assistantMessageId) {
          updateMessage(assistantMessageId, { id: saved.id });
        }
      })
      .catch((err) => notifyPersistenceFailure('assistant', err));
  };

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullAssistantContent = ctx.seedContent ?? '';
  let inThinkingBlock = false;
  let contentBuffer = '';

  const HOLD_BACK = 11;

  const flushContentBuffer = (isFinal = false) => {
    while (true) {
      const openIdx = contentBuffer.indexOf('<thinking>');
      const closeIdx = contentBuffer.indexOf('</thinking>');

      if (!inThinkingBlock && openIdx !== -1) {
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

  // Seed the store with any prior tool cards so the resume continuation renders
  // them alongside new events.
  if (toolTimeline.length > 0) publishToolTimeline();

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
        flushContentBuffer(true);
        if (inThinkingBlock) {
          updateMessage(assistantMessageId, {
            metadata: {
              isThinkingStreaming: false,
              thinkingCompletedAt: new Date().toISOString(),
            },
          });
          inThinkingBlock = false;
        }
        finishRunningTools();
        setSearching(assistantMessageId, false);
        setExecutingCode(assistantMessageId, false);
        persistAssistant(fullAssistantContent);
        stopStreaming();
        setLoading(false);
        return { suspended, pendingCalls };
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
          flushContentBuffer(false);
        }

        // Tool status indicators.
        const toolStatus = parsed.choices?.[0]?.delta?.x_tool_status;
        if (toolStatus?.type === 'server_tool_use') {
          startTool(toolStatus.name, toolStatus.status);
        }
        if (toolStatus?.type === 'mcp_tool_use') {
          if (toolStatus.status === 'running') {
            const phrase =
              typeof toolStatus.status_phrase === 'string' ? toolStatus.status_phrase : undefined;
            const parameters =
              toolStatus.args != null &&
              typeof toolStatus.args === 'object' &&
              !Array.isArray(toolStatus.args)
                ? (toolStatus.args as Record<string, unknown>)
                : undefined;
            startTool(toolStatus.name, undefined, phrase, parameters);
          } else if (toolStatus.status === 'completed' || toolStatus.status === 'failed') {
            finishTool(toolStatus.name, toolStatus.status);
          }
        }
        if (toolStatus?.status === 'searching' || toolStatus?.status === 'fetching') {
          setSearching(assistantMessageId, true);
        } else if (toolStatus?.status === 'executing') {
          setExecutingCode(assistantMessageId, true);
        }

        // Manual-approval request: surface an awaiting_approval card and record
        // the pending call so the caller can build the resume request.
        const approvalReq = parsed.choices?.[0]?.delta?.x_tool_approval_request;
        if (approvalReq && typeof approvalReq === 'object') {
          const tcId = (approvalReq as Record<string, unknown>)['tool_call_id'];
          const name = (approvalReq as Record<string, unknown>)['name'];
          const rawArgs = (approvalReq as Record<string, unknown>)['args'];
          if (typeof tcId === 'string' && tcId && typeof name === 'string' && name) {
            const args =
              rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)
                ? (rawArgs as Record<string, unknown>)
                : {};
            suspended = true;
            pendingCalls.push({ toolCallId: tcId, name, args });
            const id = createToolId(name);
            toolTimeline.push({
              id,
              name,
              status: 'awaiting_approval',
              requiresApproval: true,
              toolCallId: tcId,
              parameters: Object.keys(args).length > 0 ? args : undefined,
            });
            publishToolTimeline();
          }
        }

        // Code execution result.
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

        // Web search results.
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
          }
          finishTool('web_search', 'completed');
        } else if (
          searchResultsBlock?.content &&
          typeof searchResultsBlock.content === 'object' &&
          !Array.isArray(searchResultsBlock.content) &&
          (searchResultsBlock.content as Record<string, unknown>)['type'] ===
            'web_search_tool_result_error'
        ) {
          const errorCode =
            ((searchResultsBlock.content as Record<string, unknown>)['error_code'] as
              | string
              | undefined) || 'unknown_error';
          finishTool('web_search', 'failed', `Web search failed: ${errorCode}`);
        }

        // Platform-executed tool results (MCP / E2B sandbox).
        const toolResultBlock = parsed.choices?.[0]?.delta?.x_tool_result;
        if (toolResultBlock) {
          const { name, content, is_error } = toolResultBlock as {
            tool_call_id?: string;
            name?: string;
            content?: unknown;
            is_error?: boolean;
          };
          if (name) {
            // Include 'failed' so a denial result event (server emits one for a
            // rejected tool, isError:false) lands on the card the client already
            // flipped to 'failed' on reject, instead of creating a duplicate.
            let idx = findLastToolIndex(name, [
              'running',
              'completed',
              'awaiting_approval',
              'failed',
            ]);
            if (idx < 0) {
              const id = createToolId(name);
              toolStartTimes.set(id, Date.now());
              toolTimeline.push({ id, name, status: 'running' });
              idx = toolTimeline.length - 1;
            }
            const entry = toolTimeline[idx];
            if (entry) {
              const resultText =
                typeof content === 'string'
                  ? content
                  : Array.isArray(content)
                    ? (content as Record<string, unknown>[])
                        .filter((c) => c['type'] === 'text')
                        .map((c) => c['text'] as string)
                        .join('\n')
                    : content != null
                      ? String(content)
                      : '';
              entry.result = resultText;
              entry.status = is_error ? 'failed' : 'completed';
              entry.error = is_error ? resultText : entry.error;
            }
            publishToolTimeline();
          }
        }

        if (parsed.choices?.[0]?.finish_reason || parsed.type === 'message_stop') {
          updateMessage(assistantMessageId, { isStreaming: false });
        }
      } catch {
        // Ignore parse errors for incomplete chunks.
      }
    }
  }

  // Stream ended without an explicit [DONE].
  flushContentBuffer(true);
  finishRunningTools();
  persistAssistant(fullAssistantContent);
  stopStreaming();
  setLoading(false);
  return { suspended, pendingCalls };
}

/**
 * Hook for handling SSE streaming chat with the LLM API
 */
export function useChatStream(): UseChatStreamReturn {
  const { getToken } = useAuth();
  const abortControllerRef = useRef<AbortController | null>(null);

  const addMessage = useChatStore((state) => state.addMessage);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const startStreaming = useChatStore((state) => state.startStreaming);
  const stopStreaming = useChatStore((state) => state.stopStreaming);
  const setLoading = useChatStore((state) => state.setLoading);
  const setError = useChatStore((state) => state.setError);
  const selectedModel = useChatStore((state) => state.selectedModel);
  const isStreaming = useChatStore((state) => state.isStreaming);

  // On unmount, do NOT abort the in-flight stream and do NOT null the ref.
  // The chatStore is a global singleton, so streamed tokens continue updating
  // the message list even after the originating component unmounts (e.g.
  // navigation from /chat to /chat/[id] on the first message).
  useEffect(() => {
    return () => {
      // intentionally empty: preserve controller across unmount
    };
  }, []);

  const sendMessage = useCallback(
    async (content: string, options: SendMessageOptions = {}) => {
      if (!content.trim()) return;

      const conversationId = options.conversationId || useChatStore.getState().activeConversationId;
      if (!conversationId) {
        console.error('[useChatStream] No conversation ID available');
        setError('No active conversation. Please create a new conversation first.');
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const model = options.model || selectedModel;
      const sendReplay = createSendReplayMetadata({
        webSearchEnabled: options.webSearch,
        thinkingEnabled: options.thinkingEnabled,
        codeExecutionEnabled: options.codeExecution,
        styleMode: options.styleMode,
        hasSkillInstruction: Boolean(options.skillBody),
      });
      // Provider (not a captured string): every save fetches a fresh token at
      // call time so a long stream cannot outlive it. See AuthTokenProvider.
      const getAuthToken: AuthTokenProvider = async () => {
        const token = await getToken();
        if (!token) throw new Error('Not authenticated');
        return token;
      };
      const authToken = await getAuthToken();

      const userMessageId = crypto.randomUUID();
      const userMessage: Message = {
        id: userMessageId,
        role: 'user',
        content: content.trim(),
        createdAt: new Date().toISOString(),
        attachments: options.attachments,
        metadata: sendReplay ? { sendReplay } : undefined,
      };
      addMessage(userMessage);

      const isTemporaryConversation = Boolean(
        useChatStore
          .getState()
          .conversations.find((conversation) => conversation.id === conversationId)?.isTemporary,
      );
      if (!isTemporaryConversation) {
        saveMessageToDb(
          conversationId,
          {
            id: userMessageId,
            role: 'user',
            content: content.trim(),
            metadata: sendReplay ? { sendReplay } : undefined,
          },
          getAuthToken,
        )
          .then((saved) => {
            if (saved?.id && saved.id !== userMessageId) {
              updateMessage(userMessageId, { id: saved.id });
            }
          })
          .catch((err) => notifyPersistenceFailure('user', err));
      }

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
        const currentMessages = useChatStore.getState().messages;

        const apiMessages: ApiMessage[] = [
          ...currentMessages
            .filter((m) => m.id !== assistantMessageId)
            .map((m) => ({
              role: m.role,
              content: m.content as MessageContent,
            })),
        ];

        if (options.skillBody) {
          apiMessages.unshift({ role: 'system', content: options.skillBody });
        }

        if (options.styleMode && options.styleMode !== 'normal') {
          const styleInstruction = STYLE_SYSTEM_INSTRUCTIONS[options.styleMode];
          if (styleInstruction) {
            apiMessages.unshift({ role: 'system', content: styleInstruction });
          }
        }

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
            conversation_id: conversationId,
            stream: true,
            temperature: options.temperature,
            max_tokens: options.maxTokens,
            web_search: options.webSearch || options.research || undefined,
            web_fetch: options.webFetch || undefined,
            research: options.research || undefined,
            code_execution: options.codeExecution || undefined,
            thinking_mode: thinkingEnabled || undefined,
            effort: thinkingEnabled ? thinkingEffort : undefined,
            use_prompt_cache: true,
          }),
          signal: abortControllerRef.current?.signal,
        });

        useFreeTrialStore.getState().applyHeaders(response.headers);

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

        // Skill load surfaces as a completed timeline step (seeded, so it renders
        // regardless of stream contents). Injected invisibly into the API call
        // above via the system message; here it becomes a visible timeline entry.
        const skillSeed: MessageToolEntry[] | undefined = options.skillBody
          ? [
              {
                id: `${assistantMessageId}-skill`,
                name: options.skillName ? `Read skill: ${options.skillName}` : 'Read skill',
                status: 'completed',
              },
            ]
          : undefined;

        const outcome = await consumeAssistantStream({
          response,
          assistantMessageId,
          model,
          conversationId,
          isTemporaryConversation,
          getAuthToken,
          seedTools: skillSeed,
        });

        // Register the suspended turn so its approval cards can drive a resume.
        if (outcome.suspended && outcome.pendingCalls.length > 0) {
          pendingTurns.set(assistantMessageId, {
            priorMessages: apiMessages,
            model,
            conversationId,
            isTemporaryConversation,
            calls: outcome.pendingCalls,
            decisions: new Map(),
            resolving: false,
          });
        }
      } catch (error) {
        handleStreamError(error, {
          assistantMessageId,
          model,
          conversationId,
          isTemporaryConversation,
          getAuthToken,
          setError,
          stopStreaming,
          setLoading,
          updateMessage,
        });
      }
    },
    [
      selectedModel,
      addMessage,
      updateMessage,
      startStreaming,
      stopStreaming,
      setLoading,
      setError,
      getToken,
    ],
  );

  const resolveToolApproval = useResolveToolApproval();

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
    resolveToolApproval,
    isStreaming,
  };
}

/**
 * Lightweight hook exposing ONLY `resolveToolApproval`. It subscribes to no
 * reactive store slice (reads stable actions via getState()), so a component
 * that renders once per message (e.g. MessageBubble) can wire approve/reject
 * without incurring a re-render on every streaming toggle. useChatStream reuses
 * it so there is a single implementation of the resume flow.
 */
export function useResolveToolApproval(): UseChatStreamReturn['resolveToolApproval'] {
  const { getToken } = useAuth();
  const abortRef = useRef<AbortController | null>(null);

  return useCallback(
    async (
      assistantMessageId: string,
      toolCallId: string,
      decision: ToolApprovalDecision,
    ): Promise<void> => {
      const store = useChatStore.getState();
      const {
        startStreaming,
        stopStreaming,
        setLoading,
        setError,
        updateMessage,
        updateToolEntry,
      } = store;

      const turn = pendingTurns.get(assistantMessageId);
      if (!turn || turn.resolving) return;
      if (!turn.calls.some((c) => c.toolCallId === toolCallId)) return;

      turn.decisions.set(toolCallId, decision);

      // Reflect the decision on the card immediately: approved → running (the
      // continuation's status/result events land on it), rejected → failed.
      if (decision === 'approved') {
        updateToolEntry(assistantMessageId, toolCallId, {
          status: 'running',
          requiresApproval: false,
        });
      } else {
        updateToolEntry(assistantMessageId, toolCallId, {
          status: 'failed',
          requiresApproval: false,
          error: 'You denied this tool.',
          result: 'The user denied permission to run this tool.',
        });
      }

      // Wait until EVERY pending call in the turn is decided before resuming.
      if (turn.decisions.size < turn.calls.length) return;
      turn.resolving = true;

      // Provider so the terminal persist after a long resume continuation uses a
      // fresh token (see AuthTokenProvider), not one captured here.
      const getAuthToken: AuthTokenProvider = async () => {
        const token = await getToken();
        if (!token) throw new Error('Not authenticated');
        return token;
      };
      let authToken: string;
      try {
        authToken = await getAuthToken();
      } catch {
        turn.resolving = false;
        setError('Not authenticated');
        return;
      }

      if (abortRef.current) {
        abortRef.current.abort();
      }
      abortRef.current = new AbortController();

      // Reconstruct the suspended assistant tool_call turn (standard OpenAI
      // continue-after-tool shape) and the per-tool approval decisions.
      const assistantContent =
        useChatStore.getState().messages.find((m) => m.id === assistantMessageId)?.content ?? '';
      const assistantToolCallMessage: ApiMessage = {
        role: 'assistant',
        content: assistantContent,
        tool_calls: turn.calls.map((c) => ({
          id: c.toolCallId,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.args) },
        })),
      };
      const toolApprovals = turn.calls.map((c) => ({
        tool_call_id: c.toolCallId,
        decision: turn.decisions.get(c.toolCallId) ?? 'rejected',
      }));

      const seedTools = useChatStore.getState().messages.find((m) => m.id === assistantMessageId)
        ?.metadata?.tools;

      startStreaming(assistantMessageId);
      setLoading(true);
      setError(null);

      try {
        const headers = await addCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        });
        const response = await fetch('/api/llm/v1/chat/completions/approve', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: turn.model,
            messages: [...turn.priorMessages, assistantToolCallMessage],
            conversation_id: turn.conversationId,
            stream: true,
            tool_approvals: toolApprovals,
            use_prompt_cache: true,
          }),
          signal: abortRef.current?.signal,
        });

        useFreeTrialStore.getState().applyHeaders(response.headers);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const { message, code } = readChatApiErrorPayload(
            errorData,
            `Resume failed: ${response.status}`,
          );
          throw new ChatApiError(message, { code, status: response.status });
        }

        const outcome = await consumeAssistantStream({
          response,
          assistantMessageId,
          model: turn.model,
          conversationId: turn.conversationId,
          isTemporaryConversation: turn.isTemporaryConversation,
          getAuthToken,
          seedContent: assistantContent,
          seedTools: seedTools ? seedTools.map((t) => ({ ...t })) : undefined,
        });

        if (outcome.suspended && outcome.pendingCalls.length > 0) {
          // The continuation suspended again (a further tool needs approval):
          // register a fresh turn carrying the now-longer thread (assistant
          // tool_call turn + this batch's tool results).
          pendingTurns.set(assistantMessageId, {
            priorMessages: [
              ...turn.priorMessages,
              assistantToolCallMessage,
              ...turn.calls.map(
                (c): ApiMessage => ({
                  role: 'tool',
                  content:
                    turn.decisions.get(c.toolCallId) === 'approved'
                      ? '(executed)'
                      : 'The user denied permission to run this tool.',
                  tool_call_id: c.toolCallId,
                }),
              ),
            ],
            model: turn.model,
            conversationId: turn.conversationId,
            isTemporaryConversation: turn.isTemporaryConversation,
            calls: outcome.pendingCalls,
            decisions: new Map(),
            resolving: false,
          });
        } else {
          pendingTurns.delete(assistantMessageId);
        }
      } catch (error) {
        pendingTurns.delete(assistantMessageId);
        handleStreamError(error, {
          assistantMessageId,
          model: turn.model,
          conversationId: turn.conversationId,
          isTemporaryConversation: turn.isTemporaryConversation,
          getAuthToken,
          setError,
          stopStreaming,
          setLoading,
          updateMessage,
        });
      }
    },
    [getToken],
  );
}

// ─── Error handling shared by sendMessage + resolveToolApproval ─────────────

interface StreamErrorContext {
  assistantMessageId: string;
  model: string;
  conversationId: string;
  isTemporaryConversation: boolean;
  getAuthToken: AuthTokenProvider;
  setError: (message: string | null) => void;
  stopStreaming: () => void;
  setLoading: (loading: boolean) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
}

function handleStreamError(error: unknown, ctx: StreamErrorContext): void {
  const {
    assistantMessageId,
    model,
    conversationId,
    isTemporaryConversation,
    getAuthToken,
    setError,
    stopStreaming,
    setLoading,
    updateMessage,
  } = ctx;

  if (error instanceof Error && error.name === 'AbortError') {
    updateMessage(assistantMessageId, { isStreaming: false });
    stopStreaming();
    setLoading(false);
    return;
  }

  const errorMessage = getVisibleErrorMessage(error);

  // Mark any in-flight tool cards as failed (a mid-stream error leaves them
  // running otherwise). awaiting_approval cards are left as-is.
  const failing = useChatStore.getState().messages.find((m) => m.id === assistantMessageId)
    ?.metadata?.tools;
  if (failing && failing.some((t) => t.status === 'pending' || t.status === 'running')) {
    useChatStore.getState().setToolTimeline(
      assistantMessageId,
      failing.map((t) =>
        t.status === 'pending' || t.status === 'running'
          ? { ...t, status: 'failed' as const, error: errorMessage }
          : { ...t },
      ),
    );
  }

  const errorCode = error instanceof ChatApiError ? error.code : undefined;
  if (isFreeTrialErrorCode(errorCode)) {
    if (errorCode === 'website_trial_prompt_limit_reached') {
      useFreeTrialStore.getState().markExhausted();
    }
    updateMessage(assistantMessageId, {
      isStreaming: false,
      content: '',
      error: false,
      metadata: {
        paywall: buildFreeTrialPaywallSlot(errorCode, errorMessage),
      },
    });
    setError(errorMessage);
    stopStreaming();
    setLoading(false);
    return;
  }

  const errorContent = buildAssistantErrorContent(errorMessage);
  updateMessage(assistantMessageId, {
    isStreaming: false,
    content: errorContent,
    error: true,
  });
  setError(errorMessage);

  if (!isTemporaryConversation) {
    saveMessageToDb(
      conversationId,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: errorContent,
        model,
      },
      getAuthToken,
    )
      .then((saved) => {
        if (saved?.id && saved.id !== assistantMessageId) {
          updateMessage(assistantMessageId, { id: saved.id });
        }
      })
      .catch((err) => notifyPersistenceFailure('assistant', err));
  }

  stopStreaming();
  setLoading(false);
}

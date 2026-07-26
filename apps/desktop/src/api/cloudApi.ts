/**
 * Cloud API Client
 *
 * HTTP client for the AGI Workforce API gateway (cloud-mode conversations).
 * Handles conversation CRUD and LLM message sending via SSE streaming.
 */

import { guardedFetch } from '../lib/egressGuard';
import { isTauri } from '../lib/runtimeEnvironment';
import { cloudAccountAuth } from '../services/cloudAccountAuth';
import { WEB_APP_URL } from './config';
import type { CloudWorkMode } from '@agiworkforce/types';
import {
  parseManagedUsageSummaryResponse,
  type ManagedUsageSummaryResponse,
} from '@agiworkforce/types';
import {
  createManagedCloudChatClient,
  createManagedCloudAgentRunClient,
  ManagedMediaImageGenerationRequestSchema,
  parseAgentEventDelta,
  readManagedCloudAgentRunHandle,
  type ManagedMediaImageProvider,
  type ManagedCloudAgentRunClient,
  type ManagedCloudAgentRunHandle,
  type ManagedCloudConversation,
  type ManagedCloudMessage,
} from '@agiworkforce/cloud-contracts';

// Desktop uses the full API URL; web uses relative paths (same-origin) to avoid CORS.
// Exported so runtimes can resolve relative wire uris (e.g. the
// `x_generated_files` `/api/files/{id}` paths) against the same base.
export const CLOUD_API_BASE_URL = isTauri ? WEB_APP_URL : '';

// ============================================================================
// Type Definitions
// ============================================================================

export interface CloudMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  provider?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface CloudConversation {
  id: string;
  user_id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
  project_id?: string | null;
  pinned?: boolean;
  starred?: boolean;
  archived?: boolean;
  is_temporary?: boolean;
  messages?: CloudMessage[];
}

export type CloudUsage = ManagedUsageSummaryResponse;

export interface SendMessageRequest {
  conversation_id?: string;
  message: string;
  model: string;
}

export type CloudChatMessageContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'file'; file: { asset_id: string } }
      | { type: 'image_url'; image_url: { url: string } }
    >;

// ============================================================================
// Auth Helper
// ============================================================================

/**
 * Retrieves auth headers for API requests.
 *
 * Desktop (Tauri): Uses cloudAccountAuth.getSession() for Bearer token.
 * Web (cloud): Session is in httpOnly cookies — browser sends them
 * automatically. We fetch a CSRF token for state-changing requests.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'X-AGI-Surface': 'desktop',
  };

  // Desktop mode: add Bearer token from Tauri auth service
  const session = await cloudAccountAuth.getValidSession();
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  if (isTauri && !session?.access_token) {
    throw new Error('AGI Cloud requires a connected Desktop session.');
  }

  // Web mode: Clerk session cookies are httpOnly and sent automatically.
  // Fetch a CSRF token for state-changing requests.
  if (!session?.access_token && typeof document !== 'undefined') {
    try {
      const csrfResp = await guardedFetch(`${CLOUD_API_BASE_URL}/api/csrf`, {
        credentials: 'include',
      });
      if (csrfResp.ok) {
        const csrfData = await csrfResp.json();
        const csrfToken = csrfData.token ?? csrfData.csrfToken;
        if (csrfToken) {
          headers['X-CSRF-Token'] = csrfToken;
        }
      }
    } catch {
      // CSRF fetch failed — continue without it
    }
  }

  return headers;
}

/**
 * Executes an authenticated AGI Cloud request and invalidates the Desktop
 * session when the server rejects its bearer token. A 403 is intentionally
 * left to the caller because it can represent a valid user lacking permission
 * for a specific tenant object.
 */
export async function cloudFetch(
  input: Parameters<typeof guardedFetch>[0],
  init?: Parameters<typeof guardedFetch>[1],
): Promise<Response> {
  const response = await guardedFetch(input, init);
  if (isTauri && response.status === 401) {
    await cloudAccountAuth.invalidateSession();
  }
  return response;
}

function projectManagedConversation(conversation: ManagedCloudConversation): CloudConversation {
  return {
    id: conversation.id,
    user_id: '',
    title: conversation.title,
    model: conversation.model ?? 'auto',
    created_at: conversation.createdAt,
    updated_at: conversation.updatedAt,
    ...(conversation.projectId !== undefined ? { project_id: conversation.projectId } : {}),
    ...(conversation.pinned !== undefined ? { pinned: conversation.pinned } : {}),
    ...(conversation.starred !== undefined ? { starred: conversation.starred } : {}),
    ...(conversation.archived !== undefined ? { archived: conversation.archived } : {}),
    ...(conversation.isTemporary !== undefined ? { is_temporary: conversation.isTemporary } : {}),
  };
}

function projectManagedMessage(message: ManagedCloudMessage): CloudMessage {
  return {
    id: message.id,
    conversation_id: message.conversationId,
    role: message.role,
    content: message.content,
    ...(message.model ? { model: message.model } : {}),
    ...(message.provider ? { provider: message.provider } : {}),
    ...(message.metadata ? { metadata: message.metadata } : {}),
    created_at: message.createdAt,
  };
}

export function createCloudChatPersistenceClient() {
  return createManagedCloudChatClient({
    baseUrl: CLOUD_API_BASE_URL,
    getAuthToken: async () => (await cloudAccountAuth.getValidSession())?.access_token ?? null,
    decorateMutationHeaders: async (headers) => ({
      ...(await getAuthHeaders()),
      ...headers,
    }),
    fetchImpl: (input, init) =>
      cloudFetch(input, {
        ...init,
        credentials: 'include',
      }),
  });
}

/**
 * Authenticated, trust-boundary-aware client for the durable managed-run
 * journal. All Desktop Cloud follow/cancel traffic uses the same guarded
 * egress path and Clerk/CSRF headers as the completion request itself.
 */
export function createDesktopCloudAgentRunClient(): ManagedCloudAgentRunClient {
  return createManagedCloudAgentRunClient({
    baseUrl: CLOUD_API_BASE_URL,
    getAuthToken: async () => (await cloudAccountAuth.getValidSession())?.access_token ?? null,
    decorateMutationHeaders: async (headers) => ({
      ...(await getAuthHeaders()),
      ...headers,
    }),
    fetchImpl: (input, init) =>
      cloudFetch(input, {
        ...init,
        credentials: 'include',
      }),
  });
}

// ============================================================================
// Conversation CRUD
// ============================================================================

/**
 * Lists all cloud conversations for the current user.
 */
export async function listCloudConversations(): Promise<CloudConversation[]> {
  const client = createCloudChatPersistenceClient();
  const conversations: CloudConversation[] = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const page = await client.listConversations({ limit: 100, offset });
    conversations.push(...page.conversations.map(projectManagedConversation));
    hasMore = page.hasMore;
    offset = page.nextOffset;
  }
  return conversations;
}

/**
 * Creates a new cloud conversation.
 */
export async function createCloudConversation(
  title: string,
  model: string,
): Promise<CloudConversation> {
  return projectManagedConversation(
    await createCloudChatPersistenceClient().createConversation({ title, model }),
  );
}

/**
 * Fetches a single cloud conversation by ID, including its messages.
 */
export async function getCloudConversation(id: string): Promise<CloudConversation> {
  const client = createCloudChatPersistenceClient();
  const messages: CloudMessage[] = [];
  let offset = 0;
  let conversation: ManagedCloudConversation | undefined;
  let hasMore = true;
  while (hasMore) {
    const page = await client.getConversation(id, { limit: 100, offset });
    conversation = page.conversation;
    messages.push(...page.messages.map(projectManagedMessage));
    hasMore = page.hasMore;
    offset += page.messages.length;
    if (hasMore && page.messages.length === 0) {
      throw new Error(`Cloud conversation ${id} returned an invalid empty page`);
    }
  }
  if (!conversation) throw new Error(`Cloud conversation ${id} was not found`);
  return {
    ...projectManagedConversation(conversation),
    messages,
  };
}

/**
 * Deletes a cloud conversation by ID.
 */
export async function deleteCloudConversation(id: string): Promise<void> {
  await createCloudChatPersistenceClient().deleteConversation(id);
}

export async function updateCloudConversationTitle(
  id: string,
  title: string,
): Promise<CloudConversation> {
  return projectManagedConversation(
    await createCloudChatPersistenceClient().updateConversation(id, { title }),
  );
}

// ============================================================================
// Usage
// ============================================================================

/**
 * Fetches the current user's cloud API usage summary.
 */
export async function getCloudUsage(): Promise<CloudUsage> {
  const headers = await getAuthHeaders();

  const res = await cloudFetch(`${CLOUD_API_BASE_URL}/api/usage`, {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch cloud usage: HTTP ${res.status}`);
  }

  return parseManagedUsageSummaryResponse(await res.json());
}

// ============================================================================
// Models (Cloud Mode Model Picker)
// ============================================================================

/** Minimal validated projection consumed by the Desktop discovery adapter. */
export interface CloudModelInfo {
  id: string;
  name: string;
  provider: string;
}

/**
 * Public response envelope from GET /api/models. Rich catalog fields remain
 * owned by @agiworkforce/types; this client validates only discovery identity.
 */
export interface CloudModelsResponse {
  models: CloudModelInfo[];
  version?: string;
  lastUpdated?: string;
}

export interface CloudGeneratedImage {
  /** Media-library asset id parsed from the authenticated file URL. */
  id: string;
  /** Authenticated, same-cloud-origin `/api/files/{id}` URL. */
  uri: string;
  provider: ManagedMediaImageProvider;
  model: string;
}

/**
 * Fetches the canonical public model catalog for the embedded Cloud shell.
 * Catalog membership is not an entitlement claim; execution remains
 * server-authorized and the native Desktop picker uses privileged discovery.
 *
 * @returns Valid model identity records from the canonical catalog
 * @throws {Error} If the API call fails
 */
export async function getCloudModels(): Promise<CloudModelInfo[]> {
  const relativePath = '/api/models';
  const url = new URL(
    `${CLOUD_API_BASE_URL}${relativePath}`,
    CLOUD_API_BASE_URL || globalThis.location?.origin || 'http://localhost',
  );

  try {
    const requestUrl = CLOUD_API_BASE_URL ? url.toString() : `${url.pathname}${url.search}`;
    const res = await guardedFetch(requestUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch cloud models: HTTP ${res.status}`);
    }

    const payload: unknown = await res.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('model catalog returned an invalid response');
    }
    const rawModels = (payload as Record<string, unknown>)['models'];
    if (!Array.isArray(rawModels)) {
      throw new Error('model catalog did not include a model list');
    }
    return rawModels.flatMap((candidate): CloudModelInfo[] => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
      const record = candidate as Record<string, unknown>;
      const id = typeof record['id'] === 'string' ? record['id'].trim() : '';
      const name = typeof record['name'] === 'string' ? record['name'].trim() : '';
      const provider = typeof record['provider'] === 'string' ? record['provider'].trim() : '';
      return id && name && provider ? [{ id, name, provider }] : [];
    });
  } catch (err) {
    throw new Error(
      `Failed to fetch cloud models: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Generates one durable image through the same managed-media endpoint used by
 * Web. Desktop deliberately rejects inline base64 fallbacks: they cannot
 * survive a reload and must never be persisted into chat metadata.
 */
export async function generateCloudImage(input: {
  prompt: string;
  provider: ManagedMediaImageProvider;
  model: string;
  idempotencyKey: string;
  signal?: AbortSignal;
}): Promise<CloudGeneratedImage> {
  const request = ManagedMediaImageGenerationRequestSchema.parse({
    prompt: input.prompt,
    provider: input.provider,
    model: input.model,
    size: '1024x1024',
    n: 1,
    quality: 'standard',
  });
  const headers = await getAuthHeaders();
  headers['Idempotency-Key'] = input.idempotencyKey;

  const response = await cloudFetch(`${CLOUD_API_BASE_URL}/api/media/image/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
    signal: input.signal,
    credentials: 'include',
  });
  if (!response.ok) throw await readCloudResponseError(response);

  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('AGI Cloud returned an invalid image-generation response.');
  }
  const record = payload as Record<string, unknown>;
  if (record['success'] !== true) {
    const message =
      typeof record['error'] === 'string'
        ? record['error']
        : 'AGI Cloud could not generate the image.';
    throw new Error(message);
  }
  if (record['persisted'] !== true) {
    throw new Error(
      'The image provider returned an inline result, but durable Cloud media storage is not configured.',
    );
  }

  const images = Array.isArray(record['images']) ? record['images'] : [];
  const first = images[0];
  const rawUri =
    first && typeof first === 'object' && !Array.isArray(first)
      ? (first as Record<string, unknown>)['url']
      : undefined;
  if (typeof rawUri !== 'string' || !rawUri.trim()) {
    throw new Error('AGI Cloud generated an image but returned no durable file URL.');
  }

  const fallbackOrigin = globalThis.location?.origin || 'http://localhost';
  const cloudOrigin = new URL(CLOUD_API_BASE_URL || fallbackOrigin);
  const resolved = new URL(rawUri, cloudOrigin);
  const fileMatch = /^\/api\/files\/([^/]+)$/.exec(resolved.pathname);
  if (resolved.origin !== cloudOrigin.origin || !fileMatch?.[1]) {
    throw new Error('AGI Cloud returned an invalid image file URL.');
  }

  const provider = record['provider'];
  const model = record['model'];
  if (
    (provider !== 'google' && provider !== 'openai' && provider !== 'stability') ||
    typeof model !== 'string' ||
    !model.trim()
  ) {
    throw new Error('AGI Cloud returned incomplete image provenance.');
  }

  return {
    id: decodeURIComponent(fileMatch[1]),
    uri: CLOUD_API_BASE_URL
      ? resolved.toString()
      : `${resolved.pathname}${resolved.search}${resolved.hash}`,
    provider,
    model,
  };
}

// ============================================================================
// SSE Streaming
// ============================================================================

/**
 * Sends a message to a cloud conversation and streams the assistant reply
 * via SSE. Calls the provided callbacks as the stream progresses.
 *
 * @param conversationId - Target conversation ID
 * @param content        - User message text
 * @param model          - Model identifier to use for this request
 * @param onChunk        - Called with each incremental text chunk
 * @param onDone         - Called when the stream ends successfully
 * @param onError        - Called if a network or parse error occurs
 * @param signal         - Optional AbortSignal for cancellation
 */
export async function sendCloudMessage(
  conversationId: string,
  content: string,
  model: string,
  onChunk: (text: string) => void,
  onDone: () => void | Promise<void>,
  onError: (err: Error) => void,
  signal?: AbortSignal,
  onEvent?: (payload: Record<string, unknown>) => void,
  webSearch?: boolean,
  messageHistory?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: CloudChatMessageContent;
  }>,
  thinkingEnabled?: boolean,
  codeExecution?: boolean,
  idempotencyKey?: string,
  requestOptions?: {
    research?: boolean;
    workMode?: CloudWorkMode;
    skillName?: string;
    effort?: string;
  },
  onRunHandle?: (handle: ManagedCloudAgentRunHandle | null) => void,
): Promise<void> {
  let headers: Record<string, string>;

  try {
    headers = await getAuthHeaders();
    if (!idempotencyKey) {
      throw new Error('Managed Cloud chat requires a stable idempotency key');
    }
    headers['Idempotency-Key'] = idempotencyKey;
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  // Build message history — use provided history or fall back to single message
  const chatMessages =
    messageHistory && messageHistory.length > 0
      ? messageHistory
      : [{ role: 'user' as const, content }];

  // Use the OpenAI-compatible endpoint deployed on Vercel
  const openAiBody: Record<string, unknown> = {
    model,
    messages: chatMessages,
    conversation_id: conversationId,
    stream: true,
    ...(webSearch || requestOptions?.research ? { web_search: true, web_fetch: true } : {}),
    ...(typeof thinkingEnabled === 'boolean' ? { thinking_mode: thinkingEnabled } : {}),
    ...(codeExecution ? { code_execution: true } : {}),
    ...(requestOptions?.research ? { research: true } : {}),
    ...(requestOptions?.workMode ? { work_mode: requestOptions.workMode } : {}),
    ...(requestOptions?.skillName ? { skill_name: requestOptions.skillName } : {}),
    ...(requestOptions?.effort ? { effort: requestOptions.effort } : {}),
    use_prompt_cache: true,
  };

  let res: Response;

  try {
    res = await cloudFetch(`${CLOUD_API_BASE_URL}/api/llm/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(openAiBody),
      signal,
      credentials: 'include',
    });
  } catch (err) {
    // Network error or abort
    onError(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  try {
    onRunHandle?.(readManagedCloudAgentRunHandle(res));
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  await consumeCloudSseResponse(res, onChunk, onDone, onError, onEvent);
}

// ============================================================================
// Tool-approval resume — POST /api/llm/v1/chat/completions/approve
// ============================================================================

/**
 * Resumes a turn the server suspended on `x_tool_approval_request`. Sends only
 * the tenant-owned run id plus the per-call decisions. The server restores the
 * exact private transcript, tool arguments, policy, and event cursor from its
 * approval checkpoint. On
 * success the response is the SAME `text/event-stream` shape as
 * `sendCloudMessage` — streamed through the identical callbacks so the
 * continuation appends onto the same assistant message.
 */
export async function sendCloudApprovalResume(
  runId: string,
  toolApprovals: Array<{ tool_call_id: string; decision: 'approved' | 'rejected' }>,
  onChunk: (text: string) => void,
  onDone: () => void | Promise<void>,
  onError: (err: Error) => void,
  signal?: AbortSignal,
  onEvent?: (payload: Record<string, unknown>) => void,
  idempotencyKey?: string,
): Promise<void> {
  let headers: Record<string, string>;

  try {
    headers = await getAuthHeaders();
    if (!idempotencyKey) {
      throw new Error('Managed Cloud tool resume requires a stable idempotency key');
    }
    headers['Idempotency-Key'] = idempotencyKey;
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  let res: Response;
  try {
    res = await cloudFetch(`${CLOUD_API_BASE_URL}/api/llm/v1/chat/completions/approve`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ run_id: runId, tool_approvals: toolApprovals }),
      signal,
      credentials: 'include',
    });
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  await consumeCloudSseResponse(res, onChunk, onDone, onError, onEvent);
}

/**
 * Shared SSE-response consumer for both `sendCloudMessage` and
 * `sendCloudApprovalResume` — same OpenAI-compatible `data: {...}` line
 * format, same [DONE] sentinel, same error-response handling.
 */
async function consumeCloudSseResponse(
  res: Response,
  onChunk: (text: string) => void,
  onDone: () => void | Promise<void>,
  onError: (err: Error) => void,
  onEvent?: (payload: Record<string, unknown>) => void,
): Promise<void> {
  if (!res.ok) {
    onError(await readCloudResponseError(res));
    return;
  }

  if (!res.body) {
    onError(new Error('Send message response has no body'));
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  const canonicalCursor: {
    sessionId?: string;
    turnId?: string;
    sequence: number;
  } = { sequence: -1 };

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Flush any remaining buffered line
        if (buffer.trim().length > 0) {
          const terminalError = parseAndDispatchLine(
            buffer.trim(),
            onChunk,
            onError,
            onEvent,
            canonicalCursor,
          );
          if (terminalError) return;
        }
        await onDone();
        return;
      }

      buffer += decoder.decode(value, { stream: true });

      // SSE lines are separated by '\n'. Process all complete lines.
      const lines = buffer.split('\n');

      // The last element may be an incomplete line — keep it in the buffer.
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed === '' || trimmed.startsWith(':')) {
          // Empty lines and SSE comments — skip.
          continue;
        }

        if (trimmed === 'data: [DONE]') {
          await onDone();
          return;
        }

        if (trimmed.startsWith('data: ')) {
          const terminalError = parseAndDispatchLine(
            trimmed,
            onChunk,
            onError,
            onEvent,
            canonicalCursor,
          );
          if (terminalError) return;
        }
      }
    }
  } catch (err) {
    // Propagate read errors (including abort)
    onError(err instanceof Error ? err : new Error(String(err)));
  } finally {
    reader.releaseLock();
  }
}

async function readCloudResponseError(response: Response): Promise<Error> {
  let serverMessage: string | null = null;
  try {
    const payload: unknown = await response.json();
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const record = payload as Record<string, unknown>;
      if (typeof record['message'] === 'string') {
        serverMessage = record['message'];
      } else if (typeof record['error'] === 'string') {
        serverMessage = record['error'];
      } else if (
        record['error'] &&
        typeof record['error'] === 'object' &&
        !Array.isArray(record['error']) &&
        typeof (record['error'] as Record<string, unknown>)['message'] === 'string'
      ) {
        serverMessage = (record['error'] as Record<string, unknown>)['message'] as string;
      }
    }
  } catch {
    // Never surface an untrusted HTML/error response body. The status remains
    // enough to diagnose the request without leaking response content.
  }

  const message =
    serverMessage?.trim() ||
    (response.status === 401 || response.status === 403
      ? 'Your AGI Cloud session is no longer authorized. Please connect again.'
      : response.status === 429
        ? 'AGI Cloud is receiving too many requests. Please wait and retry.'
        : `AGI Cloud request failed (HTTP ${response.status}).`);
  return new Error(message);
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Parses a single `data: {...}` SSE line and dispatches text content via
 * `onChunk`. A malformed or explicit error event terminates the stream so an
 * empty/failed provider response can never fall through to `onDone`.
 */
function parseAndDispatchLine(
  line: string,
  onChunk: (text: string) => void,
  onError: (err: Error) => void,
  onEvent?: (payload: Record<string, unknown>) => void,
  canonicalCursor: { sessionId?: string; turnId?: string; sequence: number } = { sequence: -1 },
): boolean {
  const jsonStr = line.startsWith('data: ') ? line.slice('data: '.length) : line;

  if (jsonStr === '[DONE]') {
    return false;
  }

  try {
    const parsed: unknown = JSON.parse(jsonStr);

    if (!parsed || typeof parsed !== 'object') {
      return false;
    }

    const obj = parsed as Record<string, unknown>;
    const choices = obj['choices'];
    const firstDelta =
      Array.isArray(choices) && choices[0] && typeof choices[0] === 'object'
        ? (choices[0] as Record<string, unknown>)['delta']
        : undefined;
    const envelope =
      firstDelta && typeof firstDelta === 'object'
        ? parseAgentEventDelta((firstDelta as Record<string, unknown>)['x_agent_event'])
        : null;
    if (
      envelope &&
      canonicalCursor.sessionId === envelope.sessionId &&
      canonicalCursor.turnId === envelope.turnId &&
      envelope.sequence <= canonicalCursor.sequence
    ) {
      return false;
    }
    if (envelope) {
      canonicalCursor.sessionId = envelope.sessionId;
      canonicalCursor.turnId = envelope.turnId;
      canonicalCursor.sequence = envelope.sequence;
    }
    onEvent?.(obj);

    const rawError = obj['error'];
    const streamErrorMessage =
      typeof rawError === 'string'
        ? rawError
        : rawError && typeof rawError === 'object' && !Array.isArray(rawError)
          ? (rawError as Record<string, unknown>)['message']
          : undefined;
    if (typeof streamErrorMessage === 'string' && streamErrorMessage.trim()) {
      onError(new Error(streamErrorMessage));
      return true;
    }

    // Support both { text: "..." } and OpenAI-style { choices: [{ delta: { content: "..." } }] }
    if (typeof obj['text'] === 'string') {
      onChunk(obj['text']);
      return false;
    }

    if (Array.isArray(choices) && choices.length > 0) {
      const delta = (choices[0] as Record<string, unknown>)['delta'];
      if (delta && typeof delta === 'object') {
        const deltaContent = (delta as Record<string, unknown>)['content'];
        if (typeof deltaContent === 'string') {
          onChunk(deltaContent);
        }
      }
    }
    return false;
  } catch {
    // Never log the raw line: it can contain model output or tool data. A
    // malformed data event is a failed stream, not a successful empty reply.
    onError(new Error('AGI Cloud returned a malformed stream event.'));
    return true;
  }
}

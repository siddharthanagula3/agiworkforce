/**
 * Cloud API Client
 *
 * HTTP client for the AGI Workforce API gateway (cloud-mode conversations).
 * Handles conversation CRUD and LLM message sending via SSE streaming.
 */

import { isTauri } from '../lib/tauri-mock';
import { supabaseAuth } from '../services/supabaseAuth';
import { API_BASE_URL } from './config';

// Desktop uses the full API URL; web uses relative paths (same-origin) to avoid CORS
const CLOUD_API_BASE_URL = isTauri ? API_BASE_URL : '';

// ============================================================================
// Type Definitions
// ============================================================================

export interface CloudMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  created_at: string;
}

export interface CloudConversation {
  id: string;
  user_id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
  messages?: CloudMessage[];
}

export interface CloudUsage {
  period_start: string;
  period_end: string;
  message_count: number;
  token_count: number;
  cost_usd: number;
}

export interface CreateConversationRequest {
  title: string;
  model: string;
}

export interface SendMessageRequest {
  conversation_id?: string;
  message: string;
  model: string;
}

interface ListConversationsResponse {
  conversations: CloudConversation[];
}

interface CreateConversationResponse {
  conversation: CloudConversation;
}

interface GetConversationResponse {
  conversation: CloudConversation;
  messages: CloudMessage[];
}

interface UpdateConversationResponse {
  conversation: CloudConversation;
}

// ============================================================================
// Auth Helper
// ============================================================================

/**
 * Retrieves auth headers for API requests.
 *
 * Desktop (Tauri): Uses supabaseAuth.getSession() for Bearer token.
 * Web (cloud): Session is in httpOnly cookies — browser sends them
 * automatically. We fetch a CSRF token for state-changing requests.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };

  // Desktop mode: add Bearer token from Tauri auth service
  const session = supabaseAuth.getSession();
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  // Web mode: extract token from Supabase base64 cookie + fetch CSRF
  if (!session?.access_token && typeof document !== 'undefined') {
    // Supabase stores session in a base64-encoded cookie
    const sbCookie = document.cookie
      .split(';')
      .find((c) => c.trim().startsWith('sb-') && c.includes('auth-token'));
    if (sbCookie) {
      try {
        const val = sbCookie.split('=').slice(1).join('=');
        const b64 = val.replace('base64-', '');
        const decoded = JSON.parse(atob(b64));
        if (decoded?.access_token) {
          headers['Authorization'] = `Bearer ${decoded.access_token}`;
        }
      } catch {
        // Cookie decode failed — continue without auth
      }
    }

    // Fetch CSRF token for state-changing requests
    try {
      const csrfResp = await fetch(`${CLOUD_API_BASE_URL}/api/csrf`, {
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

// ============================================================================
// Conversation CRUD
// ============================================================================

/**
 * Lists all cloud conversations for the current user.
 */
export async function listCloudConversations(): Promise<CloudConversation[]> {
  const headers = await getAuthHeaders();

  const res = await fetch(`${CLOUD_API_BASE_URL}/api/cloud-chat`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    throw new Error(`Failed to list conversations: HTTP ${res.status}`);
  }

  const data = (await res.json()) as ListConversationsResponse;
  return data.conversations ?? [];
}

/**
 * Creates a new cloud conversation.
 */
export async function createCloudConversation(
  title: string,
  model: string,
): Promise<CloudConversation> {
  const headers = await getAuthHeaders();

  const body: CreateConversationRequest = { title, model };

  const res = await fetch(`${CLOUD_API_BASE_URL}/api/cloud-chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Failed to create conversation: HTTP ${res.status}`);
  }

  const data = (await res.json()) as CreateConversationResponse;
  return data.conversation;
}

/**
 * Fetches a single cloud conversation by ID, including its messages.
 */
export async function getCloudConversation(id: string): Promise<CloudConversation> {
  const headers = await getAuthHeaders();

  const res = await fetch(`${CLOUD_API_BASE_URL}/api/cloud-chat/${id}`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    throw new Error(`Failed to get conversation ${id}: HTTP ${res.status}`);
  }

  const data = (await res.json()) as GetConversationResponse;
  return {
    ...data.conversation,
    messages: data.messages ?? [],
  };
}

/**
 * Deletes a cloud conversation by ID.
 */
export async function deleteCloudConversation(id: string): Promise<void> {
  const headers = await getAuthHeaders();

  const res = await fetch(`${CLOUD_API_BASE_URL}/api/cloud-chat/${id}`, {
    method: 'DELETE',
    headers,
  });

  if (!res.ok) {
    throw new Error(`Failed to delete conversation ${id}: HTTP ${res.status}`);
  }
}

export async function updateCloudConversationTitle(
  id: string,
  title: string,
): Promise<CloudConversation> {
  const headers = await getAuthHeaders();

  const res = await fetch(`${CLOUD_API_BASE_URL}/api/cloud-chat/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ title }),
  });

  if (!res.ok) {
    throw new Error(`Failed to update conversation ${id}: HTTP ${res.status}`);
  }

  const data = (await res.json()) as UpdateConversationResponse;
  return data.conversation;
}

// ============================================================================
// Usage
// ============================================================================

/**
 * Fetches the current user's cloud API usage summary.
 */
export async function getCloudUsage(): Promise<CloudUsage> {
  const headers = await getAuthHeaders();

  const res = await fetch(`${CLOUD_API_BASE_URL}/api/v1/usage`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch cloud usage: HTTP ${res.status}`);
  }

  return res.json() as Promise<CloudUsage>;
}

// ============================================================================
// Models (Cloud Mode Model Picker)
// ============================================================================

/**
 * Cloud model metadata for Cloud Mode model picker.
 * This is a subset of the full ModelMetadata with only essential fields.
 */
export interface CloudModelInfo {
  id: string;
  name: string;
  provider: string;
  speed: 'very-fast' | 'fast' | 'medium' | 'slow';
  quality: 'excellent' | 'good' | 'fair';
  qualityTier: 'fast' | 'balanced' | 'best';
  contextWindow: number;
  inputCost: number;
  outputCost: number;
}

/**
 * Response format from GET /api/models endpoint.
 */
export interface CloudModelsResponse {
  models: CloudModelInfo[];
  total: number;
  providers: string[];
}

/**
 * Fetches available models for Cloud Mode, optionally filtered by subscription plan tier.
 *
 * @param planTier - Optional subscription tier filter ('pro' or 'max'). If not provided,
 *                   returns the full catalog (only available to internal/admin endpoints).
 * @returns Array of available models for the specified plan tier
 * @throws {Error} If the API call fails
 *
 * @example
 * // Get models available to Pro tier users
 * const models = await getCloudModels('pro');
 *
 * @example
 * // Get models available to Max tier users
 * const models = await getCloudModels('max');
 */
export async function getCloudModels(planTier?: 'pro' | 'max'): Promise<CloudModelInfo[]> {
  const url = new URL(`${CLOUD_API_BASE_URL}/api/models`);

  if (planTier) {
    url.searchParams.set('planTier', planTier);
  }

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch cloud models: HTTP ${res.status}`);
    }

    const data = (await res.json()) as CloudModelsResponse;
    return data.models;
  } catch (err) {
    throw new Error(
      `Failed to fetch cloud models: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
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
  _conversationId: string,
  content: string,
  model: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: Error) => void,
  signal?: AbortSignal,
  onEvent?: (payload: Record<string, unknown>) => void,
  webSearch?: boolean,
  messageHistory?: Array<{ role: string; content: string }>,
  thinkingEnabled?: boolean,
): Promise<void> {
  let headers: Record<string, string>;

  try {
    headers = await getAuthHeaders();
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
    stream: true,
    ...(webSearch ? { web_search: true } : {}),
    ...(thinkingEnabled ? { thinking_mode: true } : {}),
  };

  let res: Response;

  try {
    res = await fetch(`${CLOUD_API_BASE_URL}/api/llm/v1/chat/completions`, {
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

  if (!res.ok) {
    onError(new Error(`Send message failed: HTTP ${res.status}`));
    return;
  }

  if (!res.body) {
    onError(new Error('Send message response has no body'));
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Flush any remaining buffered line
        if (buffer.trim().length > 0) {
          parseAndDispatchLine(buffer.trim(), onChunk, onError, onEvent);
        }
        onDone();
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
          onDone();
          return;
        }

        if (trimmed.startsWith('data: ')) {
          parseAndDispatchLine(trimmed, onChunk, onError, onEvent);
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

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Parses a single `data: {...}` SSE line and dispatches text content via
 * `onChunk`. Gracefully ignores lines that cannot be parsed as JSON or that
 * carry no text field.
 */
function parseAndDispatchLine(
  line: string,
  onChunk: (text: string) => void,
  onError: (err: Error) => void,
  onEvent?: (payload: Record<string, unknown>) => void,
): void {
  const jsonStr = line.startsWith('data: ') ? line.slice('data: '.length) : line;

  if (jsonStr === '[DONE]') {
    return;
  }

  try {
    const parsed: unknown = JSON.parse(jsonStr);

    if (!parsed || typeof parsed !== 'object') {
      return;
    }

    const obj = parsed as Record<string, unknown>;
    onEvent?.(obj);

    if (typeof obj['error'] === 'string') {
      onError(new Error(obj['error']));
      return;
    }

    // Support both { text: "..." } and OpenAI-style { choices: [{ delta: { content: "..." } }] }
    if (typeof obj['text'] === 'string') {
      onChunk(obj['text']);
      return;
    }

    const choices = obj['choices'];
    if (Array.isArray(choices) && choices.length > 0) {
      const delta = (choices[0] as Record<string, unknown>)['delta'];
      if (delta && typeof delta === 'object') {
        const deltaContent = (delta as Record<string, unknown>)['content'];
        if (typeof deltaContent === 'string') {
          onChunk(deltaContent);
        }
      }
    }
  } catch {
    // Malformed JSON in SSE line — skip silently.
    console.debug('[CloudAPI] Skipping unparseable SSE line:', line);
  }
}

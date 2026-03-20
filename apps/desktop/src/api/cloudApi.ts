/**
 * Cloud API Client
 *
 * HTTP client for the AGI Workforce API gateway (cloud-mode conversations).
 * Handles conversation CRUD and LLM message sending via SSE streaming.
 */

import { supabaseAuth } from '../services/supabaseAuth';

const CLOUD_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

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
  conversation_id: string;
  content: string;
  model: string;
}

// ============================================================================
// Auth Helper
// ============================================================================

/**
 * Retrieves the current Supabase session access token and returns the standard
 * auth + content-type headers required by the API gateway.
 *
 * @throws {Error} When no active session is found
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const session = supabaseAuth.getSession();

  if (!session?.access_token) {
    throw new Error('No active session — user must be signed in to use Cloud API');
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
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

  return res.json() as Promise<CloudConversation[]>;
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

  return res.json() as Promise<CloudConversation>;
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

  return res.json() as Promise<CloudConversation>;
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
  onDone: () => void,
  onError: (err: Error) => void,
  signal?: AbortSignal,
): Promise<void> {
  let headers: Record<string, string>;

  try {
    headers = await getAuthHeaders();
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  const body: SendMessageRequest = {
    conversation_id: conversationId,
    content,
    model,
  };

  let res: Response;

  try {
    res = await fetch(`${CLOUD_API_BASE_URL}/api/cloud-chat/send`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
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
          parseAndDispatchLine(buffer.trim(), onChunk);
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
          parseAndDispatchLine(trimmed, onChunk);
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
function parseAndDispatchLine(line: string, onChunk: (text: string) => void): void {
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

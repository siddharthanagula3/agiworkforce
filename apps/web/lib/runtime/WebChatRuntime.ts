/**
 * WebChatRuntime
 *
 * Implements ChatRuntime from @agiworkforce/unified-chat for the web surface.
 * Delegates to the existing /api/llm/v1/chat/completions SSE endpoint and the
 * /api/chat/conversations REST endpoints already used by useChatStream.
 */

import type {
  ChatRuntime,
  SendMessageOptions,
  StreamCallback,
  StreamEvent,
  Conversation,
  ChatMessage,
} from '@agiworkforce/unified-chat';
import { getSupabaseClient } from '@/services/supabase';

async function getAuthToken(): Promise<string> {
  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  return session.access_token;
}

function authHeaders(token: string): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

interface ApiConversation {
  id: string;
  title?: string | null;
  created_at: string;
  updated_at: string;
  model?: string | null;
}

interface ApiMessage {
  id: string;
  conversation_id?: string;
  role: string;
  content: string;
  created_at: string;
  model?: string | null;
}

function mapConversation(c: ApiConversation): Conversation {
  return {
    id: c.id,
    title: c.title ?? 'New Conversation',
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    model: c.model ?? undefined,
    archived: false,
    pinned: false,
  };
}

function mapMessage(m: ApiMessage): ChatMessage {
  const role = m.role as 'user' | 'assistant' | 'system';
  return {
    id: m.id,
    conversationId: m.conversation_id ?? '',
    role,
    content: m.content,
    createdAt: m.created_at,
    model: m.model ?? undefined,
  };
}

export class WebChatRuntime implements ChatRuntime {
  private readonly _streamCallbacks = new Set<StreamCallback>();
  private readonly _abortControllers = new Map<string, AbortController>();

  private emit(event: StreamEvent): void {
    for (const cb of this._streamCallbacks) cb(event);
  }

  getPlatform(): 'web' {
    return 'web';
  }

  onStream(callback: StreamCallback): () => void {
    this._streamCallbacks.add(callback);
    return () => this._streamCallbacks.delete(callback);
  }

  async sendMessage(
    conversationId: string,
    content: string,
    options?: SendMessageOptions,
  ): Promise<void> {
    const token = await getAuthToken();
    const controller = new AbortController();
    this._abortControllers.set(conversationId, controller);
    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    // Fetch existing messages for history
    let history: Array<{ role: string; content: string }> = [];
    if (options?.messageHistory) {
      history = options.messageHistory;
    } else {
      try {
        const msgs = await this.getMessages(conversationId);
        history = msgs.map((m) => ({ role: m.role, content: m.content }));
      } catch {
        // Non-fatal: proceed without history
      }
    }
    // Append the new user message
    history.push({ role: 'user', content });

    const response = await fetch('/api/llm/v1/chat/completions', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        model: options?.model ?? undefined,
        messages: history,
        stream: true,
        thinking_mode: options?.thinkingEnabled ?? undefined,
        web_search: options?.webSearch ?? undefined,
        code_execution: options?.codeExecution ?? undefined,
        agent_mode: options?.agentMode ?? undefined,
        use_prompt_cache: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      this.emit({ type: 'error', error: err.error?.message ?? `HTTP ${response.status}` });
      return;
    }
    if (!response.body) {
      this.emit({ type: 'error', error: 'No response body' });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let inThinking = false;

    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          if (inThinking) {
            inThinking = false;
          }
          this.emit({ type: 'done' });
          break outer;
        }
        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          let chunk: string | null = null;
          const choices = parsed['choices'];
          if (Array.isArray(choices) && choices.length > 0) {
            const delta = (choices[0] as Record<string, unknown>)['delta'];
            if (delta && typeof (delta as Record<string, unknown>)['content'] === 'string') {
              chunk = (delta as Record<string, unknown>)['content'] as string;
            }
          } else if (parsed['type'] === 'content_block_delta') {
            const delta = parsed['delta'] as Record<string, unknown> | undefined;
            if (delta && typeof delta['text'] === 'string') {
              chunk = delta['text'] as string;
            }
          }
          if (chunk !== null) {
            if (chunk === '<thinking>') {
              inThinking = true;
            } else if (chunk === '</thinking>') {
              inThinking = false;
            } else if (inThinking) {
              this.emit({ type: 'thinking', content: chunk });
            } else {
              this.emit({ type: 'content', content: chunk });
            }
          }
        } catch {
          // Non-JSON lines are expected; skip silently
        }
      }
    }

    this._abortControllers.delete(conversationId);
  }

  stopGeneration(conversationId: string): void {
    this._abortControllers.get(conversationId)?.abort();
    this._abortControllers.delete(conversationId);
  }

  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    const token = await getAuthToken();
    const res = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { messages?: ApiMessage[] };
    return (data.messages ?? []).map(mapMessage);
  }

  async createConversation(title = 'New Conversation'): Promise<string | Conversation> {
    const token = await getAuthToken();
    const res = await fetch('/api/chat/conversations', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error(`createConversation failed: ${res.status}`);
    const data = (await res.json()) as { conversation?: ApiConversation; id?: string };
    if (data.conversation) return mapConversation(data.conversation);
    return (data.id as string) ?? crypto.randomUUID();
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const token = await getAuthToken();
    await fetch(`/api/chat/conversations/${conversationId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async renameConversation(conversationId: string, title: string): Promise<void> {
    const token = await getAuthToken();
    await fetch(`/api/chat/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ title }),
    });
  }

  async loadConversations(): Promise<Conversation[]> {
    const token = await getAuthToken();
    const res = await fetch('/api/chat/conversations', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { conversations?: ApiConversation[] };
    return (data.conversations ?? []).map(mapConversation);
  }
}

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
import { getAuthToken as getClerkToken } from '@shared/lib/get-auth-token';
import { addCsrfHeaders } from '@/lib/client/csrf';

const DEFAULT_WEB_CHAT_MODEL = 'auto-economy';

async function getAuthToken(): Promise<string> {
  const token = await getClerkToken();
  if (!token) throw new Error('Not authenticated');
  return token;
}

async function authHeaders(token: string): Promise<HeadersInit> {
  return addCsrfHeaders({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  });
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

    // Pass approval_mode=auto so the server-side tool loop executes MCP tools
    // immediately and feeds results back in-stream. The tool_call/tool_result
    // StreamEvents below update the ToolTimeline in the chat UI. When the
    // route has no MCP tools configured the query param is ignored.
    const completionsUrl = '/api/llm/v1/chat/completions?approval_mode=auto';

    const response = await fetch(completionsUrl, {
      method: 'POST',
      headers: await authHeaders(token),
      body: JSON.stringify({
        model: options?.model ?? DEFAULT_WEB_CHAT_MODEL,
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
            const delta = (choices[0] as Record<string, unknown>)['delta'] as
              | Record<string, unknown>
              | undefined;

            if (delta && typeof delta['content'] === 'string') {
              chunk = delta['content'] as string;
            }

            // ── MCP tool events emitted by tool-loop.ts ────────────────────
            // x_tool_status: a tool started or finished (status = running | completed | failed)
            if (delta && delta['x_tool_status']) {
              const ts = delta['x_tool_status'] as Record<string, unknown>;
              const toolName = String(ts['name'] ?? 'tool');
              const status = String(ts['status'] ?? 'running') as
                | 'running'
                | 'completed'
                | 'failed';
              // Emit a tool_call event so useChat's onStream handler updates
              // the ToolTimeline via the chat store.
              this.emit({
                type: 'tool_call',
                toolCall: {
                  id: toolName,
                  name: toolName,
                  args: {},
                },
              });
              if (status === 'completed' || status === 'failed') {
                this.emit({
                  type: 'tool_result',
                  toolCallId: toolName,
                  ...(status === 'failed' ? { error: 'Tool execution failed' } : {}),
                });
              }
            }

            // x_tool_result: final output from a tool execution
            if (delta && delta['x_tool_result']) {
              const tr = delta['x_tool_result'] as Record<string, unknown>;
              const toolCallId = String(tr['tool_call_id'] ?? '');
              const isError = tr['is_error'] === true;
              const content = String(tr['content'] ?? '');
              this.emit({
                type: 'tool_result',
                toolCallId,
                ...(isError ? { error: content } : { result: content }),
              });
            }

            // x_tool_approval_request: tool is gated on user consent (manual mode).
            // In auto mode this event is never sent. Emit a tool_call with the
            // args so the ToolCallCard renders the approval prompt.
            if (delta && delta['x_tool_approval_request']) {
              const req = delta['x_tool_approval_request'] as Record<string, unknown>;
              this.emit({
                type: 'tool_call',
                toolCall: {
                  id: String(req['tool_call_id'] ?? crypto.randomUUID()),
                  name: String(req['name'] ?? 'tool'),
                  args: (req['args'] as Record<string, unknown>) ?? {},
                },
              });
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
      headers: await authHeaders(token),
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
      headers: await authHeaders(token),
    });
  }

  async renameConversation(conversationId: string, title: string): Promise<void> {
    const token = await getAuthToken();
    await fetch(`/api/chat/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: await authHeaders(token),
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

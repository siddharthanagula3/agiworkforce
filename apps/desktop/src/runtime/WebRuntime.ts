/**
 * WebRuntime
 *
 * Implements the ChatRuntime interface from @agiworkforce/chat for the web
 * (cloud) deployment. Uses the cloud API gateway for conversation CRUD and
 * SSE streaming for message generation.
 *
 * Streaming pattern:
 *   - sendMessage() calls sendCloudMessage() which opens an SSE connection
 *   - SSE chunks are forwarded to registered onStream callbacks
 *   - Cancellation is handled via AbortController
 */

import type {
  ChatRuntime,
  Artifact,
  SendMessageOptions,
  StreamCallback,
  StreamEvent,
} from '@agiworkforce/chat';
import type { Conversation, ChatMessage } from '@agiworkforce/chat';
import {
  listCloudConversations,
  createCloudConversation,
  getCloudConversation,
  deleteCloudConversation,
  updateCloudConversationTitle,
  sendCloudMessage,
  type CloudConversation,
  type CloudMessage,
} from '../api/cloudApi';
import { getProviderDefaultModel, normalizeModelId } from '../constants/llm';

// ---------------------------------------------------------------------------
// Mapping helpers — cloud API uses snake_case, ChatRuntime uses camelCase
// ---------------------------------------------------------------------------

function mapConversation(cloud: CloudConversation): Conversation {
  return {
    id: cloud.id,
    title: cloud.title ?? 'New Conversation',
    createdAt: cloud.created_at,
    updatedAt: cloud.updated_at,
    model: cloud.model,
    messageCount: cloud.messages?.length,
    archived: false,
    pinned: false,
  };
}

function mapMessage(cloud: CloudMessage): ChatMessage {
  return {
    id: cloud.id,
    conversationId: cloud.conversation_id,
    role: cloud.role,
    content: cloud.content,
    createdAt: cloud.created_at,
    model: cloud.model,
  };
}

// ---------------------------------------------------------------------------
// WebRuntime implementation
// ---------------------------------------------------------------------------

export class WebRuntime implements ChatRuntime {
  private readonly _streamCallbacks = new Set<StreamCallback>();
  private readonly _abortControllers = new Map<string, AbortController>();

  private emit(event: StreamEvent): void {
    for (const cb of this._streamCallbacks) {
      cb(event);
    }
  }

  // -------------------------------------------------------------------------
  // sendMessage — streams via SSE through the cloud API
  // -------------------------------------------------------------------------

  async sendMessage(
    conversationId: string,
    content: string,
    options?: SendMessageOptions,
  ): Promise<void> {
    const model =
      normalizeModelId(options?.model ?? '') ??
      getProviderDefaultModel('anthropic') ??
      'claude-sonnet-4.6';
    const controller = new AbortController();
    this._abortControllers.set(conversationId, controller);
    const toolCallBuffer = new Map<
      string,
      {
        id: string;
        name: string;
        argsJson: string;
      }
    >();
    let inThinkingBlock = false;

    // If the caller provided an external signal, chain it
    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      await sendCloudMessage(
        conversationId,
        content,
        model,
        // onChunk
        (text: string) => {
          if (text === '<thinking>') {
            inThinkingBlock = true;
            return;
          }

          if (text === '</thinking>') {
            inThinkingBlock = false;
            return;
          }

          this.emit({
            type: inThinkingBlock ? 'thinking' : 'content',
            content: text,
          });
        },
        // onDone
        () => {
          this.emit({ type: 'done' });
        },
        // onError
        (err: Error) => {
          this.emit({ type: 'error', error: err.message });
        },
        controller.signal,
        (payload) => {
          const choices = Array.isArray(payload['choices']) ? payload['choices'] : [];
          const delta =
            choices.length > 0 && choices[0] && typeof choices[0] === 'object'
              ? ((choices[0] as Record<string, unknown>)['delta'] as
                  | Record<string, unknown>
                  | undefined)
              : undefined;

          const toolCalls = Array.isArray(delta?.['tool_calls']) ? delta['tool_calls'] : [];
          for (const entry of toolCalls) {
            if (!entry || typeof entry !== 'object') {
              continue;
            }

            const toolCall = entry as Record<string, unknown>;
            const functionData =
              toolCall['function'] && typeof toolCall['function'] === 'object'
                ? (toolCall['function'] as Record<string, unknown>)
                : null;
            const callId =
              (typeof toolCall['id'] === 'string' && toolCall['id']) ||
              `tool-${toolCall['index'] ?? toolCallBuffer.size}`;
            const existing = toolCallBuffer.get(callId) ?? {
              id: callId,
              name: typeof functionData?.['name'] === 'string' ? functionData['name'] : 'tool',
              argsJson: '',
            };

            const nextName =
              typeof functionData?.['name'] === 'string' && functionData['name'].length > 0
                ? functionData['name']
                : existing.name;
            const nextArgsJson =
              existing.argsJson +
              (typeof functionData?.['arguments'] === 'string' ? functionData['arguments'] : '');

            toolCallBuffer.set(callId, {
              id: callId,
              name: nextName,
              argsJson: nextArgsJson,
            });

            let parsedArgs: Record<string, unknown> = {};
            if (nextArgsJson.trim().length > 0) {
              try {
                const parsed = JSON.parse(nextArgsJson);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                  parsedArgs = parsed as Record<string, unknown>;
                } else {
                  parsedArgs = { value: parsed };
                }
              } catch {
                parsedArgs = { _partial: nextArgsJson };
              }
            }

            this.emit({
              type: 'tool_call',
              toolCall: {
                id: callId,
                name: nextName,
                args: parsedArgs,
              },
            });
          }

          const artifactPayload =
            payload['artifact'] && typeof payload['artifact'] === 'object'
              ? (payload['artifact'] as Artifact)
              : null;
          if (
            artifactPayload?.id &&
            artifactPayload?.type &&
            typeof artifactPayload.content === 'string'
          ) {
            this.emit({ type: 'artifact', artifact: artifactPayload });
          }
        },
        options?.webSearch,
        options?.messageHistory,
        options?.thinkingEnabled,
      );
    } catch (err) {
      // Only emit error if it wasn't an intentional abort
      if (!controller.signal.aborted) {
        const message = err instanceof Error ? err.message : String(err);
        this.emit({ type: 'error', error: message });
      }
    } finally {
      this._abortControllers.delete(conversationId);
    }
  }

  // -------------------------------------------------------------------------
  // stopGeneration — aborts the in-flight SSE request
  // -------------------------------------------------------------------------

  stopGeneration(conversationId: string): void {
    const controller = this._abortControllers.get(conversationId);
    if (controller) {
      controller.abort();
      this._abortControllers.delete(conversationId);
    }
  }

  // -------------------------------------------------------------------------
  // onStream — register streaming event callbacks
  // -------------------------------------------------------------------------

  onStream(callback: StreamCallback): () => void {
    this._streamCallbacks.add(callback);
    return () => this._streamCallbacks.delete(callback);
  }

  // -------------------------------------------------------------------------
  // Conversation CRUD
  // -------------------------------------------------------------------------

  async createConversation(title?: string): Promise<Conversation> {
    const cloud = await createCloudConversation(
      title ?? 'New Conversation',
      getProviderDefaultModel('anthropic') ?? 'claude-sonnet-4.6',
    );
    return mapConversation(cloud);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await deleteCloudConversation(conversationId);
  }

  async renameConversation(conversationId: string, title: string): Promise<void> {
    await updateCloudConversationTitle(conversationId, title);
  }

  // -------------------------------------------------------------------------
  // Conversation listing
  // -------------------------------------------------------------------------

  async listConversations(): Promise<{ id: string; title: string; updatedAt: string }[]> {
    const conversations = await listCloudConversations();
    return conversations.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updated_at,
    }));
  }

  async loadConversations(): Promise<Conversation[]> {
    const conversations = await listCloudConversations();
    return conversations.map(mapConversation);
  }

  // -------------------------------------------------------------------------
  // Message loading
  // -------------------------------------------------------------------------

  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    const conversation = await getCloudConversation(conversationId);
    return (conversation.messages ?? []).map(mapMessage);
  }

  async loadMessages(conversationId: string): Promise<ChatMessage[]> {
    return this.getMessages(conversationId);
  }

  // -------------------------------------------------------------------------
  // Platform identifier
  // -------------------------------------------------------------------------

  getPlatform(): 'desktop' | 'web' | 'mobile' {
    return 'web';
  }
}

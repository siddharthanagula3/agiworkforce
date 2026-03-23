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

  // -------------------------------------------------------------------------
  // sendMessage — streams via SSE through the cloud API
  // -------------------------------------------------------------------------

  async sendMessage(
    conversationId: string,
    content: string,
    options?: SendMessageOptions,
  ): Promise<void> {
    const model = options?.model ?? 'claude-sonnet-4-20250514';
    const controller = new AbortController();
    this._abortControllers.set(conversationId, controller);

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
          const event: StreamEvent = { type: 'content', content: text };
          for (const cb of this._streamCallbacks) {
            cb(event);
          }
        },
        // onDone
        () => {
          const event: StreamEvent = { type: 'done' };
          for (const cb of this._streamCallbacks) {
            cb(event);
          }
        },
        // onError
        (err: Error) => {
          const event: StreamEvent = { type: 'error', error: err.message };
          for (const cb of this._streamCallbacks) {
            cb(event);
          }
        },
        controller.signal,
        undefined, // onEvent
        options?.webSearch,
        options?.messageHistory,
      );
    } catch (err) {
      // Only emit error if it wasn't an intentional abort
      if (!controller.signal.aborted) {
        const message = err instanceof Error ? err.message : String(err);
        const event: StreamEvent = { type: 'error', error: message };
        for (const cb of this._streamCallbacks) {
          cb(event);
        }
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
      'claude-sonnet-4-20250514',
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

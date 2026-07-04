/**
 * CloudRuntime
 *
 * Implements the ChatRuntime interface from @agiworkforce/unified-chat for
 * DESKTOP MANAGED-CLOUD mode (DCL-2/DCL-4). This is the "one logical cloud"
 * seam: desktop talks to the SAME backend as web, not a separate one.
 *
 *   - Conversation CRUD + message persistence: the shared
 *     `getDesktopCloudChatPersistenceClient()` (DCL-1/DCL-2), which hits the
 *     real `/api/chat/conversations*` Neon-backed routes via `guardedFetch`
 *     on the absolute cloud origin. Throws if desktop is not in managed-cloud
 *     mode (Local/BYOK, or the PA-3 coming-soon gate) — see that module's
 *     trust-boundary doc comment.
 *   - Streaming: `sendCloudMessage` (`apps/desktop/src/api/cloudApi.ts`),
 *     which already targets the real live streaming endpoint
 *     (`POST /api/llm/v1/chat/completions`, `stream: true`) — this is the
 *     SAME endpoint `apps/web/lib/hooks/useChatStream.ts` calls, confirmed by
 *     direct comparison, so streaming was already correctly aligned (only
 *     `cloudApi.ts`'s separate `/api/cloud-chat` conversation-CRUD functions
 *     are the legacy, non-shared-backend path — this runtime does NOT use
 *     those; conversation CRUD always goes through the DCL-1/DCL-2 client).
 *   - Message durability mirrors `useChatStream.ts`'s `saveMessageToDb()`
 *     call pattern: the user message is persisted before streaming starts,
 *     and the assistant message is persisted once the stream completes.
 *
 * NOT WIRED INTO THE LIVE APP YET: nothing in `App.tsx`/`appModeStore`
 * currently selects this runtime — the PA-3 gate still keeps
 * `appModeStore.mode` from ever reaching `'cloud'` on a Tauri build, and the
 * runtime-selection switch in `App.tsx` is a static `isTauri ? TauriRuntime :
 * WebRuntime` with no cloud branch. Wiring the selection is a DCL-4 step
 * (requires the signed-build + live-credential verification before the
 * PA-3 gate can be lifted); this class exists so that step is a selection
 * change, not new plumbing. See `docs/strategy/PUBLIC-ALPHA-CUTOVER.md`'s
 * DCL-1/DCL-4 notes and `docs/agent-context/known-flaws.md`'s
 * `DESKTOP-CLOUD-MODE-SPEC-VS-REALITY-01`.
 *
 * @module CloudRuntime
 */

import type {
  ChatRuntime,
  SendMessageOptions,
  StreamCallback,
  StreamEvent,
} from '@agiworkforce/unified-chat';
import type { Conversation, ChatMessage } from '@agiworkforce/unified-chat';
import type { CloudConversation, CloudConversationMessageRaw } from '@agiworkforce/unified-chat';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import { sendCloudMessage } from '../api/cloudApi';
import { getDesktopCloudChatPersistenceClient } from '../lib/cloudChatPersistence';
import { getProviderDefaultModel, normalizeModelId } from '../constants/llm';
import { getDefaultModelFor } from '@agiworkforce/types';

// ---------------------------------------------------------------------------
// Mapping helpers — the DCL-1/DCL-2 client's normalized DTOs -> ChatRuntime DTOs
// ---------------------------------------------------------------------------

function mapConversation(cloud: CloudConversation): Conversation {
  return {
    id: cloud.id,
    title: cloud.title,
    createdAt: cloud.createdAt.toISOString(),
    updatedAt: cloud.updatedAt.toISOString(),
    model: cloud.model,
    archived: false,
    pinned: false,
  };
}

/** The persistence client passes messages through un-normalized (surface-specific). */
function mapMessage(conversationId: string, raw: CloudConversationMessageRaw): ChatMessage {
  return {
    id: typeof raw['id'] === 'string' ? raw['id'] : uuidv7(),
    conversationId,
    role: (raw['role'] as ChatMessage['role']) ?? 'user',
    content: typeof raw['content'] === 'string' ? raw['content'] : '',
    createdAt: typeof raw['created_at'] === 'string' ? raw['created_at'] : new Date().toISOString(),
    model: typeof raw['model'] === 'string' ? raw['model'] : undefined,
  };
}

// ---------------------------------------------------------------------------
// CloudRuntime implementation
// ---------------------------------------------------------------------------

export class CloudRuntime implements ChatRuntime {
  private readonly _streamCallbacks = new Set<StreamCallback>();
  private readonly _abortControllers = new Map<string, AbortController>();

  private emit(event: StreamEvent): void {
    for (const cb of this._streamCallbacks) {
      cb(event);
    }
  }

  // -------------------------------------------------------------------------
  // sendMessage — persists the user turn, streams the reply, persists the
  // assistant turn. Mirrors useChatStream.ts's save-before/save-after pattern.
  // -------------------------------------------------------------------------

  async sendMessage(
    conversationId: string,
    content: string,
    options?: SendMessageOptions,
  ): Promise<void> {
    const model =
      normalizeModelId(options?.model ?? '') ??
      getProviderDefaultModel('anthropic') ??
      getDefaultModelFor(null, 'chat');
    const client = getDesktopCloudChatPersistenceClient();

    // Persist the user turn before streaming starts (mirrors
    // useChatStream.ts's saveMessageToDb call for the user message).
    try {
      await client.saveMessage(conversationId, { id: uuidv7(), role: 'user', content, model });
    } catch (err) {
      this.emit({
        type: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const controller = new AbortController();
    this._abortControllers.set(conversationId, controller);
    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    let assistantContent = '';

    try {
      await sendCloudMessage(
        conversationId,
        content,
        model,
        // onChunk
        (text: string) => {
          assistantContent += text;
          this.emit({ type: 'content', content: text });
        },
        // onDone
        () => {
          // Persist the completed assistant turn (mirrors useChatStream.ts's
          // saveMessageToDb call for the completed assistant message). Fire
          // without blocking `onDone`'s emit — a persistence failure here
          // must not hide a successful stream from the UI, but is surfaced
          // via a follow-up 'error' event so the caller can retry the save.
          void client
            .saveMessage(conversationId, {
              id: uuidv7(),
              role: 'assistant',
              content: assistantContent,
              model,
            })
            .catch((err: unknown) => {
              this.emit({
                type: 'error',
                error: `Reply persisted locally but failed to save to cloud: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              });
            });
          this.emit({ type: 'done' });
        },
        // onError
        (err: Error) => {
          this.emit({ type: 'error', error: err.message });
        },
        controller.signal,
        undefined,
        options?.webSearch,
        options?.messageHistory,
        options?.thinkingEnabled,
      );
    } catch (err) {
      if (!controller.signal.aborted) {
        const message = err instanceof Error ? err.message : String(err);
        this.emit({ type: 'error', error: message });
      }
    } finally {
      this._abortControllers.delete(conversationId);
    }
  }

  // -------------------------------------------------------------------------
  // stopGeneration
  // -------------------------------------------------------------------------

  stopGeneration(conversationId: string): void {
    const controller = this._abortControllers.get(conversationId);
    if (controller) {
      controller.abort();
      this._abortControllers.delete(conversationId);
    }
  }

  // -------------------------------------------------------------------------
  // onStream
  // -------------------------------------------------------------------------

  onStream(callback: StreamCallback): () => void {
    this._streamCallbacks.add(callback);
    return () => this._streamCallbacks.delete(callback);
  }

  // -------------------------------------------------------------------------
  // Conversation CRUD — via the DCL-1/DCL-2 shared persistence client
  // -------------------------------------------------------------------------

  async createConversation(title?: string): Promise<Conversation> {
    const client = getDesktopCloudChatPersistenceClient();
    // Client-supplied UUIDv7 so desktop knows the cloud id before the
    // round-trip completes (needed for the DCL-4 continuity proof).
    const cloud = await client.createConversation({
      id: uuidv7(),
      title: title ?? 'New Conversation',
    });
    return mapConversation(cloud);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await getDesktopCloudChatPersistenceClient().deleteConversation(conversationId);
  }

  async renameConversation(conversationId: string, title: string): Promise<void> {
    await getDesktopCloudChatPersistenceClient().updateConversationTitle(conversationId, title);
  }

  // -------------------------------------------------------------------------
  // Conversation listing
  // -------------------------------------------------------------------------

  async listConversations(): Promise<{ id: string; title: string; updatedAt: string }[]> {
    const conversations = await getDesktopCloudChatPersistenceClient().listConversations();
    return conversations.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt.toISOString(),
    }));
  }

  async loadConversations(): Promise<Conversation[]> {
    const conversations = await getDesktopCloudChatPersistenceClient().listConversations();
    return conversations.map(mapConversation);
  }

  // -------------------------------------------------------------------------
  // Message loading
  // -------------------------------------------------------------------------

  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    const { messages } =
      await getDesktopCloudChatPersistenceClient().getConversation(conversationId);
    return messages.map((m) => mapMessage(conversationId, m));
  }

  async loadMessages(conversationId: string): Promise<ChatMessage[]> {
    return this.getMessages(conversationId);
  }

  // -------------------------------------------------------------------------
  // Platform identifier
  // -------------------------------------------------------------------------

  getPlatform(): 'desktop' | 'web' | 'mobile' {
    return 'desktop';
  }
}

/**
 * ConversationSyncService - 3-device conversation sync (web <> mobile <> desktop)
 *
 * Uses the /api/chat/conversations REST endpoints for push/pull.
 * Conflict resolution is last-write-wins based on `updated_at` timestamps.
 *
 * NOTE: Migrated from REST API route-backed table access to REST API routes.
 */

import { assertSurfaceCanSyncChats } from '@agiworkforce/types';
import type {
  LegacyWebSyncEvent as SyncEvent,
  LegacyWebSyncOrigin as SyncOrigin,
  LegacyWebSyncedConversation as SyncedConversation,
  LegacyWebSyncedMessage as SyncedMessage,
  LegacyWebSyncStatus as SyncStatus,
} from '@agiworkforce/types';

export type {
  LegacyWebSyncEvent as SyncEvent,
  LegacyWebSyncOrigin as SyncOrigin,
  LegacyWebSyncedConversation as SyncedConversation,
  LegacyWebSyncedMessage as SyncedMessage,
  LegacyWebSyncStatus as SyncStatus,
} from '@agiworkforce/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ConversationSyncService {
  private origin: SyncOrigin;
  private _status: SyncStatus = 'idle';
  private statusListeners: Set<(status: SyncStatus) => void> = new Set();
  private getToken: (() => Promise<string | null>) | null = null;

  constructor(_ignored: unknown, origin: SyncOrigin = 'web') {
    // /goal sync-rule enforcement: consumer chat sync is Web/Desktop/
    // Mobile only. If a future refactor accidentally constructs this
    // service from a developer surface (CLI/VS Code/Chrome), the
    // assertion fails fast at construction rather than silently
    // enrolling that surface into the consumer chat-history realtime
    // channel. See `assertSurfaceCanSyncChats` in
    // packages/types/src/suite-contracts.ts.
    assertSurfaceCanSyncChats(origin);
    this.origin = origin;
  }

  /** Current sync status. */
  get status(): SyncStatus {
    return this._status;
  }

  /** Register a listener for sync status changes. Returns unsubscribe fn. */
  onStatusChange(listener: (status: SyncStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  /** Provide a token getter (injected to avoid circular imports with auth). */
  setTokenGetter(fn: () => Promise<string | null>): void {
    this.getToken = fn;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const token = this.getToken ? await this.getToken() : null;
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }

  // -------------------------------------------------------------------------
  // Push
  // -------------------------------------------------------------------------

  /**
   * Push (upsert) a local conversation via /api/chat/conversations.
   */
  async pushConversation(conversation: SyncedConversation): Promise<void> {
    this.setStatus('syncing');
    try {
      const headers = await this.authHeaders();
      const res = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          id: conversation.id,
          title: conversation.title,
          model: conversation.model,
          synced_from: this.origin,
          metadata: conversation.metadata ?? {},
          created_at: conversation.created_at,
          updated_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        this.setStatus('error');
        throw new Error(`[ConversationSync] pushConversation failed: ${res.status}`);
      }
      this.setStatus('synced');
    } catch (err) {
      this.setStatus('error');
      throw err;
    }
  }

  /**
   * Push (upsert) messages for a conversation via /api/chat/conversations/:id/messages.
   */
  async pushMessages(messages: SyncedMessage[]): Promise<void> {
    if (messages.length === 0) return;

    this.setStatus('syncing');
    try {
      const headers = await this.authHeaders();
      const conversationId = messages[0]!.conversation_id;
      const res = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ messages }),
      });
      if (!res.ok) {
        this.setStatus('error');
        throw new Error(`[ConversationSync] pushMessages failed: ${res.status}`);
      }
      this.setStatus('synced');
    } catch (err) {
      this.setStatus('error');
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Pull
  // -------------------------------------------------------------------------

  /**
   * Pull conversations via /api/chat/conversations.
   */
  async pullConversations(since?: Date): Promise<SyncedConversation[]> {
    this.setStatus('syncing');
    try {
      const headers = await this.authHeaders();
      const url = since
        ? `/api/chat/conversations?since=${encodeURIComponent(since.toISOString())}`
        : '/api/chat/conversations';
      const res = await fetch(url, { headers });
      if (!res.ok) {
        this.setStatus('error');
        throw new Error(`[ConversationSync] pullConversations failed: ${res.status}`);
      }
      const body = (await res.json()) as { conversations?: SyncedConversation[] };
      this.setStatus('synced');
      return body.conversations ?? [];
    } catch (err) {
      this.setStatus('error');
      throw err;
    }
  }

  /**
   * Pull messages for a specific conversation.
   */
  async pullMessages(conversationId: string): Promise<SyncedMessage[]> {
    const headers = await this.authHeaders();
    const res = await fetch(`/api/chat/conversations/${conversationId}/messages`, { headers });
    if (!res.ok) {
      throw new Error(`[ConversationSync] pullMessages failed: ${res.status}`);
    }
    const body = (await res.json()) as { messages?: SyncedMessage[] };
    return body.messages ?? [];
  }

  // -------------------------------------------------------------------------
  // Realtime Subscribe
  // -------------------------------------------------------------------------

  /**
   * Subscribe to realtime conversation changes for the authenticated user.
   * (no-op stub - Realtime has been removed)
   *
   * Returns a no-op unsubscribe function. Callers should use polling or
   * another mechanism for cross-device sync.
   */
  subscribe(_userId: string, _onUpdate: (event: SyncEvent) => void): () => void {
    console.warn(
      '[ConversationSyncService] subscribe() called but Realtime has been removed. No subscription created.',
    );
    return () => {};
  }

  /**
   * Remove the realtime subscription (no-op stub).
   */
  unsubscribe(): void {
    // Realtime channel removed; nothing to clean up
  }

  // -------------------------------------------------------------------------
  // Merge (Conflict Resolution)
  // -------------------------------------------------------------------------

  /**
   * Merge a remote conversation with a local one using last-write-wins.
   *
   * Compares `updated_at` timestamps. The conversation with the more recent
   * `updated_at` wins. If timestamps are identical, remote wins (to avoid
   * data loss from a device that hasn't pushed yet).
   */
  mergeConversation(local: SyncedConversation, remote: SyncedConversation): SyncedConversation {
    const localTime = new Date(local.updated_at ?? local.created_at).getTime();
    const remoteTime = new Date(remote.updated_at ?? remote.created_at).getTime();

    // Remote wins on tie (safer - ensures server state is preserved)
    if (remoteTime >= localTime) {
      return remote;
    }

    return local;
  }

  /**
   * Merge message lists from local and remote.
   * Deduplicates by message ID, preferring the version with the later timestamp.
   */
  mergeMessages(local: SyncedMessage[], remote: SyncedMessage[]): SyncedMessage[] {
    const merged = new Map<string, SyncedMessage>();

    // Add all local messages first
    for (const msg of local) {
      merged.set(msg.id, msg);
    }

    // Overlay remote messages - last-write-wins per message
    for (const msg of remote) {
      const existing = merged.get(msg.id);
      if (!existing) {
        merged.set(msg.id, msg);
        continue;
      }

      const existingTime = new Date(existing.updated_at ?? existing.created_at ?? 0).getTime();
      const remoteTime = new Date(msg.updated_at ?? msg.created_at ?? 0).getTime();

      if (remoteTime >= existingTime) {
        merged.set(msg.id, msg);
      }
    }

    // Return sorted by created_at ascending
    return Array.from(merged.values()).sort(
      (a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime(),
    );
  }

  // -------------------------------------------------------------------------
  // Full Sync (Pull + Merge + Push)
  // -------------------------------------------------------------------------

  /**
   * Perform a full bidirectional sync for a user.
   *
   * 1. Pulls all remote conversations updated since `since`.
   * 2. Merges each with the corresponding local conversation (caller provides).
   * 3. Returns the merged list - caller is responsible for updating local state
   *    and pushing any local-only conversations via `pushConversation()`.
   */
  async fullSync(
    localConversations: SyncedConversation[],
    since?: Date,
  ): Promise<SyncedConversation[]> {
    this.setStatus('syncing');
    try {
      const remoteConversations = await this.pullConversations(since);

      const localMap = new Map<string, SyncedConversation>();
      for (const conv of localConversations) {
        localMap.set(conv.id, conv);
      }

      const remoteMap = new Map<string, SyncedConversation>();
      for (const conv of remoteConversations) {
        remoteMap.set(conv.id, conv);
      }

      const mergedMap = new Map<string, SyncedConversation>();

      // Merge conversations that exist on both sides
      for (const [id, local] of localMap) {
        const remote = remoteMap.get(id);
        if (remote) {
          mergedMap.set(id, this.mergeConversation(local, remote));
          remoteMap.delete(id);
        } else {
          mergedMap.set(id, local);
        }
      }

      // Add remote-only conversations
      for (const [id, remote] of remoteMap) {
        mergedMap.set(id, remote);
      }

      const result = Array.from(mergedMap.values()).sort(
        (a, b) =>
          new Date(b.updated_at ?? b.created_at).getTime() -
          new Date(a.updated_at ?? a.created_at).getTime(),
      );

      this.setStatus('synced');
      return result;
    } catch (err) {
      this.setStatus('error');
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  /**
   * Tear down the service - unsubscribes from realtime and clears listeners.
   */
  destroy(): void {
    this.unsubscribe();
    this.statusListeners.clear();
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private setStatus(status: SyncStatus): void {
    this._status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }
}

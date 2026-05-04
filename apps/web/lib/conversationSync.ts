/**
 * ConversationSyncService - 3-device conversation sync (web ↔ mobile ↔ desktop)
 *
 * Uses the existing `web_conversations` + `web_messages` Supabase tables with
 * realtime subscriptions for live cross-device push. Conflict resolution is
 * last-write-wins based on `updated_at` timestamps.
 *
 * Expected table shape (uses existing tables - no migration needed):
 *
 * ```sql
 * web_conversations (
 *   id uuid primary key default gen_random_uuid(),
 *   user_id uuid references auth.users not null,
 *   title text,
 *   model text,
 *   is_active boolean default true,
 *   synced_from text,           -- 'desktop' | 'web' | 'mobile' | null
 *   metadata jsonb default '{}',
 *   created_at timestamptz default now(),
 *   updated_at timestamptz default now(),
 *   deleted_at timestamptz
 * )
 *
 * web_messages (
 *   id uuid primary key default gen_random_uuid(),
 *   conversation_id uuid references web_conversations(id) on delete cascade,
 *   role text not null,
 *   content text not null,
 *   model text,
 *   input_tokens integer,
 *   output_tokens integer,
 *   cost_cents numeric,
 *   created_at timestamptz default now(),
 *   updated_at timestamptz
 * )
 * ```
 */

import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The origin surface that last wrote the conversation. */
export type SyncOrigin = 'desktop' | 'web' | 'mobile';

/** Sync status for UI indicators. */
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

/** Minimal synced conversation shape (matches web_conversations columns). */
export interface SyncedConversation {
  id: string;
  user_id: string;
  title: string | null;
  model: string | null;
  is_active: boolean | null;
  synced_from: SyncOrigin | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

/** Minimal synced message shape (matches web_messages columns). */
export interface SyncedMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_cents: number | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Callback shape for realtime subscription events. */
export interface SyncEvent {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  conversation: SyncedConversation;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ConversationSyncService {
  private supabase: SupabaseClient;
  private origin: SyncOrigin;
  private channel: RealtimeChannel | null = null;
  private _status: SyncStatus = 'idle';
  private statusListeners: Set<(status: SyncStatus) => void> = new Set();

  constructor(supabase: SupabaseClient, origin: SyncOrigin = 'web') {
    this.supabase = supabase;
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

  // -------------------------------------------------------------------------
  // Push
  // -------------------------------------------------------------------------

  /**
   * Push (upsert) a local conversation to Supabase.
   * Stamps `synced_from` with the current origin and updates `updated_at`.
   */
  async pushConversation(conversation: SyncedConversation): Promise<void> {
    this.setStatus('syncing');
    try {
      const { error } = await this.supabase.from('web_conversations').upsert(
        {
          id: conversation.id,
          user_id: conversation.user_id,
          title: conversation.title,
          model: conversation.model,
          is_active: conversation.is_active ?? true,
          synced_from: this.origin,
          metadata: conversation.metadata ?? {},
          created_at: conversation.created_at,
          updated_at: new Date().toISOString(),
          deleted_at: conversation.deleted_at,
        } as never,
        { onConflict: 'id' },
      );

      if (error) {
        this.setStatus('error');
        throw new Error(`[ConversationSync] pushConversation failed: ${error.message}`);
      }
      this.setStatus('synced');
    } catch (err) {
      this.setStatus('error');
      throw err;
    }
  }

  /**
   * Push (upsert) messages for a conversation.
   */
  async pushMessages(messages: SyncedMessage[]): Promise<void> {
    if (messages.length === 0) return;

    this.setStatus('syncing');
    try {
      const { error } = await this.supabase.from('web_messages').upsert(
        messages.map((m) => ({
          id: m.id,
          conversation_id: m.conversation_id,
          role: m.role,
          content: m.content,
          model: m.model,
          input_tokens: m.input_tokens,
          output_tokens: m.output_tokens,
          cost_cents: m.cost_cents,
          created_at: m.created_at,
          updated_at: new Date().toISOString(),
        })) as never,
        { onConflict: 'id' },
      );

      if (error) {
        this.setStatus('error');
        throw new Error(`[ConversationSync] pushMessages failed: ${error.message}`);
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
   * Pull conversations from Supabase, optionally filtered by updated_at > since.
   * Returns conversations ordered by most recently updated first.
   */
  async pullConversations(since?: Date): Promise<SyncedConversation[]> {
    this.setStatus('syncing');
    try {
      let query = this.supabase
        .from('web_conversations')
        .select('*')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(100);

      if (since) {
        query = query.gt('updated_at', since.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        this.setStatus('error');
        throw new Error(`[ConversationSync] pullConversations failed: ${error.message}`);
      }

      this.setStatus('synced');
      return (data ?? []) as unknown as SyncedConversation[];
    } catch (err) {
      this.setStatus('error');
      throw err;
    }
  }

  /**
   * Pull messages for a specific conversation.
   */
  async pullMessages(conversationId: string): Promise<SyncedMessage[]> {
    const { data, error } = await this.supabase
      .from('web_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`[ConversationSync] pullMessages failed: ${error.message}`);
    }

    return (data ?? []) as unknown as SyncedMessage[];
  }

  // -------------------------------------------------------------------------
  // Realtime Subscribe
  // -------------------------------------------------------------------------

  /**
   * Subscribe to realtime conversation changes for the authenticated user.
   * Returns an unsubscribe function.
   *
   * Uses Supabase Realtime postgres_changes channel filtered by user_id.
   */
  subscribe(userId: string, onUpdate: (event: SyncEvent) => void): () => void {
    // Clean up any existing subscription
    this.unsubscribe();

    this.channel = this.supabase
      .channel(`conversation-sync:${userId}`)
      .on(
        'postgres_changes' as never,
        {
          event: '*',
          schema: 'public',
          table: 'web_conversations',
          filter: `user_id=eq.${userId}`,
        },
        (payload: {
          eventType: string;
          new: Record<string, unknown>;
          old: Record<string, unknown>;
        }) => {
          const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
          const conversation = (eventType === 'DELETE'
            ? payload.old
            : payload.new) as unknown as SyncedConversation;

          // Skip events from our own origin to avoid echo loops
          if (conversation.synced_from === this.origin) return;

          onUpdate({ type: eventType, conversation });
        },
      )
      .subscribe();

    return () => this.unsubscribe();
  }

  /**
   * Remove the realtime subscription.
   */
  unsubscribe(): void {
    if (this.channel) {
      this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
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

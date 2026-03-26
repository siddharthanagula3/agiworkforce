/**
 * ConversationSyncService (Mobile) — 3-device conversation sync
 *
 * Same sync protocol as the web service but adapted for React Native:
 *   - Uses the mobile Supabase client (SecureStore-backed auth)
 *   - Syncs on app resume via AppState listener
 *   - Exposes manual sync trigger
 *   - Provides observable sync status for UI indicators
 *
 * Conflict resolution: last-write-wins based on `updated_at`.
 */

import { AppState, type AppStateStatus } from 'react-native';
import { supabase, getCurrentUser } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SyncOrigin = 'desktop' | 'web' | 'mobile';
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

/** Synced conversation shape — mirrors web_conversations columns. */
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

/** Synced message shape — mirrors web_messages columns. */
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

export interface SyncEvent {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  conversation: SyncedConversation;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class MobileConversationSyncService {
  private readonly origin: SyncOrigin = 'mobile';
  private channel: RealtimeChannel | null = null;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  private _status: SyncStatus = 'idle';
  private _inFlightOps = 0;
  private statusListeners: Set<(status: SyncStatus) => void> = new Set();
  private lastSyncAt: Date | null = null;
  private onSyncCallback: ((conversations: SyncedConversation[]) => void) | null = null;

  /** Current sync status. */
  get status(): SyncStatus {
    return this._status;
  }

  /** Timestamp of the last successful sync, or null if never synced. */
  get lastSynced(): Date | null {
    return this.lastSyncAt;
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

  async pushConversation(conversation: SyncedConversation): Promise<void> {
    this._inFlightOps++;
    this.setStatus('syncing');
    try {
      const { error } = await supabase.from('web_conversations').upsert(
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
        throw new Error(`[MobileSync] pushConversation failed: ${error.message}`);
      }
    } catch (err) {
      this.setStatus('error');
      throw err;
    } finally {
      this._inFlightOps = Math.max(0, this._inFlightOps - 1);
      if (this._inFlightOps === 0 && this._status === 'syncing') {
        this.setStatus('synced');
      }
    }
  }

  async pushMessages(messages: SyncedMessage[]): Promise<void> {
    if (messages.length === 0) return;

    this.setStatus('syncing');
    try {
      const { error } = await supabase.from('web_messages').upsert(
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
        throw new Error(`[MobileSync] pushMessages failed: ${error.message}`);
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

  async pullConversations(since?: Date): Promise<SyncedConversation[]> {
    this._inFlightOps++;
    this.setStatus('syncing');
    try {
      let query = supabase
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
        throw new Error(`[MobileSync] pullConversations failed: ${error.message}`);
      }

      this.lastSyncAt = new Date();
      return (data ?? []) as unknown as SyncedConversation[];
    } catch (err) {
      this.setStatus('error');
      throw err;
    } finally {
      this._inFlightOps = Math.max(0, this._inFlightOps - 1);
      if (this._inFlightOps === 0 && this._status === 'syncing') {
        this.setStatus('synced');
      }
    }
  }

  async pullMessages(conversationId: string): Promise<SyncedMessage[]> {
    const { data, error } = await supabase
      .from('web_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`[MobileSync] pullMessages failed: ${error.message}`);
    }

    return (data ?? []) as unknown as SyncedMessage[];
  }

  // -------------------------------------------------------------------------
  // Realtime Subscribe
  // -------------------------------------------------------------------------

  subscribe(userId: string, onUpdate: (event: SyncEvent) => void): () => void {
    this.unsubscribeRealtime();

    this.channel = supabase
      .channel(`mobile-conversation-sync:${userId}`)
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

          // Skip our own writes to prevent echo loops
          if (conversation.synced_from === this.origin) return;

          onUpdate({ type: eventType, conversation });
        },
      )
      .subscribe();

    return () => this.unsubscribeRealtime();
  }

  private unsubscribeRealtime(): void {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }

  // -------------------------------------------------------------------------
  // Merge (Conflict Resolution)
  // -------------------------------------------------------------------------

  mergeConversation(local: SyncedConversation, remote: SyncedConversation): SyncedConversation {
    const localTime = new Date(local.updated_at ?? local.created_at).getTime();
    const remoteTime = new Date(remote.updated_at ?? remote.created_at).getTime();

    // Remote wins on tie
    return remoteTime >= localTime ? remote : local;
  }

  mergeMessages(local: SyncedMessage[], remote: SyncedMessage[]): SyncedMessage[] {
    const merged = new Map<string, SyncedMessage>();

    for (const msg of local) {
      merged.set(msg.id, msg);
    }

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

    return Array.from(merged.values()).sort(
      (a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime(),
    );
  }

  // -------------------------------------------------------------------------
  // Full Sync
  // -------------------------------------------------------------------------

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

      for (const [id, local] of localMap) {
        const remote = remoteMap.get(id);
        if (remote) {
          mergedMap.set(id, this.mergeConversation(local, remote));
          remoteMap.delete(id);
        } else {
          mergedMap.set(id, local);
        }
      }

      for (const [id, remote] of remoteMap) {
        mergedMap.set(id, remote);
      }

      const result = Array.from(mergedMap.values()).sort(
        (a, b) =>
          new Date(b.updated_at ?? b.created_at).getTime() -
          new Date(a.updated_at ?? a.created_at).getTime(),
      );

      this.lastSyncAt = new Date();
      this.setStatus('synced');
      return result;
    } catch (err) {
      this.setStatus('error');
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Manual Sync Trigger
  // -------------------------------------------------------------------------

  /**
   * Trigger a manual sync. Pulls conversations updated since last sync,
   * invokes the registered callback with merged results.
   */
  async triggerSync(localConversations: SyncedConversation[]): Promise<SyncedConversation[]> {
    return this.fullSync(localConversations, this.lastSyncAt ?? undefined);
  }

  // -------------------------------------------------------------------------
  // Background Sync on App Resume
  // -------------------------------------------------------------------------

  /**
   * Start listening for app state changes to trigger sync on resume.
   * Call this once during app initialization.
   *
   * @param onSync - Called with merged conversations after a successful sync.
   *                 The caller should update local state with the result.
   */
  startBackgroundSync(
    getLocalConversations: () => SyncedConversation[],
    onSync: (conversations: SyncedConversation[]) => void,
  ): void {
    this.onSyncCallback = onSync;

    // Clean up any existing subscription
    this.stopBackgroundSync();

    this.appStateSubscription = AppState.addEventListener(
      'change',
      async (nextState: AppStateStatus) => {
        if (nextState !== 'active') return;

        // Only sync if the user is authenticated
        const user = await getCurrentUser();
        if (!user) return;

        try {
          const merged = await this.fullSync(getLocalConversations(), this.lastSyncAt ?? undefined);
          this.onSyncCallback?.(merged);
        } catch (err) {
          // Swallow errors on background sync — the status is already set to 'error'
          // and consumers can observe it via onStatusChange()
          console.warn(
            '[MobileSync] Background sync failed:',
            err instanceof Error ? err.message : err,
          );
        }
      },
    );
  }

  /**
   * Stop the background sync listener.
   */
  stopBackgroundSync(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  destroy(): void {
    this.unsubscribeRealtime();
    this.stopBackgroundSync();
    this.statusListeners.clear();
    this.onSyncCallback = null;
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

/** Singleton instance for the mobile app. */
let _instance: MobileConversationSyncService | null = null;

export function getMobileSyncService(): MobileConversationSyncService {
  if (!_instance) {
    _instance = new MobileConversationSyncService();
  }
  return _instance;
}

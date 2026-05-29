/**
 * Mobile conversation sync facade.
 *
 * Mobile v1 does not subscribe to or write directly into a database platform.
 * Cross-device Cloud sync remains feature-gated until the Clerk-authenticated
 * Web/API channel is available.
 */

import { AppState, type AppStateStatus } from 'react-native';
import { FEATURES } from '@/lib/v1FeatureFlags';
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

export class MobileConversationSyncService {
  private readonly origin: SyncOrigin = 'mobile';
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  private _status: SyncStatus = 'idle';
  private statusListeners: Set<(status: SyncStatus) => void> = new Set();
  private lastSyncAt: Date | null = null;

  constructor() {
    assertSurfaceCanSyncChats(this.origin);
  }

  get status(): SyncStatus {
    return this._status;
  }

  get lastSynced(): Date | null {
    return this.lastSyncAt;
  }

  onStatusChange(listener: (status: SyncStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  async pushConversation(_conversation: SyncedConversation): Promise<void> {
    throw new Error('conversationSync: Web/API cloud sync is not available in Mobile v1');
  }

  async pushMessages(_messages: SyncedMessage[]): Promise<void> {
    throw new Error('conversationSync: Web/API cloud sync is not available in Mobile v1');
  }

  async pullConversations(_since?: Date): Promise<SyncedConversation[]> {
    throw new Error('conversationSync: Web/API cloud sync is not available in Mobile v1');
  }

  async pullMessages(_conversationId: string): Promise<SyncedMessage[]> {
    throw new Error('conversationSync: Web/API cloud sync is not available in Mobile v1');
  }

  subscribe(_userId: string, _onUpdate: (event: SyncEvent) => void): () => void {
    console.warn('[MobileSync] Cloud sync channel is disabled for Mobile v1.');
    return () => {};
  }

  mergeConversation(local: SyncedConversation, remote: SyncedConversation): SyncedConversation {
    const localTime = new Date(local.updated_at ?? local.created_at).getTime();
    const remoteTime = new Date(remote.updated_at ?? remote.created_at).getTime();
    return remoteTime >= localTime ? remote : local;
  }

  mergeMessages(local: SyncedMessage[], remote: SyncedMessage[]): SyncedMessage[] {
    const merged = new Map<string, SyncedMessage>();
    for (const msg of local) merged.set(msg.id, msg);
    for (const msg of remote) {
      const existing = merged.get(msg.id);
      if (!existing) {
        merged.set(msg.id, msg);
        continue;
      }
      const existingTime = new Date(existing.updated_at ?? existing.created_at ?? 0).getTime();
      const remoteTime = new Date(msg.updated_at ?? msg.created_at ?? 0).getTime();
      if (remoteTime >= existingTime) merged.set(msg.id, msg);
    }
    return Array.from(merged.values()).sort(
      (a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime(),
    );
  }

  async fullSync(localConversations: SyncedConversation[]): Promise<SyncedConversation[]> {
    this.setStatus('idle');
    return localConversations;
  }

  async triggerSync(localConversations: SyncedConversation[]): Promise<SyncedConversation[]> {
    return this.fullSync(localConversations);
  }

  startBackgroundSync(
    _getLocalConversations: () => SyncedConversation[],
    _onSync: (conversations: SyncedConversation[]) => void,
  ): void {
    this.stopBackgroundSync();
    this.appStateSubscription = AppState.addEventListener(
      'change',
      (_nextState: AppStateStatus) => {},
    );
  }

  stopBackgroundSync(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  }

  destroy(): void {
    this.stopBackgroundSync();
    this.statusListeners.clear();
  }

  private setStatus(status: SyncStatus): void {
    this._status = status;
    for (const listener of this.statusListeners) listener(status);
  }
}

let _instance: MobileConversationSyncService | null = null;

export function getMobileSyncService(): MobileConversationSyncService {
  if (!FEATURES.crossDeviceSync) {
    throw new Error('conversationSync: cloud sync not available in v1');
  }
  if (!_instance) _instance = new MobileConversationSyncService();
  return _instance;
}

import { invoke } from '../../lib/tauri-mock';
import {
  websocketClient,
  type RealtimeEvent,
  type UserActivity,
  type UserPresence,
} from '../../services/websocketClient';

interface ConnectionInfo {
  url: string;
  token: string;
}

export interface PresenceBridgeOptions {
  userId: string;
  teamId?: string;
  onPresenceChanged?: (presence: UserPresence[]) => void;
  onEvent?: (event: RealtimeEvent) => void;
}

export class PresenceBridge {
  private unsubscribers: Array<() => void> = [];
  private connected = false;
  private activeOptions: PresenceBridgeOptions | null = null;

  async connect(options: PresenceBridgeOptions): Promise<void> {
    this.activeOptions = options;

    // Validate that backend has realtime server state ready and token available.
    await invoke<ConnectionInfo>('connect_websocket', {
      userId: options.userId,
      teamId: options.teamId ?? null,
    });

    await websocketClient.connect(options.userId, options.teamId);

    this.unsubscribers.push(
      websocketClient.on('*', (event) => {
        options.onEvent?.(event);

        if (event.type === 'UserPresenceChanged') {
          void this.refreshTeamPresence();
        }
      }),
    );

    this.connected = true;

    await this.setOnline(options.userId);
    await this.refreshTeamPresence();
  }

  disconnect(): void {
    if (this.activeOptions?.userId) {
      void this.setOffline(this.activeOptions.userId);
    }

    websocketClient.disconnect();
    this.connected = false;

    this.unsubscribers.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch {
        // Ignore unsubscriber cleanup errors
      }
    });
    this.unsubscribers = [];
    this.activeOptions = null;
  }

  isConnected(): boolean {
    return this.connected && websocketClient.isConnected();
  }

  async setOnline(userId: string): Promise<void> {
    await invoke('set_user_online', { userId });
  }

  async setOffline(userId: string): Promise<void> {
    await invoke('set_user_offline', { userId });
  }

  async updateActivity(userId: string, activity: UserActivity): Promise<void> {
    await invoke('update_user_activity', { userId, activity });
  }

  async refreshTeamPresence(): Promise<UserPresence[]> {
    if (!this.activeOptions?.teamId) {
      return [];
    }

    const presence = await invoke<UserPresence[]>('get_team_presence', {
      teamId: this.activeOptions.teamId,
    });

    this.activeOptions.onPresenceChanged?.(presence);
    return presence;
  }
}

export const presenceBridge = new PresenceBridge();

import { invoke } from '../lib/tauri-mock';

export interface TelemetryEvent {
  name: string;
  properties: Record<string, unknown>;
  timestamp: number;
  session_id: string;
  user_id?: string;
}

export async function analyticsTrackEvent(event: TelemetryEvent): Promise<void> {
  try {
    await invoke('analytics_track_event', { event });
  } catch (error) {
    console.error('[analytics] failed to track event:', error);
    throw error;
  }
}

export async function analyticsFlushEvents(): Promise<void> {
  try {
    await invoke('analytics_flush_events');
  } catch (error) {
    console.error('[analytics] failed to flush events:', error);
    throw error;
  }
}

export async function analyticsGetSessionId(): Promise<string> {
  try {
    return await invoke<string>('analytics_get_session_id');
  } catch (error) {
    console.error('[analytics] failed to get session ID:', error);
    throw error;
  }
}

export async function analyticsSetUserProperty(key: string, value: unknown): Promise<void> {
  try {
    await invoke('analytics_set_user_property', { key, value });
  } catch (error) {
    console.error('[analytics] failed to set user property:', error);
    throw error;
  }
}

export async function analyticsSetPrivacyMode(mode: string): Promise<void> {
  try {
    await invoke('analytics_set_privacy_mode', { mode });
  } catch (error) {
    console.error('[analytics] failed to set privacy mode:', error);
  }
}

export async function analyticsDeleteAllData(): Promise<void> {
  try {
    await invoke('analytics_delete_all_data');
  } catch (error) {
    console.error('[analytics] failed to delete all data:', error);
    throw error;
  }
}

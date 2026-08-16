
import { invoke } from '../lib/tauri-mock';

export interface TimeoutConfig {
  max_duration_secs: number;
  enable_warnings: boolean;
  enable_checkpoint_on_timeout: boolean;
}

export interface TimeoutWarning {
  type: 'one_hour' | 'thirty_minutes' | 'five_minutes';
  remainingSecs: number;
}

export type TimeoutResponse =
  | { type: 'extend'; minutes: number }
  | { type: 'continue' }
  | { type: 'pause_later' }
  | { type: 'abort' };

export const getTimeoutConfig = async (): Promise<TimeoutConfig> => {
  return invoke<TimeoutConfig>('timeout_get_config');
};

export const setTimeoutConfig = async (config: TimeoutConfig): Promise<void> => {
  return invoke<void>('timeout_set_config', { config });
};

export const getRecommendedTimeout = async (taskType: string): Promise<number> => {
  return invoke<number>('timeout_get_recommended', { taskType });
};

export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  }
  return `${secs}s`;
};

export const minutesToSeconds = (minutes: number): number => {
  const MIN = 1;
  const MAX = 72 * 60;
  const clamped = Math.max(MIN, Math.min(MAX, minutes));
  return clamped * 60;
};

export const secondsToMinutes = (seconds: number): number => {
  return Math.round(seconds / 60);
};

/**
 * Timeout Management API
 *
 * Provides interfaces for managing extended task timeouts and warnings.
 */

import { invoke } from '@tauri-apps/api/core';

export interface TimeoutConfig {
  maxDurationSecs: number;
  enableWarnings: boolean;
  enableCheckpointOnTimeout: boolean;
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

/**
 * Get the current timeout configuration from settings
 */
export const getTimeoutConfig = async (): Promise<TimeoutConfig> => {
  return invoke<TimeoutConfig>('timeout_get_config');
};

/**
 * Set a new timeout configuration
 */
export const setTimeoutConfig = async (config: TimeoutConfig): Promise<void> => {
  return invoke<void>('timeout_set_config', { config });
};

/**
 * Get recommended timeout in seconds based on task type
 */
export const getRecommendedTimeout = async (taskType: string): Promise<number> => {
  return invoke<number>('timeout_get_recommended', { taskType });
};

/**
 * Format duration in seconds to human-readable string (e.g., "2h 30m")
 */
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

/**
 * Convert minutes to seconds with validation
 */
export const minutesToSeconds = (minutes: number): number => {
  const MIN = 1;
  const MAX = 72 * 60; // 72 hours
  const clamped = Math.max(MIN, Math.min(MAX, minutes));
  return clamped * 60;
};

/**
 * Convert seconds to minutes
 */
export const secondsToMinutes = (seconds: number): number => {
  return Math.round(seconds / 60);
};

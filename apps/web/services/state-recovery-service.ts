/**
 * State Recovery Service
 * Provides utilities for recovering from corrupted or invalid state
 */

import { toast } from 'sonner';
import type { StateSnapshot } from '@agiworkforce/types';

// Re-export for backward compatibility
export type { StateSnapshot };

class StateRecoveryService {
  private static readonly SNAPSHOT_KEY_PREFIX = 'state_snapshot_';
  private static readonly RECOVERY_LOG_KEY = 'state_recovery_log';

  /**
   * Take a snapshot of current state
   */
  static captureSnapshot(key: string, state: unknown): void {
    try {
      const snapshot: StateSnapshot = {
        timestamp: Date.now(),
        data: typeof state === 'object' ? (state as Record<string, unknown>) : { value: state },
        version: 1,
      };

      const storageKey = `${this.SNAPSHOT_KEY_PREFIX}${key}`;
      localStorage.setItem(storageKey, JSON.stringify(snapshot));
    } catch (error) {
      // Silently handle snapshot capture failure
    }
  }

  /**
   * Restore state from last good snapshot
   */
  static restoreFromSnapshot<T>(key: string, fallback: T): T {
    try {
      const storageKey = `${this.SNAPSHOT_KEY_PREFIX}${key}`;
      const snapshotJson = localStorage.getItem(storageKey);

      if (!snapshotJson) {
        return fallback;
      }

      const snapshot: StateSnapshot = JSON.parse(snapshotJson);
      this.logRecovery(key, 'snapshot_restore', true);
      return snapshot.data as T;
    } catch (error) {
      // Silently handle snapshot restore failure
      this.logRecovery(key, 'snapshot_restore', false, error as Error);
      return fallback;
    }
  }

  /**
   * Validate state against expected schema
   */
  static validateState<T>(state: unknown, validator: (state: unknown) => boolean): state is T {
    try {
      return validator(state);
    } catch (error) {
      // Silently handle validation failure
      return false;
    }
  }

  /**
   * Reset state to default values
   */
  static resetState(key: string, _defaults?: Record<string, unknown>): void {
    try {
      // Clear invalid state
      const storageKey = `${this.SNAPSHOT_KEY_PREFIX}${key}`;
      localStorage.removeItem(storageKey);

      // Log reset
      this.logRecovery(key, 'state_reset', true);

      // Show recovery message
      toast.info(`${key} has been reset to defaults`);
    } catch (error) {
      // Silently handle state reset failure
      this.logRecovery(key, 'state_reset', false, error as Error);
    }
  }

  /**
   * Merge partial state updates safely
   */
  static mergeState<T extends Record<string, unknown>>(
    current: T,
    updates: Partial<T>,
    defaults: T,
  ): T {
    try {
      const merged = { ...current };

      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === undefined) {
          // Reset to default
          merged[key as keyof T] = defaults[key as keyof T];
        } else {
          merged[key as keyof T] = value as T[keyof T];
        }
      }

      return merged;
    } catch (error) {
      // Silently handle state merge failure
      return current;
    }
  }

  /**
   * Get recovery log for debugging
   */
  static getRecoveryLog(): Array<{
    timestamp: number;
    key: string;
    action: string;
    success: boolean;
    error?: string;
  }> {
    try {
      const logJson = localStorage.getItem(this.RECOVERY_LOG_KEY);
      return logJson ? JSON.parse(logJson) : [];
    } catch {
      return [];
    }
  }

  /**
   * Clear recovery log
   */
  static clearRecoveryLog(): void {
    try {
      localStorage.removeItem(this.RECOVERY_LOG_KEY);
    } catch (error) {
      // Silently handle log clear failure
    }
  }

  /**
   * Private: Log recovery actions for debugging
   */
  private static logRecovery(key: string, action: string, success: boolean, error?: Error): void {
    try {
      const log = this.getRecoveryLog();
      log.push({
        timestamp: Date.now(),
        key,
        action,
        success,
        error: error?.message,
      });

      // Keep only last 50 entries
      if (log.length > 50) {
        log.splice(0, log.length - 50);
      }

      localStorage.setItem(this.RECOVERY_LOG_KEY, JSON.stringify(log));
    } catch (error) {
      // Silently handle recovery log failure
    }
  }
}

export default StateRecoveryService;

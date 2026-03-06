/**
 * Screen Watcher API
 *
 * TypeScript bindings for the continuous screen monitoring system.
 * Provides periodic screenshot capture for AGI screen awareness.
 */

import { invoke } from '../lib/tauri-mock';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/**
 * Screen capture data with metadata
 */
export interface ScreenCapture {
  /** Unique ID for this capture */
  id: string;
  /** Timestamp when captured (unix millis) */
  timestamp: number;
  /** Width of the captured image */
  width: number;
  /** Height of the captured image */
  height: number;
  /** Base64-encoded JPEG image data */
  imageBase64: string;
  /** Hash of the image for change detection */
  imageHash: number;
}

/**
 * Screen watcher configuration
 */
export interface ScreenWatcherConfig {
  /** Capture interval in milliseconds (default: 3000) */
  intervalMs?: number;
  /** Enable change detection to skip unchanged frames (default: true) */
  changeDetection?: boolean;
}

/**
 * Screen watcher status
 */
export interface WatcherStatus {
  isRunning: boolean;
  isPaused: boolean;
  screenshotCount: number;
}

/**
 * Start the screen watcher with optional configuration
 *
 * @param config - Optional configuration (defaults: intervalMs=3000, changeDetection=true)
 *
 * @example
 * ```ts
 * // Start with defaults (3 second interval)
 * await startScreenWatcher();
 *
 * // Start with custom interval
 * await startScreenWatcher({ intervalMs: 2000 });
 * ```
 */
export async function startScreenWatcher(config?: ScreenWatcherConfig): Promise<void> {
  return invoke<void>('screen_watcher_start', {
    request: config
      ? {
          intervalMs: config.intervalMs ?? 3000,
          changeDetection: config.changeDetection ?? true,
        }
      : null,
  });
}

/**
 * Stop the screen watcher
 */
export async function stopScreenWatcher(): Promise<void> {
  return invoke<void>('screen_watcher_stop');
}

/**
 * Pause the screen watcher (keeps it running but skips captures)
 */
export async function pauseScreenWatcher(): Promise<void> {
  return invoke<void>('screen_watcher_pause');
}

/**
 * Resume the screen watcher after pausing
 */
export async function resumeScreenWatcher(): Promise<void> {
  return invoke<void>('screen_watcher_resume');
}

/**
 * Get the current status of the screen watcher
 */
export async function getScreenWatcherStatus(): Promise<WatcherStatus> {
  return invoke<WatcherStatus>('screen_watcher_status');
}

/**
 * Get the latest screenshot if available
 */
export async function getLatestScreenshot(): Promise<ScreenCapture | null> {
  return invoke<ScreenCapture | null>('screen_watcher_get_latest');
}

/**
 * Get all recent screenshots from the buffer
 */
export async function getRecentScreenshots(): Promise<ScreenCapture[]> {
  return invoke<ScreenCapture[]>('screen_watcher_get_recent');
}

/**
 * Capture a screenshot immediately (bypasses interval)
 */
export async function captureScreenNow(): Promise<ScreenCapture> {
  return invoke<ScreenCapture>('screen_watcher_capture_now');
}

/**
 * Subscribe to screenshot capture events
 *
 * @param callback - Function to call when a new screenshot is captured
 * @returns Unsubscribe function
 *
 * @example
 * ```ts
 * const unsubscribe = await onScreenCapture((capture) => {
 *   console.log('New screenshot:', capture.id, capture.width, capture.height);
 * });
 *
 * // Later, unsubscribe
 * unsubscribe();
 * ```
 */
export async function onScreenCapture(
  callback: (capture: ScreenCapture) => void,
): Promise<UnlistenFn> {
  return listen<ScreenCapture>('screen-watcher:capture', (event) => {
    callback(event.payload);
  });
}

/**
 * Screen Watcher Client - Convenience class for screen monitoring
 */
export class ScreenWatcherClient {
  private unsubscribe: UnlistenFn | null = null;

  /**
   * Start the screen watcher with optional configuration
   */
  async start(config?: ScreenWatcherConfig): Promise<void> {
    return startScreenWatcher(config);
  }

  /**
   * Stop the screen watcher
   */
  async stop(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    return stopScreenWatcher();
  }

  /**
   * Pause the screen watcher
   */
  async pause(): Promise<void> {
    return pauseScreenWatcher();
  }

  /**
   * Resume the screen watcher
   */
  async resume(): Promise<void> {
    return resumeScreenWatcher();
  }

  /**
   * Get the current status
   */
  async getStatus(): Promise<WatcherStatus> {
    return getScreenWatcherStatus();
  }

  /**
   * Get the latest screenshot
   */
  async getLatest(): Promise<ScreenCapture | null> {
    return getLatestScreenshot();
  }

  /**
   * Get all recent screenshots
   */
  async getRecent(): Promise<ScreenCapture[]> {
    return getRecentScreenshots();
  }

  /**
   * Capture a screenshot immediately
   */
  async captureNow(): Promise<ScreenCapture> {
    return captureScreenNow();
  }

  /**
   * Subscribe to screenshot events
   */
  async subscribe(callback: (capture: ScreenCapture) => void): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this.unsubscribe = await onScreenCapture(callback);
  }

  /**
   * Convert a screen capture to a data URL for display
   */
  static toDataUrl(capture: ScreenCapture): string {
    return `data:image/jpeg;base64,${capture.imageBase64}`;
  }

  /**
   * Get the age of a capture in milliseconds
   */
  static getAge(capture: ScreenCapture): number {
    return Date.now() - capture.timestamp;
  }
}

export default ScreenWatcherClient;

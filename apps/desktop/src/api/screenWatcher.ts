
import { invoke } from '../lib/tauri-mock';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface ScreenCapture {
  id: string;
  timestamp: number;
  width: number;
  height: number;
  imageBase64: string;
  imageHash: number;
}

export interface ScreenWatcherConfig {
  intervalMs?: number;
  changeDetection?: boolean;
}

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

export async function stopScreenWatcher(): Promise<void> {
  return invoke<void>('screen_watcher_stop');
}

export async function pauseScreenWatcher(): Promise<void> {
  return invoke<void>('screen_watcher_pause');
}

export async function resumeScreenWatcher(): Promise<void> {
  return invoke<void>('screen_watcher_resume');
}

export async function getScreenWatcherStatus(): Promise<WatcherStatus> {
  return invoke<WatcherStatus>('screen_watcher_status');
}

export async function getLatestScreenshot(): Promise<ScreenCapture | null> {
  return invoke<ScreenCapture | null>('screen_watcher_get_latest');
}

export async function getRecentScreenshots(): Promise<ScreenCapture[]> {
  return invoke<ScreenCapture[]>('screen_watcher_get_recent');
}

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

export class ScreenWatcherClient {
  private unsubscribe: UnlistenFn | null = null;

  async start(config?: ScreenWatcherConfig): Promise<void> {
    return startScreenWatcher(config);
  }

  async stop(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    return stopScreenWatcher();
  }

  async pause(): Promise<void> {
    return pauseScreenWatcher();
  }

  async resume(): Promise<void> {
    return resumeScreenWatcher();
  }

  async getStatus(): Promise<WatcherStatus> {
    return getScreenWatcherStatus();
  }

  async getLatest(): Promise<ScreenCapture | null> {
    return getLatestScreenshot();
  }

  async getRecent(): Promise<ScreenCapture[]> {
    return getRecentScreenshots();
  }

  async captureNow(): Promise<ScreenCapture> {
    return captureScreenNow();
  }

  async subscribe(callback: (capture: ScreenCapture) => void): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this.unsubscribe = await onScreenCapture(callback);
  }

  static toDataUrl(capture: ScreenCapture): string {
    return `data:image/jpeg;base64,${capture.imageBase64}`;
  }

  static getAge(capture: ScreenCapture): number {
    return Date.now() - capture.timestamp;
  }
}

export default ScreenWatcherClient;

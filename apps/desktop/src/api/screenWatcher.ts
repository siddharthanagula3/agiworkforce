import { invoke } from '../lib/tauri-mock';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  admitVisualFrame,
  idleVisualSessionStatus,
  visualSessionConfig,
  type VisualFrame,
  type VisualSessionConfig,
  type VisualSessionStatus,
} from '@agiworkforce/types';

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

/**
 * The Rust watcher's own hash is a u64 carried as a JS number, so it is folded
 * into the two halves the shared frame hash uses. Dedup stays meaningful: the
 * distance still separates a changed screen from an unchanged one.
 */
export function screenCaptureToFrame(capture: ScreenCapture): VisualFrame {
  const hash = Math.trunc(Math.abs(capture.imageHash));
  return {
    frameId: capture.id,
    capturedAtMs: capture.timestamp,
    width: capture.width,
    height: capture.height,
    hash: [Math.trunc(hash / 0x1_0000_0000) >>> 0, hash >>> 0],
    dataUrl: ScreenWatcherClient.toDataUrl(capture),
  };
}

export function watcherVisualStatus(
  status: WatcherStatus,
  previous: VisualSessionStatus,
): VisualSessionStatus {
  if (!status.isRunning) return { ...previous, state: 'stopped' };
  return { ...previous, state: status.isPaused ? 'paused' : 'active' };
}

/**
 * The Rust watcher as a {@link VisualSession}: the same sampling, dedup and
 * buffer bound every other surface gets, over the capture loop that already
 * runs natively.
 */
export class ScreenWatcherVisualSession {
  private readonly config: VisualSessionConfig;
  private readonly onFrame?: (frame: VisualFrame, buffer: readonly VisualFrame[]) => void;
  private readonly onStatus?: (status: VisualSessionStatus) => void;
  private readonly client = new ScreenWatcherClient();

  private state: VisualSessionStatus = idleVisualSessionStatus('screen');
  private buffer: VisualFrame[] = [];

  constructor(
    options: {
      config?: Partial<Omit<VisualSessionConfig, 'source'>>;
      onFrame?: (frame: VisualFrame, buffer: readonly VisualFrame[]) => void;
      onStatus?: (status: VisualSessionStatus) => void;
    } = {},
  ) {
    this.config = visualSessionConfig('screen', options.config ?? {});
    this.onFrame = options.onFrame;
    this.onStatus = options.onStatus;
  }

  get status(): VisualSessionStatus {
    return this.state;
  }

  get frames(): readonly VisualFrame[] {
    return this.buffer;
  }

  latestFrame(): VisualFrame | null {
    return this.buffer.length > 0 ? (this.buffer[this.buffer.length - 1] ?? null) : null;
  }

  async start(): Promise<void> {
    this.update({ state: 'starting', startedAtMs: Date.now() });
    await this.client.subscribe((capture) => this.admit(screenCaptureToFrame(capture)));
    await this.client.start({
      intervalMs: this.config.intervalMs,
      changeDetection: this.config.changeDetection,
    });
    this.update({ state: 'active' });
  }

  async pause(): Promise<void> {
    await this.client.pause();
    this.update({ state: 'paused' });
  }

  async resume(): Promise<void> {
    await this.client.resume();
    this.update({ state: 'active' });
  }

  async stop(): Promise<void> {
    await this.client.stop();
    this.buffer = [];
    this.update({ state: 'stopped' });
  }

  async refreshStatus(): Promise<VisualSessionStatus> {
    this.state = watcherVisualStatus(await this.client.getStatus(), this.state);
    this.onStatus?.(this.state);
    return this.state;
  }

  private admit(frame: VisualFrame): void {
    const admission = admitVisualFrame(this.buffer, frame, this.config);
    if (!admission.admitted) {
      this.update({ droppedFrames: this.state.droppedFrames + 1 });
      return;
    }
    this.buffer = admission.buffer;
    this.update({
      sampledFrames: this.state.sampledFrames + 1,
      droppedFrames: this.state.droppedFrames + (admission.evicted ? 1 : 0),
      lastFrameAtMs: frame.capturedAtMs,
    });
    this.onFrame?.(frame, this.buffer);
  }

  private update(patch: Partial<VisualSessionStatus>): void {
    this.state = { ...this.state, ...patch };
    this.onStatus?.(this.state);
  }
}

export default ScreenWatcherClient;

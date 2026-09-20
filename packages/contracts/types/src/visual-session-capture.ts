/**
 * The browser driver for the {@link ./visual-session} contract: acquire a live
 * source, sample it on an interval, and admit the frames that earn a place in
 * the bounded buffer.
 *
 * It lives beside the contract rather than in one surface because the web app,
 * the shared chat UI and the desktop shell all need the same sampler, and a
 * second copy of a sampler is a second set of backpressure rules.
 *
 * @module visual-session-capture
 * @packageDocumentation
 */

import {
  admitVisualFrame,
  idleVisualSessionStatus,
  releaseVisualFrames,
  visualFrameHash,
  visualSessionConfig,
  type VisualFrame,
  type VisualFrameRegion,
  type VisualSessionConfig,
  type VisualSessionState,
  type VisualSessionStatus,
  type VisualSourceKind,
} from './visual-session';

export const VISUAL_SOURCE_MESSAGE = {
  denied:
    'Access was blocked. Allow the camera or screen in your system settings to share it live.',
  busy: 'The camera is in use by another app. Close it and try again.',
  unavailable: 'This browser cannot share a live camera or screen.',
  failed: 'The live source could not be started.',
} as const;

export type VisualSourceFailure = Extract<
  VisualSessionState,
  'denied' | 'busy' | 'unavailable' | 'stopped'
>;

export class VisualSourceError extends Error {
  constructor(
    message: string,
    readonly state: VisualSourceFailure,
  ) {
    super(message);
    this.name = 'VisualSourceError';
  }
}

/**
 * A camera already held by another application rejects with a distinct error,
 * and a user who is told "access was blocked" for a busy camera goes looking in
 * the wrong settings panel.
 */
export function visualSourceError(error: unknown): VisualSourceError {
  if (error instanceof VisualSourceError) return error;
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return new VisualSourceError(VISUAL_SOURCE_MESSAGE.denied, 'denied');
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return new VisualSourceError(VISUAL_SOURCE_MESSAGE.busy, 'busy');
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return new VisualSourceError(VISUAL_SOURCE_MESSAGE.unavailable, 'unavailable');
  }
  return new VisualSourceError(VISUAL_SOURCE_MESSAGE.failed, 'stopped');
}

export interface VisualStreamRequest {
  source: VisualSourceKind;
  facingMode?: 'user' | 'environment';
  deviceId?: string;
}

export async function requestVisualStream(request: VisualStreamRequest): Promise<MediaStream> {
  const devices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
  if (!devices) {
    throw new VisualSourceError(VISUAL_SOURCE_MESSAGE.unavailable, 'unavailable');
  }
  try {
    if (request.source === 'camera') {
      if (!devices.getUserMedia) {
        throw new VisualSourceError(VISUAL_SOURCE_MESSAGE.unavailable, 'unavailable');
      }
      return await devices.getUserMedia({
        video: request.deviceId
          ? { deviceId: { exact: request.deviceId } }
          : { facingMode: request.facingMode ?? 'user' },
        audio: false,
      });
    }
    if (!devices.getDisplayMedia) {
      throw new VisualSourceError(VISUAL_SOURCE_MESSAGE.unavailable, 'unavailable');
    }
    return await devices.getDisplayMedia({ video: true, audio: false });
  } catch (error) {
    throw error instanceof VisualSourceError ? error : visualSourceError(error);
  }
}

export interface GrabbedFrame {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  dataUrl: string;
}

export interface VisualFrameGrabber {
  grab(): GrabbedFrame | null;
  dispose(): void;
}

export const VISUAL_FRAME_JPEG_QUALITY = 0.72;
export const MAX_VISUAL_FRAME_EDGE = 1_280;

export function canvasFrameGrabber(
  video: HTMLVideoElement,
  region?: VisualFrameRegion,
): VisualFrameGrabber {
  const canvas = document.createElement('canvas');
  return {
    grab() {
      const sourceWidth = region?.width ?? video.videoWidth;
      const sourceHeight = region?.height ?? video.videoHeight;
      if (sourceWidth <= 0 || sourceHeight <= 0) return null;
      const scale = Math.min(1, MAX_VISUAL_FRAME_EDGE / Math.max(sourceWidth, sourceHeight));
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(
        video,
        region?.x ?? 0,
        region?.y ?? 0,
        sourceWidth,
        sourceHeight,
        0,
        0,
        width,
        height,
      );
      return {
        pixels: context.getImageData(0, 0, width, height).data,
        width,
        height,
        dataUrl: canvas.toDataURL('image/jpeg', VISUAL_FRAME_JPEG_QUALITY),
      };
    },
    dispose() {
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}

/**
 * A sampled frame as a file the composer can attach. Decoded here rather than
 * through `fetch(dataUrl)` so it does not depend on a network stack.
 */
export function visualFrameToFile(frame: VisualFrame, name?: string): File {
  const [header = '', payload = ''] = frame.dataUrl.split(',');
  const type = header.slice(header.indexOf(':') + 1, header.indexOf(';')) || 'image/jpeg';
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const extension = type === 'image/png' ? 'png' : 'jpg';
  return new File([bytes], name ?? `frame-${frame.capturedAtMs}.${extension}`, { type });
}

export interface VisualCaptureCallbacks {
  onStatus?: (status: VisualSessionStatus) => void;
  onFrame?: (frame: VisualFrame, buffer: readonly VisualFrame[]) => void;
}

export interface VisualCaptureOptions extends VisualCaptureCallbacks {
  source: VisualSourceKind;
  config?: Partial<Omit<VisualSessionConfig, 'source'>>;
  facingMode?: 'user' | 'environment';
  deviceId?: string;
  /** Seams the non-browser surfaces and the tests supply; the browser defaults otherwise. */
  requestStream?: (request: VisualStreamRequest) => Promise<MediaStream>;
  createGrabber?: (stream: MediaStream, config: VisualSessionConfig) => Promise<VisualFrameGrabber>;
  now?: () => number;
  frameId?: () => string;
}

/**
 * Started without waiting for metadata: a source that never reports dimensions
 * would otherwise hold the session open forever, and the grabber already
 * declines a frame until the video has a size.
 */
async function attachVideo(stream: MediaStream): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;
  await video.play?.().catch(() => undefined);
  return video;
}

/**
 * A live visual source, sampled.
 *
 * The session is `active` only while a track is live and the timer is running:
 * a user who stops sharing from the browser's own bar, or switches away from
 * the tab, leaves `active` at once, so no surface can paint a recording
 * indicator over a source that has already gone.
 */
export class VisualCaptureSession {
  private readonly config: VisualSessionConfig;
  private readonly callbacks: VisualCaptureCallbacks;
  private readonly now: () => number;
  private readonly nextFrameId: () => string;
  private readonly stream: MediaStream;
  private readonly grabber: VisualFrameGrabber;
  // Only a pause this handler made is undone by it. A pause the user asked for
  // must survive switching away from the tab and back.
  private readonly onVisibilityChange = () => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'hidden') {
      if (this.state.state !== 'active') return;
      this.pause();
      this.hiddenPause = true;
      return;
    }
    if (this.hiddenPause) this.resume();
  };

  private hiddenPause = false;
  private buffer: VisualFrame[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private state: VisualSessionStatus;

  private constructor(
    stream: MediaStream,
    grabber: VisualFrameGrabber,
    config: VisualSessionConfig,
    options: VisualCaptureOptions,
  ) {
    this.stream = stream;
    this.grabber = grabber;
    this.config = config;
    this.callbacks = { onStatus: options.onStatus, onFrame: options.onFrame };
    this.now = options.now ?? (() => Date.now());
    this.nextFrameId =
      options.frameId ??
      (() =>
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `frame-${this.now()}-${this.state.sampledFrames}`);
    this.state = idleVisualSessionStatus(config.source);
  }

  static async start(options: VisualCaptureOptions): Promise<VisualCaptureSession> {
    const config = visualSessionConfig(options.source, options.config ?? {});
    const request = options.requestStream ?? requestVisualStream;
    const stream = await request({
      source: options.source,
      ...(options.facingMode ? { facingMode: options.facingMode } : {}),
      ...(options.deviceId ? { deviceId: options.deviceId } : {}),
    });

    let grabber: VisualFrameGrabber;
    try {
      grabber = options.createGrabber
        ? await options.createGrabber(stream, config)
        : canvasFrameGrabber(await attachVideo(stream), config.region);
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      throw error instanceof VisualSourceError ? error : visualSourceError(error);
    }

    const session = new VisualCaptureSession(stream, grabber, config, options);
    session.begin();
    return session;
  }

  get status(): VisualSessionStatus {
    return this.state;
  }

  /** The live source, for a preview. A surface renders it; it never re-encodes it. */
  get mediaStream(): MediaStream {
    return this.stream;
  }

  get frames(): readonly VisualFrame[] {
    return this.buffer;
  }

  latestFrame(): VisualFrame | null {
    return this.buffer.length > 0 ? (this.buffer[this.buffer.length - 1] ?? null) : null;
  }

  pause(): void {
    if (this.state.state !== 'active') return;
    this.clearTimer();
    this.stream.getVideoTracks().forEach((track) => {
      track.enabled = false;
    });
    this.update({ state: 'paused' });
  }

  resume(): void {
    if (this.state.state !== 'paused') return;
    this.hiddenPause = false;
    this.stream.getVideoTracks().forEach((track) => {
      track.enabled = true;
    });
    this.update({ state: 'active' });
    this.startTimer();
  }

  stop(reason: VisualSourceFailure = 'stopped', error: string | null = null): void {
    if (this.state.state === 'stopped' || this.state.state === 'denied') return;
    this.clearTimer();
    this.stream.getTracks().forEach((track) => track.stop());
    this.grabber.dispose();
    this.buffer = releaseVisualFrames(this.buffer);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    this.update({ state: reason, error });
  }

  private begin(): void {
    this.update({ state: 'active', startedAtMs: this.now() });
    this.stream.getVideoTracks().forEach((track) => {
      track.addEventListener('ended', () => this.stop('stopped'));
    });
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    this.startTimer();
  }

  private startTimer(): void {
    this.clearTimer();
    this.timer = setInterval(() => this.sample(), this.config.intervalMs);
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  sample(): VisualFrame | null {
    if (this.state.state !== 'active') return null;
    if (this.stream.getVideoTracks().every((track) => track.readyState === 'ended')) {
      this.stop('stopped');
      return null;
    }

    const grabbed = this.grabber.grab();
    if (!grabbed) return null;

    const frame: VisualFrame = {
      frameId: this.nextFrameId(),
      capturedAtMs: this.now(),
      width: grabbed.width,
      height: grabbed.height,
      hash: visualFrameHash(grabbed.pixels, grabbed.width, grabbed.height),
      dataUrl: grabbed.dataUrl,
      ...(this.config.region ? { region: this.config.region } : {}),
    };

    const admission = admitVisualFrame(this.buffer, frame, this.config);
    if (!admission.admitted) {
      this.update({ droppedFrames: this.state.droppedFrames + 1 });
      return null;
    }
    this.buffer = admission.buffer;
    this.update({
      sampledFrames: this.state.sampledFrames + 1,
      droppedFrames: this.state.droppedFrames + (admission.evicted ? 1 : 0),
      lastFrameAtMs: frame.capturedAtMs,
    });
    this.callbacks.onFrame?.(frame, this.buffer);
    return frame;
  }

  private update(patch: Partial<VisualSessionStatus>): void {
    this.state = { ...this.state, ...patch };
    this.callbacks.onStatus?.(this.state);
  }
}

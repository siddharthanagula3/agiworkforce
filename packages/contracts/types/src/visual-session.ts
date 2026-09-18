/**
 * Shared contract for a live visual session: a bounded stream of sampled frames
 * from a camera, a screen or a single window, on any surface.
 *
 * A live source produces far more frames than any model should be shown, so the
 * contract is a sampler, not a pipe: the session samples on an interval, drops
 * frames the scene has not changed enough to justify, keeps only a bounded
 * ring of the most recent ones, and never persists or logs the pixels.
 *
 * @module visual-session
 * @packageDocumentation
 */

export const VISUAL_SOURCE_KINDS = ['camera', 'screen', 'window'] as const;

export type VisualSourceKind = (typeof VISUAL_SOURCE_KINDS)[number];

/**
 * `active` is the only state in which a source is attached and sampling. Every
 * other state means no frame is being produced, so a surface that paints a
 * recording indicator paints it from this value and from nothing else.
 */
export const VISUAL_SESSION_STATES = [
  'idle',
  'starting',
  'active',
  'paused',
  'stopped',
  'denied',
  'busy',
  'unavailable',
] as const;

export type VisualSessionState = (typeof VISUAL_SESSION_STATES)[number];

export interface VisualFrameRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A 64-bit perceptual hash as `[high32, low32]`. */
export type VisualFrameHash = readonly [number, number];

export interface VisualFrame {
  frameId: string;
  capturedAtMs: number;
  width: number;
  height: number;
  /** Perceptual hash used for change detection and dedup. */
  hash: VisualFrameHash;
  /** The encoded frame. Held in memory for the life of the buffer slot only. */
  dataUrl: string;
  region?: VisualFrameRegion;
}

export interface VisualSessionConfig {
  source: VisualSourceKind;
  intervalMs: number;
  maxBufferedFrames: number;
  changeDetection: boolean;
  /** Hamming distance over the frame hash below which a frame is a duplicate. */
  changeThreshold: number;
  region?: VisualFrameRegion;
}

export interface VisualSessionStatus {
  state: VisualSessionState;
  source: VisualSourceKind;
  /** Frames admitted into the buffer since the session started. */
  sampledFrames: number;
  /** Frames sampled and discarded as unchanged or over the buffer bound. */
  droppedFrames: number;
  startedAtMs: number | null;
  lastFrameAtMs: number | null;
  error: string | null;
}

/** What a frame may contribute to a log or a metric: never its pixels. */
export interface VisualFrameTelemetry {
  frameId: string;
  capturedAtMs: number;
  width: number;
  height: number;
  hash: string;
  cropped: boolean;
}

export const VISUAL_FRAME_HASH_BITS = 64;
export const MAX_VISUAL_BUFFERED_FRAMES = 8;
export const MIN_VISUAL_SAMPLE_INTERVAL_MS = 250;

export const DEFAULT_VISUAL_SESSION_CONFIG: Readonly<
  Record<VisualSourceKind, VisualSessionConfig>
> = {
  camera: {
    source: 'camera',
    intervalMs: 1_000,
    maxBufferedFrames: MAX_VISUAL_BUFFERED_FRAMES,
    changeDetection: true,
    changeThreshold: 6,
  },
  screen: {
    source: 'screen',
    intervalMs: 3_000,
    maxBufferedFrames: MAX_VISUAL_BUFFERED_FRAMES,
    changeDetection: true,
    changeThreshold: 4,
  },
  window: {
    source: 'window',
    intervalMs: 3_000,
    maxBufferedFrames: MAX_VISUAL_BUFFERED_FRAMES,
    changeDetection: true,
    changeThreshold: 4,
  },
};

export function visualSessionConfig(
  source: VisualSourceKind,
  overrides: Partial<Omit<VisualSessionConfig, 'source'>> = {},
): VisualSessionConfig {
  const base = DEFAULT_VISUAL_SESSION_CONFIG[source];
  const merged: VisualSessionConfig = { ...base, ...overrides, source };
  return {
    ...merged,
    intervalMs: Math.max(MIN_VISUAL_SAMPLE_INTERVAL_MS, Math.trunc(merged.intervalMs)),
    maxBufferedFrames: Math.min(
      MAX_VISUAL_BUFFERED_FRAMES,
      Math.max(1, Math.trunc(merged.maxBufferedFrames)),
    ),
    changeThreshold: Math.max(0, Math.trunc(merged.changeThreshold)),
  };
}

export function idleVisualSessionStatus(source: VisualSourceKind): VisualSessionStatus {
  return {
    state: 'idle',
    source,
    sampledFrames: 0,
    droppedFrames: 0,
    startedAtMs: null,
    lastFrameAtMs: null,
    error: null,
  };
}

/**
 * A 64-bit average hash over an 8×8 luma reduction of the frame, carried as two
 * 32-bit halves because the web app compiles this package below ES2020, where a
 * bigint literal will not parse.
 *
 * `pixels` is RGBA in row-major order, as `getImageData` returns it, at any
 * size: the reduction samples it, so a caller never has to scale first.
 */
export function visualFrameHash(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): VisualFrameHash {
  if (width <= 0 || height <= 0 || pixels.length < width * height * 4) return [0, 0];

  const cells = new Float64Array(VISUAL_FRAME_HASH_BITS);
  const counts = new Uint32Array(VISUAL_FRAME_HASH_BITS);
  for (let y = 0; y < height; y += 1) {
    const row = Math.min(7, Math.trunc((y * 8) / height));
    for (let x = 0; x < width; x += 1) {
      const column = Math.min(7, Math.trunc((x * 8) / width));
      const offset = (y * width + x) * 4;
      const luma =
        0.299 * pixels[offset]! + 0.587 * pixels[offset + 1]! + 0.114 * pixels[offset + 2]!;
      const cell = row * 8 + column;
      cells[cell]! += luma;
      counts[cell]! += 1;
    }
  }

  let total = 0;
  for (let cell = 0; cell < VISUAL_FRAME_HASH_BITS; cell += 1) {
    if (counts[cell]! > 0) cells[cell]! /= counts[cell]!;
    total += cells[cell]!;
  }
  const mean = total / VISUAL_FRAME_HASH_BITS;

  let low = 0;
  let high = 0;
  for (let cell = 0; cell < VISUAL_FRAME_HASH_BITS; cell += 1) {
    if (cells[cell]! <= mean) continue;
    if (cell < 32) low |= 1 << cell;
    else high |= 1 << (cell - 32);
  }
  return [high >>> 0, low >>> 0];
}

function popcount(value: number): number {
  let bits = value >>> 0;
  let count = 0;
  while (bits !== 0) {
    count += bits & 1;
    bits >>>= 1;
  }
  return count;
}

export function visualFrameDistance(left: VisualFrameHash, right: VisualFrameHash): number {
  return popcount(left[0] ^ right[0]) + popcount(left[1] ^ right[1]);
}

export function visualFrameHashHex(hash: VisualFrameHash): string {
  return `${hash[0].toString(16).padStart(8, '0')}${hash[1].toString(16).padStart(8, '0')}`;
}

export type VisualFrameAdmission = 'first' | 'changed' | 'unchanged' | 'evicted';

export interface VisualFrameAdmissionResult {
  admitted: boolean;
  reason: VisualFrameAdmission;
  /** The new buffer, oldest first. Never the array that was passed in. */
  buffer: VisualFrame[];
  /** The frame the buffer bound pushed out, so the caller can release it. */
  evicted: VisualFrame | null;
}

/**
 * The one place a frame is allowed into a session's buffer.
 *
 * Change detection is what keeps a still scene from being sent over and over,
 * and the buffer bound is the backpressure: a consumer that falls behind loses
 * the oldest frames rather than growing a queue of raw pixels without limit.
 */
export function admitVisualFrame(
  buffer: readonly VisualFrame[],
  frame: VisualFrame,
  config: VisualSessionConfig,
): VisualFrameAdmissionResult {
  const previous = buffer.length > 0 ? buffer[buffer.length - 1] : undefined;
  if (
    previous &&
    config.changeDetection &&
    visualFrameDistance(previous.hash, frame.hash) <= config.changeThreshold
  ) {
    return { admitted: false, reason: 'unchanged', buffer: [...buffer], evicted: null };
  }

  const next = [...buffer, frame];
  let evicted: VisualFrame | null = null;
  while (next.length > config.maxBufferedFrames) {
    evicted = next.shift() ?? null;
  }
  return {
    admitted: true,
    reason: evicted ? 'evicted' : previous ? 'changed' : 'first',
    buffer: next,
    evicted,
  };
}

/** True only while a source is attached and producing frames. */
export function visualSessionIsCapturing(status: VisualSessionStatus): boolean {
  return status.state === 'active';
}

export function visualSessionIsLive(status: VisualSessionStatus): boolean {
  return status.state === 'active' || status.state === 'starting' || status.state === 'paused';
}

export function toVisualFrameTelemetry(frame: VisualFrame): VisualFrameTelemetry {
  return {
    frameId: frame.frameId,
    capturedAtMs: frame.capturedAtMs,
    width: frame.width,
    height: frame.height,
    hash: visualFrameHashHex(frame.hash),
    cropped: frame.region !== undefined,
  };
}

/**
 * Release a buffer's frames. The encoded pixels are dropped on the floor when a
 * session ends: nothing in this contract writes them anywhere they outlive it.
 */
export function releaseVisualFrames(buffer: readonly VisualFrame[]): VisualFrame[] {
  const revoke = typeof URL !== 'undefined' ? URL.revokeObjectURL : undefined;
  for (const frame of buffer) {
    if (revoke && frame.dataUrl.startsWith('blob:')) revoke(frame.dataUrl);
  }
  return [];
}

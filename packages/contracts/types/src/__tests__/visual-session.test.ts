import { describe, expect, it } from 'vitest';

import {
  admitVisualFrame,
  DEFAULT_VISUAL_SESSION_CONFIG,
  idleVisualSessionStatus,
  MAX_VISUAL_BUFFERED_FRAMES,
  MIN_VISUAL_SAMPLE_INTERVAL_MS,
  releaseVisualFrames,
  toVisualFrameTelemetry,
  visualFrameDistance,
  visualFrameHash,
  visualFrameHashHex,
  visualSessionConfig,
  visualSessionIsCapturing,
  visualSessionIsLive,
  VISUAL_SESSION_STATES,
  type VisualFrame,
  type VisualFrameHash,
} from '../visual-session';

function rgba(width: number, height: number, paint: (x: number, y: number) => number) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = paint(x, y);
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

function frame(overrides: Partial<VisualFrame> = {}): VisualFrame {
  return {
    frameId: 'frame-1',
    capturedAtMs: 1_000,
    width: 16,
    height: 16,
    hash: [0, 0],
    dataUrl: 'data:image/jpeg;base64,AAAA',
    ...overrides,
  };
}

describe('visualFrameHash', () => {
  it('gives the same hash to two renderings of the same scene', () => {
    const pixels = rgba(32, 32, (x, y) => (x + y < 32 ? 20 : 220));
    expect(visualFrameHash(pixels, 32, 32)).toEqual(visualFrameHash(pixels.slice(), 32, 32));
  });

  it('separates a changed scene from an unchanged one by distance', () => {
    const still = visualFrameHash(
      rgba(32, 32, (x, y) => (x + y < 32 ? 20 : 220)),
      32,
      32,
    );
    const nudged = visualFrameHash(
      rgba(32, 32, (x, y) => (x + y < 33 ? 20 : 220)),
      32,
      32,
    );
    const different = visualFrameHash(
      rgba(32, 32, (x, y) => (x % 8 < 4 ? 240 : 10) + (y % 2)),
      32,
      32,
    );

    expect(visualFrameDistance(still, nudged)).toBeLessThanOrEqual(
      DEFAULT_VISUAL_SESSION_CONFIG.camera.changeThreshold,
    );
    expect(visualFrameDistance(still, different)).toBeGreaterThan(
      DEFAULT_VISUAL_SESSION_CONFIG.camera.changeThreshold,
    );
  });

  it('refuses a buffer that does not hold the frame it claims', () => {
    expect(visualFrameHash(new Uint8ClampedArray(4), 32, 32)).toEqual([0, 0]);
    expect(visualFrameHash(new Uint8ClampedArray(0), 0, 0)).toEqual([0, 0]);
  });

  it('renders a hash as fixed-width hex for logs', () => {
    expect(visualFrameHashHex([0x0f, 0xff] as VisualFrameHash)).toBe('0000000f000000ff');
  });
});

describe('visualSessionConfig', () => {
  it('floors the sample interval so no surface can stream every frame', () => {
    expect(visualSessionConfig('camera', { intervalMs: 1 }).intervalMs).toBe(
      MIN_VISUAL_SAMPLE_INTERVAL_MS,
    );
  });

  it('caps the buffer so a stalled consumer cannot grow it without limit', () => {
    expect(visualSessionConfig('screen', { maxBufferedFrames: 500 }).maxBufferedFrames).toBe(
      MAX_VISUAL_BUFFERED_FRAMES,
    );
    expect(visualSessionConfig('screen', { maxBufferedFrames: 0 }).maxBufferedFrames).toBe(1);
  });

  it('keeps the source it was asked for', () => {
    expect(visualSessionConfig('window', { intervalMs: 5_000 })).toMatchObject({
      source: 'window',
      intervalMs: 5_000,
    });
  });
});

describe('admitVisualFrame', () => {
  const config = visualSessionConfig('camera', { maxBufferedFrames: 3 });

  it('admits the first frame', () => {
    const result = admitVisualFrame([], frame({ hash: [1, 1] }), config);
    expect(result).toMatchObject({ admitted: true, reason: 'first', evicted: null });
    expect(result.buffer).toHaveLength(1);
  });

  it('drops a frame the scene has not changed enough to justify', () => {
    const buffer = [frame({ hash: [0, 0b1111] })];
    const result = admitVisualFrame(buffer, frame({ frameId: 'f2', hash: [0, 0b1110] }), config);

    expect(result).toMatchObject({ admitted: false, reason: 'unchanged' });
    expect(result.buffer).toEqual(buffer);
    expect(result.buffer).not.toBe(buffer);
  });

  it('admits every frame when change detection is off', () => {
    const off = visualSessionConfig('camera', { changeDetection: false });
    const buffer = [frame({ hash: [0, 1] })];
    expect(admitVisualFrame(buffer, frame({ frameId: 'f2', hash: [0, 1] }), off).admitted).toBe(
      true,
    );
  });

  it('evicts the oldest frame once the buffer is full', () => {
    let buffer: VisualFrame[] = [];
    for (let index = 0; index < 5; index += 1) {
      const result = admitVisualFrame(
        buffer,
        frame({ frameId: `f${index}`, hash: [index, index * 977] }),
        config,
      );
      buffer = result.buffer;
    }

    expect(buffer.map((item) => item.frameId)).toEqual(['f2', 'f3', 'f4']);
    const overflow = admitVisualFrame(buffer, frame({ frameId: 'f5', hash: [99, 12_345] }), config);
    expect(overflow).toMatchObject({ admitted: true, reason: 'evicted' });
    expect(overflow.evicted?.frameId).toBe('f2');
  });
});

describe('session state', () => {
  it('starts idle with no frames and no source attached', () => {
    const status = idleVisualSessionStatus('camera');
    expect(status).toMatchObject({ state: 'idle', sampledFrames: 0, startedAtMs: null });
    expect(visualSessionIsCapturing(status)).toBe(false);
  });

  it('reports capture only in the one state that attaches a source', () => {
    for (const state of VISUAL_SESSION_STATES) {
      expect(visualSessionIsCapturing({ ...idleVisualSessionStatus('camera'), state })).toBe(
        state === 'active',
      );
    }
  });

  it('counts a paused or starting session as live but not capturing', () => {
    for (const state of ['starting', 'paused'] as const) {
      const status = { ...idleVisualSessionStatus('screen'), state };
      expect(visualSessionIsLive(status)).toBe(true);
      expect(visualSessionIsCapturing(status)).toBe(false);
    }
    for (const state of ['stopped', 'denied', 'busy', 'unavailable', 'idle'] as const) {
      expect(visualSessionIsLive({ ...idleVisualSessionStatus('screen'), state })).toBe(false);
    }
  });
});

describe('frame telemetry', () => {
  it('carries no pixels', () => {
    const telemetry = toVisualFrameTelemetry(
      frame({ hash: [0xabc, 0xdef], dataUrl: 'data:image/jpeg;base64,SECRETPIXELS' }),
    );

    expect(JSON.stringify(telemetry)).not.toContain('SECRETPIXELS');
    expect(JSON.stringify(telemetry)).not.toContain('base64');
    expect(Object.keys(telemetry).sort()).toEqual([
      'capturedAtMs',
      'cropped',
      'frameId',
      'hash',
      'height',
      'width',
    ]);
  });

  it('marks a cropped frame without naming the region contents', () => {
    expect(toVisualFrameTelemetry(frame()).cropped).toBe(false);
    expect(
      toVisualFrameTelemetry(frame({ region: { x: 0, y: 0, width: 10, height: 10 } })).cropped,
    ).toBe(true);
  });
});

describe('releaseVisualFrames', () => {
  it('empties the buffer so raw frames do not outlive the session', () => {
    expect(releaseVisualFrames([frame(), frame({ frameId: 'f2' })])).toEqual([]);
  });
});

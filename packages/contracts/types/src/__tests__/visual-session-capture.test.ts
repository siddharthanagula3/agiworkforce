// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  requestVisualStream,
  VisualCaptureSession,
  VisualSourceError,
  VISUAL_SOURCE_MESSAGE,
  type GrabbedFrame,
  type VisualFrameGrabber,
} from '../visual-session-capture';
import { visualSessionIsCapturing } from '../visual-session';

class FakeTrack extends EventTarget {
  kind = 'video';
  readyState: 'live' | 'ended' = 'live';
  enabled = true;
  stop = vi.fn(() => {
    this.readyState = 'ended';
  });
}

function fakeStream(track = new FakeTrack()) {
  return {
    track,
    stream: {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream,
  };
}

function solidFrame(value: number, size = 8): GrabbedFrame {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let index = 0; index < size * size; index += 1) {
    const offset = index * 4;
    const shade = index % 2 === 0 ? value : 255 - value;
    pixels[offset] = shade;
    pixels[offset + 1] = shade;
    pixels[offset + 2] = shade;
    pixels[offset + 3] = 255;
  }
  return { pixels, width: size, height: size, dataUrl: `data:image/jpeg;base64,${value}` };
}

function grabberOf(frames: GrabbedFrame[]): VisualFrameGrabber & { disposed: boolean } {
  let index = 0;
  const grabber = {
    disposed: false,
    grab: () => frames[Math.min(index++, frames.length - 1)] ?? null,
    dispose() {
      grabber.disposed = true;
    },
  };
  return grabber;
}

async function startSession(
  frames: GrabbedFrame[],
  overrides: Partial<Parameters<typeof VisualCaptureSession.start>[0]> = {},
) {
  const { stream, track } = fakeStream();
  const grabber = grabberOf(frames);
  let clock = 1_000;
  let id = 0;
  const statuses: string[] = [];
  const captured: string[] = [];
  const session = await VisualCaptureSession.start({
    source: 'camera',
    requestStream: async () => stream,
    createGrabber: async () => grabber,
    now: () => (clock += 10),
    frameId: () => `frame-${(id += 1)}`,
    onStatus: (status) => statuses.push(status.state),
    onFrame: (frame) => captured.push(frame.frameId),
    ...overrides,
  });
  return { session, grabber, track, statuses, captured };
}

describe('requestVisualStream', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports an unavailable source when the browser has no media devices', async () => {
    vi.stubGlobal('navigator', {});
    await expect(requestVisualStream({ source: 'camera' })).rejects.toMatchObject({
      state: 'unavailable',
      message: VISUAL_SOURCE_MESSAGE.unavailable,
    });
  });

  it('separates a camera already in use from a camera the user blocked', async () => {
    const busy = Object.assign(new Error('in use'), { name: 'NotReadableError' });
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => {
          throw busy;
        }),
      },
    });
    await expect(requestVisualStream({ source: 'camera' })).rejects.toMatchObject({
      state: 'busy',
      message: VISUAL_SOURCE_MESSAGE.busy,
    });

    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => {
          throw denied;
        }),
      },
    });
    await expect(requestVisualStream({ source: 'camera' })).rejects.toMatchObject({
      state: 'denied',
    });
  });

  it('asks for the display when the source is a screen', async () => {
    const getDisplayMedia = vi.fn(async () => fakeStream().stream);
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia } });
    await requestVisualStream({ source: 'screen' });
    expect(getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: false });
  });

  it('asks the named camera for the facing mode it was given', async () => {
    const getUserMedia = vi.fn(async () => fakeStream().stream);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    await requestVisualStream({ source: 'camera', facingMode: 'environment' });
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'environment' },
      audio: false,
    });
  });
});

describe('VisualCaptureSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('samples on the interval instead of forwarding every frame', async () => {
    const { session, captured } = await startSession([
      solidFrame(10),
      solidFrame(200),
      solidFrame(40),
    ]);

    expect(session.status.state).toBe('active');
    expect(captured).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(captured).toEqual(['frame-1', 'frame-2']);
    session.stop();
  });

  it('drops a frame the scene has not changed enough to justify', async () => {
    const still = solidFrame(30);
    const { session } = await startSession([still, still, still]);

    await vi.advanceTimersByTimeAsync(3_000);
    expect(session.status.sampledFrames).toBe(1);
    expect(session.status.droppedFrames).toBeGreaterThanOrEqual(2);
    expect(session.frames).toHaveLength(1);
    session.stop();
  });

  it('keeps the buffer bounded when the consumer never drains it', async () => {
    const frames = Array.from({ length: 12 }, (_, index) => solidFrame(index * 17 + 5));
    const { session } = await startSession(frames, { config: { maxBufferedFrames: 3 } });

    await vi.advanceTimersByTimeAsync(12_000);
    expect(session.frames.length).toBeLessThanOrEqual(3);
    session.stop();
  });

  it('leaves the active state the moment the user stops sharing', async () => {
    const { session, track, statuses } = await startSession([solidFrame(10), solidFrame(220)]);

    track.readyState = 'ended';
    track.dispatchEvent(new Event('ended'));

    expect(session.status.state).toBe('stopped');
    expect(visualSessionIsCapturing(session.status)).toBe(false);
    expect(statuses[statuses.length - 1]).toBe('stopped');

    await vi.advanceTimersByTimeAsync(5_000);
    expect(session.status.sampledFrames).toBe(0);
  });

  it('pauses the source when the page is hidden and resumes when it returns', async () => {
    const { session, track } = await startSession([
      solidFrame(10),
      solidFrame(220),
      solidFrame(60),
    ]);

    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(session.status.state).toBe('paused');
    expect(track.enabled).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(session.status.sampledFrames).toBe(0);

    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(session.status.state).toBe('active');
    expect(track.enabled).toBe(true);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(session.status.sampledFrames).toBe(1);

    visibility.mockRestore();
    session.stop();
  });

  it('stops the tracks and releases the frames when it ends', async () => {
    const { session, grabber, track } = await startSession([solidFrame(10), solidFrame(220)]);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(session.frames).toHaveLength(1);

    session.stop();
    expect(track.stop).toHaveBeenCalled();
    expect(grabber.disposed).toBe(true);
    expect(session.frames).toEqual([]);
    expect(session.status.state).toBe('stopped');

    await vi.advanceTimersByTimeAsync(5_000);
    expect(session.status.sampledFrames).toBe(1);
  });

  it('stops the stream when the grabber cannot be built', async () => {
    const { stream, track } = fakeStream();
    await expect(
      VisualCaptureSession.start({
        source: 'screen',
        requestStream: async () => stream,
        createGrabber: async () => {
          throw Object.assign(new Error('no canvas'), { name: 'NotSupportedError' });
        },
      }),
    ).rejects.toBeInstanceOf(VisualSourceError);
    expect(track.stop).toHaveBeenCalled();
  });
});

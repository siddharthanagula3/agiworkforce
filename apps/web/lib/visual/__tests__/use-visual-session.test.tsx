import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useVisualSession } from '../use-visual-session';
import type { GrabbedFrame, VisualFrameGrabber } from '@agiworkforce/types';

const stopTrack = vi.fn();

function fakeStream() {
  const track = {
    kind: 'video',
    readyState: 'live' as const,
    enabled: true,
    stop: stopTrack,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
}

function grabber(shade: () => number): VisualFrameGrabber {
  return {
    grab(): GrabbedFrame {
      const size = 8;
      const pixels = new Uint8ClampedArray(size * size * 4);
      const value = shade();
      for (let index = 0; index < size * size; index += 1) {
        const offset = index * 4;
        const pixel = index % size < size / 2 ? value : 255 - value;
        pixels[offset] = pixel;
        pixels[offset + 1] = pixel;
        pixels[offset + 2] = pixel;
        pixels[offset + 3] = 255;
      }
      return { pixels, width: size, height: size, dataUrl: `data:image/jpeg;base64,${value}` };
    },
    dispose: vi.fn(),
  };
}

function captureSeam(shade: () => number) {
  return {
    requestStream: vi.fn(async () => fakeStream()),
    createGrabber: vi.fn(async () => grabber(shade)),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  stopTrack.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useVisualSession', () => {
  it('holds no source until it is started', async () => {
    const capture = captureSeam(() => 10);
    const { result } = renderHook(() => useVisualSession({ source: 'camera', capture }));

    expect(result.current.status.state).toBe('idle');
    expect(result.current.capturing).toBe(false);
    expect(capture.requestStream).not.toHaveBeenCalled();
  });

  it('samples into a bounded buffer and reports each kept frame once', async () => {
    let shade = 10;
    const onFrame = vi.fn();
    const capture = captureSeam(() => shade);
    const { result } = renderHook(() =>
      useVisualSession({ source: 'camera', onFrame, capture: { ...capture } }),
    );

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.capturing).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(onFrame).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(onFrame).toHaveBeenCalledTimes(1);

    shade = 250;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(onFrame).toHaveBeenCalledTimes(2);
    expect(result.current.frames).toHaveLength(2);
    expect(result.current.latestFrame?.frameId).toBe(onFrame.mock.calls[1]?.[0].frameId);
  });

  it('ends the stream when the voice call it rides with ends', async () => {
    const capture = captureSeam(() => 10);
    const { result, rerender } = renderHook(
      ({ voiceActive }: { voiceActive: boolean }) =>
        useVisualSession({ source: 'camera', voiceActive, capture }),
      { initialProps: { voiceActive: true } },
    );

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.capturing).toBe(true);

    await act(async () => {
      rerender({ voiceActive: false });
    });

    expect(stopTrack).toHaveBeenCalled();
    expect(result.current.capturing).toBe(false);
    expect(result.current.frames).toEqual([]);
  });

  it('stops the source when the surface unmounts', async () => {
    const capture = captureSeam(() => 10);
    const { result, unmount } = renderHook(() => useVisualSession({ source: 'screen', capture }));

    await act(async () => {
      await result.current.start();
    });
    unmount();

    expect(stopTrack).toHaveBeenCalled();
  });

  it('surfaces a refused source as a state, not a throw', async () => {
    const { result } = renderHook(() =>
      useVisualSession({
        source: 'camera',
        capture: {
          requestStream: async () => {
            throw Object.assign(new Error('nope'), { name: 'NotAllowedError' });
          },
        },
      }),
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status.state).toBe('denied');
    expect(result.current.status.error).toMatch(/blocked/i);
    expect(result.current.capturing).toBe(false);
  });
});

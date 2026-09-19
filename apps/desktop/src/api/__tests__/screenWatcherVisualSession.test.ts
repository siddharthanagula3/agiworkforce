import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
const listeners: Array<(payload: unknown) => void> = [];
const unlisten = vi.fn();

vi.mock('../../lib/tauri-mock', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_event: string, handler: (event: { payload: unknown }) => void) => {
    listeners.push((payload) => handler({ payload }));
    return unlisten;
  }),
}));

const { ScreenWatcherVisualSession, screenCaptureToFrame, watcherVisualStatus } =
  await import('../screenWatcher');
const { idleVisualSessionStatus, visualSessionIsCapturing } = await import('@agiworkforce/types');

function capture(id: string, hash: number, timestamp = 1_000) {
  return { id, timestamp, width: 1_280, height: 800, imageBase64: 'AAAA', imageHash: hash };
}

function emit(payload: unknown) {
  listeners.forEach((listener) => listener(payload));
}

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
  listeners.length = 0;
  unlisten.mockClear();
});

describe('screenCaptureToFrame', () => {
  it('carries the native capture into the shared frame shape', () => {
    const frame = screenCaptureToFrame(capture('cap-1', 0xdead_beef));

    expect(frame).toMatchObject({ frameId: 'cap-1', width: 1_280, height: 800 });
    expect(frame.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(frame.hash).toEqual([0, 0xdead_beef]);
  });
});

describe('watcherVisualStatus', () => {
  it('never reports capture while the native watcher is stopped or paused', () => {
    const idle = idleVisualSessionStatus('screen');

    expect(
      visualSessionIsCapturing(
        watcherVisualStatus({ isRunning: false, isPaused: false, screenshotCount: 4 }, idle),
      ),
    ).toBe(false);
    expect(
      visualSessionIsCapturing(
        watcherVisualStatus({ isRunning: true, isPaused: true, screenshotCount: 4 }, idle),
      ),
    ).toBe(false);
    expect(
      visualSessionIsCapturing(
        watcherVisualStatus({ isRunning: true, isPaused: false, screenshotCount: 4 }, idle),
      ),
    ).toBe(true);
  });
});

describe('ScreenWatcherVisualSession', () => {
  it('starts the native watcher with the shared sampling configuration', async () => {
    const session = new ScreenWatcherVisualSession({ config: { intervalMs: 5_000 } });
    await session.start();

    expect(invoke).toHaveBeenCalledWith('screen_watcher_start', {
      request: { intervalMs: 5_000, changeDetection: true },
    });
    expect(session.status.state).toBe('active');
  });

  it('dedupes an unchanged screen and bounds the buffer', async () => {
    const frames: string[] = [];
    const session = new ScreenWatcherVisualSession({
      config: { maxBufferedFrames: 2 },
      onFrame: (frame) => frames.push(frame.frameId),
    });
    await session.start();

    emit(capture('cap-1', 0b1010_1010));
    emit(capture('cap-2', 0b1010_1010));
    emit(capture('cap-3', 0xffff_0000));
    emit(capture('cap-4', 0x0000_ffff));

    expect(frames).toEqual(['cap-1', 'cap-3', 'cap-4']);
    expect(session.status.droppedFrames).toBe(2);
    expect(session.frames.map((frame) => frame.frameId)).toEqual(['cap-3', 'cap-4']);
    expect(session.latestFrame()?.frameId).toBe('cap-4');
  });

  it('drops the buffered frames when it stops', async () => {
    const session = new ScreenWatcherVisualSession();
    await session.start();
    emit(capture('cap-1', 0b1111_0000));
    expect(session.frames).toHaveLength(1);

    await session.stop();

    expect(invoke).toHaveBeenCalledWith('screen_watcher_stop');
    expect(unlisten).toHaveBeenCalled();
    expect(session.frames).toEqual([]);
    expect(visualSessionIsCapturing(session.status)).toBe(false);
  });

  it('reads the native watcher state rather than assuming its own', async () => {
    const session = new ScreenWatcherVisualSession();
    await session.start();
    invoke.mockResolvedValueOnce({ isRunning: true, isPaused: true, screenshotCount: 2 });

    expect((await session.refreshStatus()).state).toBe('paused');
  });
});

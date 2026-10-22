import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SKILL_CAPTURE_CONSENT_REVISION,
  SKILL_CAPTURE_LIMITS,
} from '@agiworkforce/local-runtime-contract';

const electron = vi.hoisted(() => {
  const power = new Map<string, Set<() => void>>();
  return {
    power,
    getSources: vi.fn(),
    powerMonitor: {
      on: vi.fn((event: string, listener: () => void) => {
        const listeners = power.get(event) ?? new Set();
        listeners.add(listener);
        power.set(event, listeners);
      }),
      removeListener: vi.fn((event: string, listener: () => void) => {
        power.get(event)?.delete(listener);
      }),
    },
  };
});

vi.mock('electron', () => ({
  desktopCapturer: { getSources: electron.getSources },
  powerMonitor: electron.powerMonitor,
  screen: {
    getCursorScreenPoint: () => ({ x: 10, y: 10 }),
    getDisplayNearestPoint: () => ({
      id: 7,
      size: { width: 1440, height: 900 },
      scaleFactor: 2,
    }),
  },
}));

const overlay = vi.hoisted(() => ({
  close: vi.fn(),
  open: vi.fn(),
  onStop: null as null | (() => void),
}));
vi.mock('../recorderOverlayWindow', () => ({
  openRecorderOverlay: overlay.open,
}));

const showDevicePrompt = vi.hoisted(() => vi.fn());
vi.mock('../runtime/devicePrompts', () => ({ showDevicePrompt }));

const screenRecording = vi.hoisted(() => ({ status: 'granted' as string }));
vi.mock('../runtime/systemPermissions', () => ({
  systemPermissionStatus: () => screenRecording.status,
}));

const {
  SkillCaptureRefused,
  discardSkillCapture,
  saveSkillCapture,
  skillCaptureStatus,
  startSkillCapture,
  stopSkillCapture,
} = await import('../runtime/skillCapture');

function image(shade: number, empty = false) {
  return {
    isEmpty: () => empty,
    resize: () => ({ toBitmap: () => new Uint8Array(48 * 30 * 4).fill(shade) }),
    getSize: () => ({ width: 1280, height: 800 }),
    toJPEG: () => Buffer.from(`frame-${shade}`),
  };
}

function screenShows(...shades: number[]) {
  for (const shade of shades) {
    electron.getSources.mockResolvedValueOnce([{ display_id: '7', thumbnail: image(shade) }]);
  }
}

function appWindow(id: number) {
  const events = new EventEmitter();
  let destroyed = false;
  return {
    webContents: { id },
    isDestroyed: () => destroyed,
    isMinimized: () => false,
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    once: (event: string, listener: () => void) => events.once(event, listener),
    removeListener: (event: string, listener: () => void) => events.removeListener(event, listener),
    close() {
      destroyed = true;
      events.emit('closed');
    },
  };
}

type TestWindow = ReturnType<typeof appWindow>;
const start = (win: TestWindow | null, revision: unknown = SKILL_CAPTURE_CONSENT_REVISION) =>
  startSkillCapture(win as never, revision);

async function nextSample(): Promise<void> {
  await vi.advanceTimersByTimeAsync(SKILL_CAPTURE_LIMITS.frameIntervalMs);
}

beforeEach(() => {
  vi.useFakeTimers();
  screenRecording.status = 'granted';
  showDevicePrompt.mockResolvedValue({ response: 1, checkboxChecked: false });
  electron.getSources.mockReset();
  overlay.close.mockReset();
  overlay.open.mockReset();
  overlay.open.mockImplementation((options: { onStop: () => void }) => {
    overlay.onStop = options.onStop;
    return { close: overlay.close };
  });
});

afterEach(() => {
  discardSkillCapture();
  vi.useRealTimers();
});

describe('starting a skill recording', () => {
  it('refuses a consent revision the host does not ask for, before any prompt', async () => {
    await expect(start(appWindow(1), 0)).rejects.toBeInstanceOf(SkillCaptureRefused);
    expect(showDevicePrompt).not.toHaveBeenCalled();
    expect(electron.getSources).not.toHaveBeenCalled();
  });

  it('captures nothing and shows no indicator when the user cancels the native prompt', async () => {
    showDevicePrompt.mockResolvedValueOnce({ response: 0, checkboxChecked: false });

    const outcome = await start(appWindow(1));

    expect(outcome).toMatchObject({ started: false, reason: 'declined' });
    expect(electron.getSources).not.toHaveBeenCalled();
    expect(overlay.open).not.toHaveBeenCalled();
    expect(skillCaptureStatus().phase).toBe('idle');
  });

  it('defaults the native prompt to Cancel', async () => {
    showDevicePrompt.mockResolvedValueOnce({ response: 0, checkboxChecked: false });
    await start(appWindow(1));

    const options = showDevicePrompt.mock.calls[0]?.[1] as {
      buttons: string[];
      defaultId: number;
      cancelId: number;
    };
    expect(options.buttons[options.defaultId]).toBe('Cancel');
    expect(options.buttons[options.cancelId]).toBe('Cancel');
  });

  it('does not prompt while Screen Recording is turned off, and says where to turn it on', async () => {
    screenRecording.status = 'denied';

    const outcome = await start(appWindow(1));

    expect(outcome).toMatchObject({ started: false, reason: 'permission' });
    expect(outcome.started === false && outcome.message).toContain('Screen Recording');
    expect(showDevicePrompt).not.toHaveBeenCalled();
  });

  it('gives up without an indicator when the first frame comes back empty', async () => {
    electron.getSources.mockResolvedValueOnce([{ display_id: '7', thumbnail: image(0, true) }]);

    const outcome = await start(appWindow(1));

    expect(outcome).toMatchObject({ started: false, reason: 'permission' });
    expect(overlay.open).not.toHaveBeenCalled();
    expect(skillCaptureStatus().phase).toBe('idle');
  });

  it('shows the indicator and keeps only frames where the screen changed', async () => {
    screenShows(10, 10, 200);

    const outcome = await start(appWindow(1));
    await nextSample();
    await nextSample();

    expect(outcome).toMatchObject({ started: true });
    expect(overlay.open).toHaveBeenCalledTimes(1);
    expect(skillCaptureStatus()).toMatchObject({
      phase: 'recording',
      frameCount: 2,
      channels: ['screen'],
    });
  });

  it('refuses a second start while one recording is running or unsaved', async () => {
    screenShows(10);
    await start(appWindow(1));

    await expect(start(appWindow(1))).rejects.toMatchObject({ code: 'conflict' });
    stopSkillCapture('user');
    await expect(start(appWindow(1))).rejects.toMatchObject({ code: 'conflict' });
  });
});

describe('stopping a skill recording', () => {
  it('stops sampling and removes the indicator, keeping the frames for review', async () => {
    screenShows(10);
    await start(appWindow(1));

    const status = stopSkillCapture('user');
    await nextSample();

    expect(status).toMatchObject({ phase: 'stopped', stoppedBy: 'user', frameCount: 1 });
    expect(overlay.close).toHaveBeenCalledTimes(1);
    expect(electron.getSources).toHaveBeenCalledTimes(1);
  });

  it('stops and brings the app back when the indicator is stopped or goes away', async () => {
    const win = appWindow(1);
    screenShows(10);
    await start(win);

    overlay.onStop?.();

    expect(skillCaptureStatus().phase).toBe('stopped');
    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
  });

  it('stops when the screen locks', async () => {
    screenShows(10);
    await start(appWindow(1));

    for (const listener of electron.power.get('lock-screen') ?? []) listener();

    expect(skillCaptureStatus()).toMatchObject({ phase: 'stopped', stoppedBy: 'screen-locked' });
  });

  it('stops at the frame limit', async () => {
    screenShows(
      ...Array.from({ length: SKILL_CAPTURE_LIMITS.maxFrames + 1 }, (_, i) =>
        i % 2 === 0 ? 0 : 200,
      ),
    );
    await start(appWindow(1));

    for (let sample = 0; sample < SKILL_CAPTURE_LIMITS.maxFrames; sample += 1) await nextSample();

    expect(skillCaptureStatus()).toMatchObject({
      phase: 'stopped',
      stoppedBy: 'limit',
      frameCount: SKILL_CAPTURE_LIMITS.maxFrames,
    });
  });

  it('stops and reports why when the screen can no longer be read', async () => {
    screenShows(10);
    await start(appWindow(1));
    electron.getSources.mockResolvedValueOnce([]);

    await nextSample();

    expect(skillCaptureStatus()).toMatchObject({ phase: 'stopped', stoppedBy: 'failed' });
    expect(skillCaptureStatus().failure).toContain('Screen Recording');
  });
});

describe('saving or discarding a skill recording', () => {
  it('hands the frames only to the window that started it, then keeps nothing', async () => {
    const owner = appWindow(1);
    screenShows(10);
    await start(owner);

    expect(() => saveSkillCapture(appWindow(2) as never)).toThrow(SkillCaptureRefused);
    const recording = saveSkillCapture(owner as never);

    expect(recording.channels).toEqual(['screen']);
    expect(recording.frames).toHaveLength(1);
    expect(recording.frames[0]).toMatchObject({ mimeType: 'image/jpeg', offsetMs: 0 });
    expect(overlay.close).toHaveBeenCalled();
    expect(skillCaptureStatus()).toMatchObject({ phase: 'idle', frameCount: 0 });
    expect(() => saveSkillCapture(owner as never)).toThrow(SkillCaptureRefused);
  });

  it('drops the frames on discard', async () => {
    screenShows(10);
    await start(appWindow(1));

    expect(discardSkillCapture()).toMatchObject({ phase: 'idle', frameCount: 0 });
    expect(overlay.close).toHaveBeenCalled();
  });

  it('drops the recording when the window that started it closes', async () => {
    const owner = appWindow(1);
    screenShows(10);
    await start(owner);

    owner.close();

    expect(skillCaptureStatus()).toMatchObject({ phase: 'idle', frameCount: 0 });
  });
});

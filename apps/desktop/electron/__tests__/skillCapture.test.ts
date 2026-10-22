import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SKILL_CAPTURE_CONSENT_REVISION,
  SKILL_CAPTURE_LIMITS,
} from '@agiworkforce/local-runtime-contract';

type FakeDisplay = {
  id: number;
  size: { width: number; height: number };
  scaleFactor: number;
  workArea: { x: number; y: number; width: number; height: number };
};

const electron = vi.hoisted(() => {
  const power = new Map<string, Set<() => void>>();
  const screenEvents = new Map<string, Set<(event: unknown, display: unknown) => void>>();
  const display = (id: number, x: number): FakeDisplay => ({
    id,
    size: { width: 1440, height: 900 },
    scaleFactor: 2,
    workArea: { x, y: 25, width: 1440, height: 875 },
  });
  const primary = display(7, 0);
  const secondary = display(9, 1440);
  return {
    power,
    screenEvents,
    primary,
    secondary,
    displays: [primary, secondary] as FakeDisplay[],
    pointerOn: primary as FakeDisplay,
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
    getCursorScreenPoint: () => ({ x: electron.pointerOn.workArea.x + 10, y: 10 }),
    getDisplayNearestPoint: () => electron.pointerOn,
    getAllDisplays: () => electron.displays,
    on: (event: string, listener: (event: unknown, display: unknown) => void) => {
      const listeners = electron.screenEvents.get(event) ?? new Set();
      listeners.add(listener);
      electron.screenEvents.set(event, listeners);
    },
    removeListener: (event: string, listener: (event: unknown, display: unknown) => void) => {
      electron.screenEvents.get(event)?.delete(listener);
    },
  },
}));

const overlay = vi.hoisted(() => ({
  close: vi.fn(),
  open: vi.fn(),
  onStop: null as null | (() => void),
  shown: Promise.resolve(true) as Promise<boolean>,
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

const secureInputActive = vi.hoisted(() => vi.fn(async () => false));
vi.mock('../runtime/computerUseService', () => ({ secureInputActive }));

const realPlatform = process.platform;
function runOn(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

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

function frameShade(frame: { imageBase64: string } | undefined): string {
  return Buffer.from(frame?.imageBase64 ?? '', 'base64').toString();
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
  runOn('darwin');
  electron.displays = [electron.primary, electron.secondary];
  electron.pointerOn = electron.primary;
  secureInputActive.mockReset();
  secureInputActive.mockResolvedValue(false);
  overlay.shown = Promise.resolve(true);
  screenRecording.status = 'granted';
  showDevicePrompt.mockResolvedValue({ response: 1, checkboxChecked: false });
  electron.getSources.mockReset();
  overlay.close.mockReset();
  overlay.open.mockReset();
  overlay.open.mockImplementation((options: { onStop: () => void }) => {
    overlay.onStop = options.onStop;
    return { close: overlay.close, shown: overlay.shown };
  });
});

afterEach(() => {
  discardSkillCapture();
  vi.useRealTimers();
  runOn(realPlatform);
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

  it('gives up and removes the indicator when the first frame comes back empty', async () => {
    electron.getSources.mockResolvedValueOnce([{ display_id: '7', thumbnail: image(0, true) }]);

    const outcome = await start(appWindow(1));

    expect(outcome).toMatchObject({ started: false, reason: 'permission' });
    expect(overlay.close).toHaveBeenCalledTimes(1);
    expect(skillCaptureStatus().phase).toBe('idle');
  });

  it('takes no frame until the indicator is on screen', async () => {
    let show: (visible: boolean) => void = () => undefined;
    overlay.shown = new Promise<boolean>((resolve) => {
      show = resolve;
    });
    screenShows(10);

    const pending = start(appWindow(1));
    await vi.advanceTimersByTimeAsync(SKILL_CAPTURE_LIMITS.frameIntervalMs * 2);
    expect(overlay.open).toHaveBeenCalledTimes(1);
    expect(electron.getSources).not.toHaveBeenCalled();

    show(true);
    expect(await pending).toMatchObject({ started: true });
    expect(electron.getSources).toHaveBeenCalledTimes(1);
  });

  it('records nothing when the indicator fails to show', async () => {
    overlay.shown = Promise.resolve(false);

    const outcome = await start(appWindow(1));
    await nextSample();

    expect(outcome).toMatchObject({ started: false, reason: 'unavailable' });
    expect(electron.getSources).not.toHaveBeenCalled();
    expect(overlay.close).toHaveBeenCalledTimes(1);
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

  it('refuses before prompting when the Mac cannot be checked for password fields', async () => {
    secureInputActive.mockRejectedValueOnce(new Error('helper missing'));

    const outcome = await start(appWindow(1));

    expect(outcome).toMatchObject({ started: false, reason: 'unavailable' });
    expect(showDevicePrompt).not.toHaveBeenCalled();
    expect(overlay.open).not.toHaveBeenCalled();
  });

  it('refuses a second start while one recording is running or unsaved', async () => {
    screenShows(10);
    await start(appWindow(1));

    await expect(start(appWindow(1))).rejects.toMatchObject({ code: 'conflict' });
    stopSkillCapture('user');
    await expect(start(appWindow(1))).rejects.toMatchObject({ code: 'conflict' });
  });
});

describe('the recorded display', () => {
  it('shows the indicator on the start display and keeps capturing it when the pointer moves', async () => {
    const owner = appWindow(1);
    screenShows(10);
    await start(owner);
    electron.pointerOn = electron.secondary;
    electron.getSources.mockResolvedValueOnce([
      { display_id: '9', thumbnail: image(90) },
      { display_id: '7', thumbnail: image(70) },
    ]);

    await nextSample();

    expect(overlay.open.mock.calls[0]?.[0]).toMatchObject({ display: { id: 7 } });
    expect(skillCaptureStatus()).toMatchObject({ phase: 'recording', displayId: 7 });
    const recording = saveSkillCapture(owner as never);
    expect(recording.frames.map(frameShade)).toEqual(['frame-10', 'frame-70']);
  });

  it('stops instead of capturing another screen when the start display cannot be matched', async () => {
    screenShows(10);
    await start(appWindow(1));
    electron.getSources.mockResolvedValueOnce([{ display_id: '9', thumbnail: image(90) }]);

    await nextSample();

    expect(skillCaptureStatus()).toMatchObject({
      phase: 'stopped',
      stoppedBy: 'display-lost',
      frameCount: 1,
    });
  });

  it('stops when the start display is disconnected', async () => {
    screenShows(10);
    await start(appWindow(1));

    electron.displays = [electron.secondary];
    for (const listener of electron.screenEvents.get('display-removed') ?? []) {
      listener({}, electron.primary);
    }

    expect(skillCaptureStatus()).toMatchObject({ phase: 'stopped', stoppedBy: 'display-lost' });
    expect(overlay.close).toHaveBeenCalledTimes(1);
  });

  it('stops at the next sample when the start display is no longer listed', async () => {
    screenShows(10);
    await start(appWindow(1));
    electron.displays = [electron.secondary];
    electron.getSources.mockResolvedValueOnce([{ display_id: '9', thumbnail: image(90) }]);

    await nextSample();

    expect(skillCaptureStatus()).toMatchObject({ phase: 'stopped', stoppedBy: 'display-lost' });
    expect(electron.getSources).toHaveBeenCalledTimes(1);
  });
});

describe('secure input on macOS', () => {
  it('drops a frame while secure input is on before the capture, without capturing', async () => {
    screenShows(10);
    await start(appWindow(1));
    secureInputActive.mockResolvedValueOnce(true);

    await nextSample();

    expect(electron.getSources).toHaveBeenCalledTimes(1);
    expect(skillCaptureStatus()).toMatchObject({ frameCount: 1, secureInputSkips: 1 });
  });

  it('drops a frame when secure input came on during the capture', async () => {
    screenShows(10, 200);
    await start(appWindow(1));
    secureInputActive.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await nextSample();

    expect(electron.getSources).toHaveBeenCalledTimes(2);
    expect(skillCaptureStatus()).toMatchObject({ frameCount: 1, secureInputSkips: 1 });
  });

  it('drops the frame when the check cannot answer', async () => {
    screenShows(10, 200);
    await start(appWindow(1));
    secureInputActive.mockRejectedValueOnce(new Error('helper stopped'));

    await nextSample();

    expect(skillCaptureStatus()).toMatchObject({
      phase: 'recording',
      frameCount: 1,
      secureInputSkips: 1,
    });
  });

  it('is not consulted on Windows', async () => {
    runOn('win32');
    screenShows(10, 200);
    await start(appWindow(1));

    await nextSample();

    expect(secureInputActive).not.toHaveBeenCalled();
    expect(skillCaptureStatus()).toMatchObject({ frameCount: 2, secureInputSkips: 0 });
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

  it('says when an unsaved recording will be dropped, and drops it then', async () => {
    screenShows(10);
    await start(appWindow(1));

    const stopped = stopSkillCapture('user');
    expect(stopped.discardsAt).toBe(
      (stopped.startedAt ?? 0) + stopped.durationMs + SKILL_CAPTURE_LIMITS.stoppedRetentionMs,
    );

    await vi.advanceTimersByTimeAsync(SKILL_CAPTURE_LIMITS.stoppedRetentionMs - 1);
    expect(skillCaptureStatus()).toMatchObject({ phase: 'stopped', frameCount: 1 });
    await vi.advanceTimersByTimeAsync(1);
    expect(skillCaptureStatus()).toMatchObject({ phase: 'idle', frameCount: 0, discardsAt: null });
  });

  it('does not let an earlier recording expiry drop a later one', async () => {
    const owner = appWindow(1);
    screenShows(10);
    await start(owner);
    stopSkillCapture('user');
    saveSkillCapture(owner as never);
    await vi.advanceTimersByTimeAsync(SKILL_CAPTURE_LIMITS.stoppedRetentionMs / 2);

    screenShows(20);
    await start(owner);
    stopSkillCapture('user');
    await vi.advanceTimersByTimeAsync(SKILL_CAPTURE_LIMITS.stoppedRetentionMs / 2 + 1);

    expect(skillCaptureStatus()).toMatchObject({ phase: 'stopped', frameCount: 1 });
  });

  it('drops the recording when the window that started it closes', async () => {
    const owner = appWindow(1);
    screenShows(10);
    await start(owner);

    owner.close();

    expect(skillCaptureStatus()).toMatchObject({ phase: 'idle', frameCount: 0 });
  });
});

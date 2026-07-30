import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const harness = vi.hoisted(() => ({
  created: [] as Array<{
    label: string;
    options: Record<string, unknown>;
    close: ReturnType<typeof vi.fn>;
  }>,
  existing: null as { close: ReturnType<typeof vi.fn> } | null,
  currentClose: vi.fn(async () => undefined),
  register: vi.fn(async () => undefined),
  unregister: vi.fn(async () => undefined),
}));

vi.mock('@agiworkforce/desktop-command-client', () => ({
  shortcuts: {
    shortcutsRegisterGlobal: harness.register,
    shortcutsUnregisterGlobal: harness.unregister,
  },
}));

vi.mock('@tauri-apps/api/webviewWindow', () => {
  class WebviewWindow {
    static getByLabel = vi.fn(async () => harness.existing);

    label: string;
    options: Record<string, unknown>;
    close = vi.fn(async () => undefined);

    constructor(label: string, options: Record<string, unknown>) {
      this.label = label;
      this.options = options;
      harness.created.push(this);
    }

    async once(event: string, callback: (event: { payload?: unknown }) => void) {
      if (event === 'tauri://created') queueMicrotask(() => callback({}));
      return vi.fn();
    }
  }

  return { WebviewWindow };
});

vi.mock('@tauri-apps/api/window', () => ({
  currentMonitor: vi.fn(async () => ({
    scaleFactor: 2,
    workArea: {
      position: { x: 200, y: 80 },
      size: { width: 2400, height: 1600 },
    },
  })),
  getCurrentWindow: vi.fn(() => ({ close: harness.currentClose })),
}));

import {
  RECORDER_STOP_SHORTCUT,
  RECORDER_STOP_SHORTCUT_ACTION,
  closeCurrentRecorderHud,
  closeRecorderHudWindow,
  openRecorderHudWindow,
} from '../recorderHudWindow';

describe('recorder HUD window', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.created.length = 0;
    harness.existing = null;
  });

  it('opens a fixed always-on-top HUD on the current monitor and registers stop', async () => {
    await openRecorderHudWindow();

    expect(harness.created).toHaveLength(1);
    expect(harness.created[0]?.label).toBe('recorder-hud');
    expect(harness.created[0]?.options).toMatchObject({
      url: 'index.html?mode=recorder-hud',
      x: 380,
      y: 56,
      width: 640,
      height: 88,
      decorations: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focus: false,
    });
    expect(harness.register).toHaveBeenCalledWith(
      RECORDER_STOP_SHORTCUT,
      RECORDER_STOP_SHORTCUT_ACTION,
    );
  });

  it('unregisters the temporary shortcut and closes the HUD', async () => {
    const close = vi.fn(async () => undefined);
    harness.existing = { close };

    await closeRecorderHudWindow();

    expect(harness.unregister).toHaveBeenCalledWith(RECORDER_STOP_SHORTCUT);
    expect(close).toHaveBeenCalledOnce();
  });

  it('can close itself after Done or Discard', async () => {
    await closeCurrentRecorderHud();

    expect(harness.unregister).toHaveBeenCalledWith(RECORDER_STOP_SHORTCUT);
    expect(harness.currentClose).toHaveBeenCalledOnce();
  });

  it('grants the HUD only event listening and self-close permissions', () => {
    const capability = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src-tauri/capabilities/recorder-hud.json'), 'utf8'),
    ) as { windows: string[]; permissions: string[] };

    expect(capability.windows).toEqual(['recorder-hud']);
    expect(capability.permissions).toEqual([
      'core:event:allow-listen',
      'core:event:allow-unlisten',
      'core:window:allow-close',
    ]);

    const tauriConfig = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'),
    ) as {
      app: { macOSPrivateApi?: boolean; security: { capabilities: string[] } };
    };
    expect(tauriConfig.app.security.capabilities).toContain('recorder-hud');
    expect(tauriConfig.app.macOSPrivateApi).toBe(true);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ELECTRON_IPC_CHANNELS } from '../../src/lib/tauri-electron/bridgeContract';

const SSO_DEEP_LINK = 'agiworkforce-cloud://sso-callback?rotating_token_nonce=nonce-abc123';

const appHandlers = new Map<string, (...args: unknown[]) => void>();
const webContentsSend = vi.fn();

function makeWebContents() {
  return {
    send: webContentsSend,
    on: vi.fn(),
    once: vi.fn((event: string, cb: () => void) => {
      if (event === 'did-finish-load') cb();
    }),
    isLoading: () => false,
    setWindowOpenHandler: vi.fn(),
    userAgent: 'test',
    focus: vi.fn(),
  };
}

vi.mock('electron', () => {
  class BrowserWindow {
    static fromWebContents = vi.fn(() => null);
    webContents = makeWebContents();
    constructor(public options: unknown) {}
    once = vi.fn((event: string, cb: () => void) => {
      if (event === 'ready-to-show') cb();
    });
    on = vi.fn();
    loadURL = vi.fn();
    show = vi.fn();
    focus = vi.fn();
    restore = vi.fn();
    isMinimized = () => false;
    isDestroyed = () => false;
    isMaximized = () => false;
  }

  const session = {
    setPermissionRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
    setDisplayMediaRequestHandler: vi.fn(),
  };

  return {
    BrowserWindow,
    Notification: Object.assign(
      vi.fn(() => ({ on: vi.fn(), show: vi.fn() })),
      { isSupported: () => false },
    ),
    Menu: { buildFromTemplate: vi.fn(() => ({})) },
    Tray: vi.fn(() => ({ setToolTip: vi.fn(), setContextMenu: vi.fn(), on: vi.fn() })),
    app: {
      name: 'AGI Cloud',
      requestSingleInstanceLock: () => true,
      setName: vi.fn(),
      setAsDefaultProtocolClient: vi.fn(),
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        appHandlers.set(event, cb);
      }),
      whenReady: () => Promise.resolve(),
      getVersion: () => '1.2.0',
      getAppPath: () => '/app',
      getPath: () => '/userData',
      quit: vi.fn(),
      relaunch: vi.fn(),
      exit: vi.fn(),
    },
    clipboard: { writeImage: vi.fn() },
    contextBridge: { exposeInMainWorld: vi.fn() },
    desktopCapturer: { getSources: vi.fn(async () => []) },
    dialog: { showMessageBox: vi.fn(), showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
    globalShortcut: { register: vi.fn(() => true), unregisterAll: vi.fn() },
    ipcMain: { handle: vi.fn() },
    nativeImage: {
      createFromPath: vi.fn(() => ({ setTemplateImage: vi.fn(), isEmpty: () => true })),
    },
    net: { fetch: vi.fn() },
    protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
    safeStorage: { isEncryptionAvailable: () => false },
    screen: { getCursorScreenPoint: vi.fn(), getDisplayNearestPoint: vi.fn() },
    session: { defaultSession: session, fromPartition: () => session },
    shell: { openExternal: vi.fn() },
    systemPreferences: { getMediaAccessStatus: vi.fn(() => 'granted') },
  };
});

vi.mock('../tray', () => ({ createTray: vi.fn() }));
vi.mock('../shortcuts', () => ({
  registerGarnishShortcuts: vi.fn(),
  unregisterGarnishShortcuts: vi.fn(),
}));
vi.mock('../quickAsk', () => ({
  destroyQuickAsk: vi.fn(),
  toggleQuickAsk: vi.fn(),
  warmUpQuickAsk: vi.fn(),
}));
vi.mock('../screenshot', () => ({ captureToChat: vi.fn() }));
vi.mock('../windowPolicy', () => ({ applyRemoteWindowPolicy: vi.fn() }));
vi.mock('../accountBridge', () => ({ handleBridgeCommand: vi.fn() }));

async function bootMain(mode: 'remote' | 'bundled' | 'unset') {
  if (mode === 'unset') delete process.env['AGI_CLOUD_RENDERER'];
  else process.env['AGI_CLOUD_RENDERER'] = mode;
  vi.resetModules();
  appHandlers.clear();
  webContentsSend.mockClear();
  await import('../main');
  await Promise.resolve();
  await Promise.resolve();
}

function openUrl(url: string): void {
  const handler = appHandlers.get('open-url');
  if (!handler) throw new Error('open-url handler was never registered');
  handler({ preventDefault: vi.fn() }, url);
}

describe('deep-link delivery', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  const originalMode = process.env['AGI_CLOUD_RENDERER'];

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    if (originalMode === undefined) delete process.env['AGI_CLOUD_RENDERER'];
    else process.env['AGI_CLOUD_RENDERER'] = originalMode;
  });

  it('delivers the callback over IPC when nothing sets the renderer mode', async () => {
    await bootMain('unset');

    openUrl(SSO_DEEP_LINK);

    expect(webContentsSend).toHaveBeenCalledWith(ELECTRON_IPC_CHANNELS.deepLink, SSO_DEEP_LINK);
    expect(warn.mock.calls.flat().join(' ')).not.toContain('dropped');
  });

  it('reports the drop instead of pushing into a renderer with no IPC bridge', async () => {
    await bootMain('remote');

    expect(warn.mock.calls.flat().join(' ')).toContain('will be dropped');
    warn.mockClear();

    openUrl(SSO_DEEP_LINK);

    expect(webContentsSend).not.toHaveBeenCalledWith(
      ELECTRON_IPC_CHANNELS.deepLink,
      expect.anything(),
    );
    const warned = warn.mock.calls.flat().join(' ');
    expect(warned).toContain('agiworkforce-cloud://sso-callback');
    expect(warned).toContain('AGI_CLOUD_RENDERER');
    expect(warned).not.toContain('nonce-abc123');
  });

  it('delivers over IPC when the bundled renderer attaches the bridge', async () => {
    await bootMain('bundled');

    openUrl(SSO_DEEP_LINK);

    expect(webContentsSend).toHaveBeenCalledWith(ELECTRON_IPC_CHANNELS.deepLink, SSO_DEEP_LINK);
    expect(warn.mock.calls.flat().join(' ')).not.toContain('dropped');
  });

  it('ignores URLs outside the deep-link scheme', async () => {
    await bootMain('remote');
    warn.mockClear();

    openUrl('https://evil.example/sso-callback');

    expect(warn).not.toHaveBeenCalled();
  });
});

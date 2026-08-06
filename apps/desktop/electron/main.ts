/**
 * Electron main process for the AGI cloud desktop shell.
 *
 * One Desktop surface, two shells (see `apps/desktop/AGENTS.md`): this is the
 * cloud-only shell. It follows the Claude-desktop model (founder decision,
 * 2026-08-04): the renderer is the HOSTED cloud web app at agiworkforce.com,
 * loaded top-level in a pinned session partition — the app updates the moment
 * the web deploys, auth is the ordinary same-origin Clerk cookie session, and
 * there is no second UI to maintain.
 *
 * A bundled fallback renderer remains available: AGI_CLOUD_RENDERER=bundled
 * serves the `VITE_BUILD_TARGET=electron` Vite bundle over the privileged
 * `agi://cloud` scheme with native Clerk sign-in proxied by this process
 * (mirroring src-tauri/src/sys/account/clerk_native.rs). It is the tested
 * escape hatch if the remote model hits a wall (offline shell, webview auth
 * changes) — not dead code.
 *
 * Either way this shell never touches Local-mode capabilities — no filesystem
 * features, no shell execution, no MCP hosting.
 */
import {
  BrowserWindow,
  Notification,
  app,
  desktopCapturer,
  dialog,
  ipcMain,
  protocol,
  session,
  shell,
} from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  ELECTRON_IPC_CHANNELS,
  isElectronBridgeCommand,
  type ElectronDialogRequest,
  type ElectronNotifyRequest,
  type ElectronWindowControlRequest,
} from '../src/lib/tauri-electron/bridgeContract';
import { handleBridgeCommand } from './accountBridge';
import {
  CLOUD_APP_ORIGIN,
  DEEP_LINK_SCHEME,
  REMOTE_SESSION_PARTITION,
  RENDERER_CSP,
  RENDERER_HOST,
  RENDERER_MODE,
  RENDERER_ORIGIN,
  RENDERER_SCHEME,
} from './config';
import { destroyQuickAsk, toggleQuickAsk, warmUpQuickAsk } from './quickAsk';
import { captureToChat } from './screenshot';
import { registerGarnishShortcuts, unregisterGarnishShortcuts } from './shortcuts';
import { createTray } from './tray';
import { applyRemoteWindowPolicy } from './windowPolicy';

let mainWindow: BrowserWindow | null = null;
/** Deep link that arrived before the window was ready (bundled mode only). */
let pendingDeepLink: string | null = null;

/** Delay before pre-loading the quick-ask panel, so it never competes with
 * the main window's first paint. */
const QUICK_ASK_WARMUP_MS = 5000;

// ---------------------------------------------------------------------------
// Bundled-renderer scheme: standard + secure so document.origin is agi://cloud
// and API fetches carry `Origin: agi://cloud` (never `null`). Must run before
// app.whenReady(); registering it is harmless in remote mode.
// ---------------------------------------------------------------------------
protocol.registerSchemesAsPrivileged([
  {
    scheme: RENDERER_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
};

function rendererDistDir(): string {
  return path.join(app.getAppPath(), 'dist');
}

async function serveRenderer(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.hostname !== RENDERER_HOST) {
    return new Response('Not found', { status: 404 });
  }

  const distDir = rendererDistDir();
  const requested = decodeURIComponent(url.pathname);
  const relative = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');
  let filePath = path.normalize(path.join(distDir, relative));
  if (!filePath.startsWith(distDir + path.sep) && filePath !== path.join(distDir, 'index.html')) {
    return new Response('Forbidden', { status: 403 });
  }

  let body: Buffer;
  try {
    body = await fs.readFile(filePath);
  } catch {
    // SPA fallback: unknown paths render the app shell (react-router routes).
    filePath = path.join(distDir, 'index.html');
    try {
      body = await fs.readFile(filePath);
    } catch {
      return new Response('Not found', { status: 404 });
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
  };
  if (filePath.endsWith('.html')) {
    headers['Content-Security-Policy'] = RENDERER_CSP;
  }
  return new Response(new Uint8Array(body), { status: 200, headers });
}

// ---------------------------------------------------------------------------
// IPC (bundled mode) — every handler validates the sender: only the main
// frame of our own window, loaded from the agi:// renderer origin.
// ---------------------------------------------------------------------------
function isTrustedSender(event: Electron.IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) return false;
  return frame.url.startsWith(`${RENDERER_ORIGIN}/`) || frame.url === RENDERER_ORIGIN;
}

function registerIpcHandlers(): void {
  ipcMain.handle(ELECTRON_IPC_CHANNELS.invokeBridge, async (event, command, args) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted bridge caller.');
    if (typeof command !== 'string' || !isElectronBridgeCommand(command)) {
      throw new Error('Unknown bridge command.');
    }
    const safeArgs =
      args && typeof args === 'object' && !Array.isArray(args)
        ? (args as Record<string, unknown>)
        : undefined;
    return handleBridgeCommand(command, safeArgs);
  });

  ipcMain.handle(ELECTRON_IPC_CHANNELS.openExternal, async (event, url) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted bridge caller.');
    if (typeof url !== 'string') return;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    // OS browser only for web links — file:, agiworkforce:, smb: etc. stay shut.
    if (
      parsed.protocol === 'https:' ||
      parsed.protocol === 'http:' ||
      parsed.protocol === 'mailto:'
    ) {
      await shell.openExternal(parsed.toString());
    }
  });

  ipcMain.handle(ELECTRON_IPC_CHANNELS.windowControl, async (event, request) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted bridge caller.');
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    const { action, value } = (request ?? {}) as ElectronWindowControlRequest;
    switch (action) {
      case 'minimize':
        win.minimize();
        return true;
      case 'maximize':
        win.maximize();
        return true;
      case 'unmaximize':
        win.unmaximize();
        return true;
      case 'toggleMaximize':
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
        return true;
      case 'isMaximized':
        return win.isMaximized();
      case 'close':
        win.close();
        return true;
      case 'show':
        win.show();
        return true;
      case 'hide':
        win.hide();
        return true;
      case 'setFocus':
        win.focus();
        return true;
      case 'setAlwaysOnTop':
        win.setAlwaysOnTop(value === true);
        return true;
      case 'setTitle':
        if (typeof value === 'string') win.setTitle(value);
        return true;
      case 'startDragging':
        // Dragging is CSS-driven in Electron (-webkit-app-region: drag).
        return false;
      default:
        return false;
    }
  });

  ipcMain.handle(ELECTRON_IPC_CHANNELS.dialog, async (event, request) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted bridge caller.');
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;
    const req = (request ?? {}) as ElectronDialogRequest;
    switch (req.kind) {
      case 'message': {
        await dialog.showMessageBox(win, {
          type: 'info',
          message: String(req.message ?? ''),
          title: req.title ?? app.name,
        });
        return null;
      }
      case 'ask':
      case 'confirm': {
        const { response } = await dialog.showMessageBox(win, {
          type: 'question',
          buttons: ['Yes', 'No'],
          defaultId: 0,
          cancelId: 1,
          message: String(req.message ?? ''),
          title: req.title ?? app.name,
        });
        return response === 0;
      }
      case 'open': {
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
          title: req.title,
          properties: [req.directory ? 'openDirectory' : 'openFile'],
        });
        if (canceled || filePaths.length === 0) return null;
        return filePaths[0] ?? null;
      }
      case 'save': {
        const { canceled, filePath } = await dialog.showSaveDialog(win, {
          title: req.title,
          defaultPath: req.defaultPath,
        });
        return canceled || !filePath ? null : filePath;
      }
      default:
        return null;
    }
  });

  ipcMain.handle(ELECTRON_IPC_CHANNELS.notify, async (event, request) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted bridge caller.');
    const req = (request ?? {}) as ElectronNotifyRequest;
    if (typeof req.title !== 'string' || req.title === '') return;
    if (!Notification.isSupported()) return;
    const notification = new Notification({
      title: req.title,
      ...(typeof req.body === 'string' ? { body: req.body } : {}),
    });
    notification.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });
    notification.show();
  });

  ipcMain.handle(ELECTRON_IPC_CHANNELS.relaunch, async (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted bridge caller.');
    app.relaunch();
    app.exit(0);
  });
}

// ---------------------------------------------------------------------------
// Deep links (SSO returns from the system browser; bundled mode).
// ---------------------------------------------------------------------------
function deliverDeepLink(url: string): void {
  if (!url.startsWith(`${DEEP_LINK_SCHEME}://`)) return;
  if (mainWindow && !mainWindow.webContents.isLoading()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send(ELECTRON_IPC_CHANNELS.deepLink, url);
  } else {
    pendingDeepLink = url;
  }
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function configureSession(targetSession: Electron.Session): void {
  // Mic (voice input) and notifications are the only page permissions the
  // cloud shell grants; everything else is denied.
  targetSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(
      ['media', 'notifications', 'fullscreen', 'clipboard-sanitized-write'].includes(permission),
    );
  });

  // The composer's screen-capture feature calls getDisplayMedia; without this
  // handler Electron renders NO picker at all. Alpha behavior: share the
  // primary screen. A native source picker can replace this later.
  targetSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ['screen'] })
      .then((sources) => {
        const primary = sources[0];
        if (primary) callback({ video: primary });
        else callback({});
      })
      .catch(() => callback({}));
  });
}

/**
 * Branded offline/unreachable screen.
 *
 * Without this the remote renderer shows Chromium's own "This site can't be
 * reached" interstitial as the ENTIRE app window — no branding, no explanation
 * that this is a connectivity problem rather than a broken install, and a Reload
 * button that re-runs the same failing navigation. That is what a user sees on
 * captive-portal wifi, in a tunnel, or during an agiworkforce.com outage.
 *
 * Served as a data: URL so it works with no network and no local build output.
 * The retry navigates to the app origin, which is on the navigation allowlist —
 * if it fails again `did-fail-load` simply brings this screen back.
 */
function offlineScreenUrl(targetUrl: string, detail: string): string {
  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="color-scheme" content="dark"><title>AGI — offline</title><style>
  html,body{height:100%;margin:0}
  body{background:#212121;color:#ececec;display:flex;align-items:center;justify-content:center;
    font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
  main{max-width:30rem;padding:2rem;text-align:center}
  h1{font-size:1.25rem;font-weight:600;margin:0 0 .5rem;letter-spacing:-.01em}
  p{color:#b4b4b4;margin:0 0 1.5rem}
  code{color:#8a9693;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
    word-break:break-all}
  button{background:#da7756;color:#fff;border:0;border-radius:8px;padding:.6rem 1.25rem;
    font:inherit;font-weight:600;cursor:pointer}
  button:hover{opacity:.9}
  button:focus-visible{outline:2px solid #ececec;outline-offset:2px}
</style></head><body><main>
  <h1>Can't reach AGI</h1>
  <p>You appear to be offline, or agiworkforce.com is unreachable. Your local
     data is safe — this only affects the cloud connection.</p>
  <button id="retry" autofocus>Try again</button>
  <p style="margin:1.5rem 0 0"><code>${detail}</code></p>
</main><script>
  document.getElementById('retry').addEventListener('click',function(){
    location.href=${JSON.stringify(targetUrl)};
  });
</script></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function createMainWindow(): void {
  const isRemote = RENDERER_MODE === 'remote';

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    // Electron paints a white window before the first frame. In a dark-themed
    // app that reads as a flash on launch and on every top-level navigation.
    // Matches agiCoolPalette.dark.surface.base.
    backgroundColor: '#212121',
    // NOTE: deliberately no `titleBarStyle: 'hiddenInset'`.
    //
    // hiddenInset was applied to the BUNDLED renderer only (`!isRemote`), and the
    // React shell it loads reserves no top inset. macOS floats the traffic lights
    // over the web content at roughly x=13-75, y=12-32, while the sidebar header
    // starts at exactly x=12, y=12 — so the brand mark sat underneath them, and
    // with the sidebar collapsed the expand button landed entirely under the
    // yellow and green buttons and could not be clicked at all. Since the
    // collapsed state persists across restarts, that was unrecoverable.
    //
    // The shipped remote path never set it and is unaffected. Matching it here
    // costs a frameless look on an escape-hatch mode and buys back a working
    // window; re-introducing it requires a real --titlebar-inset in the shell
    // plus WebkitAppRegion drag handling, not just the flag.
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      ...(isRemote
        ? { partition: REMOTE_SESSION_PARTITION }
        : {
            preload: path.join(__dirname, 'preload.cjs'),
            additionalArguments: [`--agi-app-version=${app.getVersion()}`],
          }),
    },
  });

  // User-agent cleanup, popup denial and the navigation allowlist — shared
  // with the quick-ask panel so both cloud windows enforce the same policy.
  applyRemoteWindowPolicy(mainWindow);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.once('did-finish-load', () => {
    if (pendingDeepLink) {
      const url = pendingDeepLink;
      pendingDeepLink = null;
      mainWindow?.webContents.send(ELECTRON_IPC_CHANNELS.deepLink, url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    // The warm quick-ask panel is a hidden BrowserWindow, so on platforms
    // where closing the main window quits the app it would otherwise keep
    // `window-all-closed` from ever firing. macOS keeps running by design.
    if (process.platform !== 'darwin') destroyQuickAsk();
  });

  const entryUrl = isRemote ? `${CLOUD_APP_ORIGIN}/chat` : `${RENDERER_ORIGIN}/index.html`;

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      // Sub-resource failures are the page's own problem, not a dead app window.
      if (!isMainFrame) return;
      // -3 is ERR_ABORTED: a superseded navigation, not a failure the user caused.
      if (errorCode === -3) return;
      // Don't recurse if the offline screen itself somehow fails to load.
      if (validatedURL.startsWith('data:')) return;
      void mainWindow?.loadURL(
        offlineScreenUrl(entryUrl, `${errorDescription || 'load failed'} (${errorCode})`),
      );
    },
  );

  void mainWindow.loadURL(entryUrl);
}

/** Raise the main window, recreating it if it has been closed (macOS). */
function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/**
 * Tray "New Chat": send the window back to a fresh chat. In bundled mode the
 * renderer owns its own routing, so reloading the shell is the equivalent.
 */
function openNewChat(): void {
  showMainWindow();
  const target =
    RENDERER_MODE === 'remote' ? `${CLOUD_APP_ORIGIN}/chat` : `${RENDERER_ORIGIN}/index.html`;
  void mainWindow?.loadURL(target);
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.setName('AGI Cloud');
  app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);

  app.on('second-instance', (_event, argv) => {
    const link = argv.find((arg) => arg.startsWith(`${DEEP_LINK_SCHEME}://`));
    if (link) deliverDeepLink(link);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    deliverDeepLink(url);
  });

  void app.whenReady().then(() => {
    if (RENDERER_MODE === 'bundled') {
      protocol.handle(RENDERER_SCHEME, serveRenderer);
      registerIpcHandlers();
      configureSession(session.defaultSession);
    } else {
      configureSession(session.fromPartition(REMOTE_SESSION_PARTITION));
    }

    createMainWindow();

    // Shell garnish: menu-bar entry point plus the two global hotkeys. Both
    // routes call the same handlers, so a hotkey the OS refuses to register
    // still has a working equivalent in the tray menu.
    const garnishHandlers = {
      onOpen: showMainWindow,
      onNewChat: openNewChat,
      onQuickAsk: () => toggleQuickAsk(mainWindow),
      onScreenshot: () => void captureToChat(mainWindow),
    };
    createTray(garnishHandlers);
    registerGarnishShortcuts({
      onQuickAsk: garnishHandlers.onQuickAsk,
      onScreenshot: garnishHandlers.onScreenshot,
    });

    // Pre-load the quick-ask page once the main window has settled, so the
    // first summon is instant instead of a cold page load.
    setTimeout(warmUpQuickAsk, QUICK_ASK_WARMUP_MS).unref?.();

    app.on('activate', () => {
      // Checked against the main window, not the window count: the hidden
      // quick-ask panel is a window and would otherwise mask a closed app.
      showMainWindow();
    });
  });

  app.on('will-quit', () => {
    unregisterGarnishShortcuts();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

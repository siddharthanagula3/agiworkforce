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
  RENDERER_CSP,
  RENDERER_HOST,
  RENDERER_ORIGIN,
  RENDERER_SCHEME,
} from './config';

type RendererMode = 'remote' | 'bundled';
const RENDERER_MODE: RendererMode =
  process.env['AGI_CLOUD_RENDERER'] === 'bundled' ? 'bundled' : 'remote';

/** Cookie/localStorage live here; changing the partition wipes user state. */
const REMOTE_SESSION_PARTITION = 'persist:agi-cloud';

/**
 * Hosts the remote renderer may navigate to in-window. Everything else opens
 * in the OS browser. The identity-provider hosts are included because web
 * sign-in round-trips through them as ordinary top-level redirects.
 */
const REMOTE_NAVIGATION_HOSTS = [
  'agiworkforce.com',
  '.agiworkforce.com',
  'accounts.google.com',
  'login.microsoftonline.com',
  'login.live.com',
  'appleid.apple.com',
  '.clerk.accounts.dev',
] as const;

let mainWindow: BrowserWindow | null = null;
/** Deep link that arrived before the window was ready (bundled mode only). */
let pendingDeepLink: string | null = null;

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
// Shared navigation policy
// ---------------------------------------------------------------------------
function openExternally(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      void shell.openExternal(parsed.toString());
    }
  } catch {
    // Unparseable URL: drop it.
  }
}

function isAllowedRemoteNavigation(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  return REMOTE_NAVIGATION_HOSTS.some((host) =>
    host.startsWith('.')
      ? parsed.hostname.endsWith(host) || parsed.hostname === host.slice(1)
      : parsed.hostname === host,
  );
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

function createMainWindow(): void {
  const isRemote = RENDERER_MODE === 'remote';

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    ...(process.platform === 'darwin' && !isRemote
      ? { titleBarStyle: 'hiddenInset' as const }
      : {}),
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

  if (isRemote) {
    // Google/Microsoft/Apple reject OAuth from user agents that advertise an
    // embedded shell. Present the underlying Chrome UA without the Electron
    // and app-name tokens — the same approach Electron-based chat wrappers
    // ship with. If a provider still refuses, the email/OTP path is unaffected.
    const cleanedUserAgent = mainWindow.webContents.userAgent
      .replace(/\sAGICloud\/[\d.]+/i, '')
      .replace(/\sAGI Cloud\/[\d.]+/i, '')
      .replace(/\sElectron\/[\d.]+/i, '');
    mainWindow.webContents.userAgent = cleanedUserAgent;
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Everything the page tries to pop lands in the OS browser, never in a
    // child BrowserWindow (which would also break OAuth user-agent checks).
    openExternally(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = isRemote
      ? isAllowedRemoteNavigation(url)
      : url.startsWith(`${RENDERER_ORIGIN}/`);
    if (!allowed) {
      event.preventDefault();
      openExternally(url);
    }
  });

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
  });

  if (isRemote) {
    void mainWindow.loadURL(`${CLOUD_APP_ORIGIN}/chat`);
  } else {
    void mainWindow.loadURL(`${RENDERER_ORIGIN}/index.html`);
  }
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

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
      else mainWindow?.show();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

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
  checkDesktopCloudUpdate,
  desktopCloudInstallerDownloadUrl,
  type DesktopCloudMacArchitecture,
} from '../src/lib/desktopCloudUpdate';
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
import { toggleGlobalDictation } from './voiceDictation';
import { applyRemoteWindowPolicy } from './windowPolicy';
import {
  isTrustedCloudRendererOrigin,
  shouldGrantCloudPermissionCheck,
  shouldGrantCloudPermissionRequest,
} from './permissionPolicy';

let mainWindow: BrowserWindow | null = null;
let pendingDeepLink: string | null = null;

function installedMacArchitecture(): DesktopCloudMacArchitecture {
  if (process.arch === 'arm64' || process.arch === 'x64') return process.arch;
  throw new Error(`Unsupported AGI Cloud macOS architecture: ${process.arch}`);
}

const QUICK_ASK_WARMUP_MS = 5000;

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

  ipcMain.handle(ELECTRON_IPC_CHANNELS.checkUpdate, async (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted bridge caller.');
    return checkDesktopCloudUpdate(app.getVersion(), installedMacArchitecture());
  });

  ipcMain.handle(ELECTRON_IPC_CHANNELS.openUpdateInstaller, async (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted bridge caller.');
    await shell.openExternal(desktopCloudInstallerDownloadUrl(installedMacArchitecture()));
  });
}

const DEEP_LINK_BRIDGE_ATTACHED = RENDERER_MODE === 'bundled';

function deepLinkRoute(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`.replace(/\/+$/, '') || '/';
  } catch {
    return '<unparseable>';
  }
}

function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function deliverDeepLink(url: string): void {
  if (!url.startsWith(`${DEEP_LINK_SCHEME}://`)) return;

  if (!DEEP_LINK_BRIDGE_ATTACHED) {
    console.warn(
      `[deep-link] dropped ${DEEP_LINK_SCHEME}://${deepLinkRoute(url)}: renderer mode ` +
        `"${RENDERER_MODE}" loads ${CLOUD_APP_ORIGIN} top-level with no preload, so no IPC ` +
        'receiver is attached. Unset AGI_CLOUD_RENDERER to restore native deep links.',
    );
    focusMainWindow();
    return;
  }

  if (mainWindow && !mainWindow.webContents.isLoading()) {
    focusMainWindow();
    mainWindow.webContents.send(ELECTRON_IPC_CHANNELS.deepLink, url);
  } else {
    pendingDeepLink = url;
  }
}

function configureSession(targetSession: Electron.Session): void {
  targetSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    callback(shouldGrantCloudPermissionRequest(permission, details));
  });
  targetSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) =>
    shouldGrantCloudPermissionCheck(permission, requestingOrigin, details),
  );

  targetSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      if (
        !request.userGesture ||
        !request.videoRequested ||
        !isTrustedCloudRendererOrigin(request.securityOrigin)
      ) {
        callback({});
        return;
      }
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then(async (sources) => {
          if (sources.length === 0) {
            callback({});
            return;
          }
          const cancelId = sources.length;
          const selection = await dialog.showMessageBox({
            type: 'question',
            title: 'Share your screen',
            message: 'Choose a screen to share with AGI Cloud',
            detail: 'Sharing stops when you end screen capture in the chat.',
            buttons: [...sources.map((source) => source.name), 'Cancel'],
            defaultId: 0,
            cancelId,
            noLink: true,
          });
          const source = sources[selection.response];
          callback(source ? { video: source } : {});
        })
        .catch(() => callback({}));
    },
    { useSystemPicker: true },
  );
}

function offlineScreenUrl(targetUrl: string, detail: string): string {
  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="color-scheme" content="dark"><title>AGI, offline</title><style>
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
  <p>You appear to be offline, or agiworkforce.com is unreachable. Your account
     data is unchanged, reconnect to continue using AGI Cloud.</p>
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
    backgroundColor: '#212121',
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
    if (process.platform !== 'darwin') destroyQuickAsk();
  });

  const entryUrl = isRemote ? `${CLOUD_APP_ORIGIN}/chat` : `${RENDERER_ORIGIN}/index.html`;

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      if (errorCode === -3) return;
      if (validatedURL.startsWith('data:')) return;
      void mainWindow?.loadURL(
        offlineScreenUrl(entryUrl, `${errorDescription || 'load failed'} (${errorCode})`),
      );
    },
  );

  void mainWindow.loadURL(entryUrl);
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  focusMainWindow();
}

function openNewChat(): void {
  showMainWindow();
  const target =
    RENDERER_MODE === 'remote' ? `${CLOUD_APP_ORIGIN}/chat` : `${RENDERER_ORIGIN}/index.html`;
  void mainWindow?.loadURL(target);
}

async function checkForCloudUpdate(): Promise<void> {
  try {
    const update = await checkDesktopCloudUpdate(app.getVersion(), installedMacArchitecture());
    if (!update.available) {
      const options = {
        type: 'info' as const,
        title: 'AGI Cloud is up to date',
        message: 'You have the latest AGI Cloud version.',
        detail: `Installed: ${update.currentVersion}\nLatest published: ${update.version}`,
        buttons: ['OK'],
        defaultId: 0,
      };
      if (mainWindow) await dialog.showMessageBox(mainWindow, options);
      else await dialog.showMessageBox(options);
      return;
    }

    const options = {
      type: 'info' as const,
      title: 'AGI Cloud update available',
      message: `AGI Cloud ${update.version} is available.`,
      detail:
        `You have ${update.currentVersion}. Download the signed and notarized macOS installer, ` +
        'then replace AGI Cloud in Applications. This opens your browser and does not install automatically.',
      buttons: ['Download Installer', 'Later'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    };
    const result = mainWindow
      ? await dialog.showMessageBox(mainWindow, options)
      : await dialog.showMessageBox(options);
    if (result.response === 0) {
      await shell.openExternal(update.downloadUrl);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const options = {
      type: 'error' as const,
      title: 'Couldn’t check for updates',
      message: 'AGI Cloud update information is currently unavailable.',
      detail,
      buttons: ['OK'],
      defaultId: 0,
    };
    if (mainWindow) await dialog.showMessageBox(mainWindow, options);
    else await dialog.showMessageBox(options);
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.setName('AGI Cloud');
  app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);

  if (!DEEP_LINK_BRIDGE_ATTACHED) {
    console.warn(
      `[deep-link] registered as handler for ${DEEP_LINK_SCHEME}:// but renderer mode ` +
        `"${RENDERER_MODE}" attaches no IPC bridge, incoming links will be dropped.`,
    );
  }

  app.on('second-instance', (_event, argv) => {
    const link = argv.find((arg) => arg.startsWith(`${DEEP_LINK_SCHEME}://`));
    if (link) deliverDeepLink(link);
    focusMainWindow();
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

    const garnishHandlers = {
      onOpen: showMainWindow,
      onNewChat: openNewChat,
      onQuickAsk: () => toggleQuickAsk(mainWindow),
      onScreenshot: () => void captureToChat(mainWindow),
      onVoice: () => void toggleGlobalDictation(mainWindow),
      onCheckForUpdates: () => void checkForCloudUpdate(),
    };
    createTray(garnishHandlers);
    registerGarnishShortcuts({
      onQuickAsk: garnishHandlers.onQuickAsk,
      onScreenshot: garnishHandlers.onScreenshot,
      onVoice: garnishHandlers.onVoice,
    });

    setTimeout(warmUpQuickAsk, QUICK_ASK_WARMUP_MS).unref?.();

    app.on('activate', () => {
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

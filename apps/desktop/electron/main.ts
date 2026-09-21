import {
  BrowserWindow,
  Notification,
  app,
  clipboard,
  desktopCapturer,
  dialog,
  ipcMain,
  nativeTheme,
  protocol,
  screen,
  session,
  shell,
} from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  checkDesktopCloudUpdate,
  desktopCloudInstallerDownloadUrl,
  desktopUpdatePrompt,
  type DesktopCloudMacArchitecture,
  type DesktopUpdatePrompt,
} from './desktopCloudUpdate';
import {
  ELECTRON_IPC_CHANNELS,
  isElectronBridgeCommand,
  type ElectronDialogRequest,
  type ElectronNotifyRequest,
  type ElectronWindowControlRequest,
} from '../src/lib/tauri-electron/bridgeContract';
import {
  DESKTOP_RUNTIME_CHANNEL,
  DESKTOP_RUNTIME_EVENT_CHANNEL,
  type BrowserPairRequestPrompt,
  type BrowserPairingState,
  type HostCommand,
  type HostPreferences,
  type HostPreferencesState,
} from '@agiworkforce/local-runtime-contract';
import {
  BrowserBridgeError,
  pairingState,
  startBrowserBridge,
  stopBrowserBridge,
} from './browser/bridgeServer';
import { handleBridgeCommand } from './accountBridge';
import {
  configureWindowOpening,
  dispatch as dispatchDesktopRuntime,
  runBrowserCommand,
} from './runtime/dispatcher';
import { cancelAllShellRuns } from './runtime/shellService';
import {
  configureDeveloperSessions,
  stopAllDeveloperRuntimes,
} from './runtime/developerSessionService';
import {
  configureRemoteControl,
  relayDeveloperSessionEvent,
  stopRemoteControl,
} from './remote/remoteControlService';
import { approveDeviceCode, onShellIdentityReported, readShellIdentity } from './shellIdentity';
import {
  handBackComputerUse,
  stopComputerUseHelper,
  takeOverComputerUse,
} from './runtime/computerUseService';
import { installAppMenu } from './appMenu';
import { desktopDiagnostics, recordDesktopEvent } from './runtime/desktopTelemetryService';
import {
  planRendererRecovery,
  RENDERER_UNRESPONSIVE_GRACE_MS,
  resumeUrlAfterFault,
  type RendererFault,
  type RendererGoneReason,
} from './runtime/rendererRecovery';
import { crashScreen, offlineScreen, shellScreenUrl } from './shellScreens';
import { applyLaunchAtLogin, setLaunchAtLogin } from './launchAtLogin';
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
import {
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  SHORTCUT_KEYS,
  ZOOM_LEVEL_STEP,
  clampZoomLevel,
  fillsWorkArea,
  frameIsOnScreen,
  hostShortcutKeyFor,
  isAppearance,
  pickableCaptureSources,
  type WindowFrame,
} from './garnishCore';
import { destroyQuickAsk, toggleQuickAsk, warmUpQuickAsk } from './quickAsk';
import { captureToChat } from './screenshot';
import { getPreferences, getShortcuts, saveSettings } from './settingsStore';
import {
  registerGarnishShortcuts,
  shortcutRegistrations,
  unregisterGarnishShortcuts,
} from './shortcuts';
import { createTray, destroyTray } from './tray';
import { toggleGlobalDictation } from './voiceDictation';
import { applyRemoteWindowPolicy, openExternally } from './windowPolicy';
import { pageBackgroundColor, paintWindows, titleBarChrome } from './windowChrome';
import {
  NEW_CHAT_ROUTE,
  accountFingerprint,
  adoptAccount,
  frameWorthRemembering,
  rememberFrame,
  rememberRoute,
  resolveWindowRestore,
  routeFromUrl,
  shouldFallBackToRoot,
  type ShellWindowState,
  type WindowRestore,
} from './windowState';
import { patchShellWindowState, readShellWindowState } from './shellWindowStore';
import {
  broadcastRuntimeEvent,
  cascadeBounds,
  conversationIdFromRoute,
  planSignOut,
  planWindowOpen,
  resolveNavigationConflict,
  type OpenWindow,
} from './windowRegistry';
import { handleWorkspaceDrop } from './workspaceDrop';
import {
  isTrustedCloudRendererOrigin,
  shouldGrantCloudPermissionCheck,
  shouldGrantCloudPermissionRequest,
} from './permissionPolicy';

interface ShellWindowEntry {
  win: BrowserWindow;
  primary: boolean;
  route: string;
  /** Set while the shell is putting a window back after a conversation clash. */
  returningTo: string | null;
}

const shellWindows = new Map<number, ShellWindowEntry>();

let mainWindow: BrowserWindow | null = null;
let pendingDeepLink: string | null = null;

function liveWindows(): ShellWindowEntry[] {
  return [...shellWindows.values()].filter((entry) => !entry.win.isDestroyed());
}

function openWindows(): OpenWindow[] {
  return liveWindows().map((entry) => ({
    id: entry.win.id,
    primary: entry.primary,
    route: entry.route,
    bounds: entry.win.getBounds(),
  }));
}

function focusWindow(id: number): void {
  const entry = shellWindows.get(id);
  if (!entry || entry.win.isDestroyed()) return;
  if (entry.win.isMinimized()) entry.win.restore();
  entry.win.show();
  entry.win.focus();
}

function installedMacArchitecture(): DesktopCloudMacArchitecture {
  if (process.arch === 'arm64' || process.arch === 'x64') return process.arch;
  throw new Error(`Unsupported AGI Cloud macOS architecture: ${process.arch}`);
}

const QUICK_ASK_WARMUP_MS = 5000;

const SUPPORT_PATH = '/support';

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

/**
 * Which document may call the bridge.
 *
 * Main-frame only, so an embedded iframe never reaches it, and then the origin
 * must be one this build serves: the bundled `agi://cloud` renderer, or the
 * cloud app itself when the window is wrapping the website.
 *
 * `windowPolicy.ts` deliberately allows top-level navigation to the sign-in
 * providers, Google, Microsoft, Apple and Clerk, because that is how OAuth
 * completes. The preload is attached to the webContents rather than to a page,
 * so it runs on those documents too. This is what stops them calling in: a
 * script on an identity provider's page is not the audience for the account
 * bridge, and the check lives here rather than in the preload because the main
 * process is the side that cannot be lied to about who is calling.
 */
function isTrustedSender(event: Electron.IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) return false;
  if (frame.url.startsWith(`${RENDERER_ORIGIN}/`) || frame.url === RENDERER_ORIGIN) return true;
  if (RENDERER_MODE !== 'remote') return false;
  try {
    return new URL(frame.url).origin === new URL(CLOUD_APP_ORIGIN).origin;
  } catch {
    return false;
  }
}

function sendRuntimeEvent(event: unknown): void {
  broadcastRuntimeEvent(
    liveWindows().map((entry) => entry.win.webContents),
    DESKTOP_RUNTIME_EVENT_CHANNEL,
    event,
  );
}

/**
 * The pairing code never crosses the loopback bridge: the extension asks, and
 * the code is shown here, so only someone looking at this Mac can finish the
 * handshake.
 */
async function startPairingBridge(): Promise<void> {
  const extraDirectories = (process.env['AGI_CLOUD_EXTRA_NATIVE_HOST_DIRS'] ?? '')
    .split(':')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  try {
    await startBrowserBridge({
      onStateChanged: (state: BrowserPairingState) =>
        sendRuntimeEvent({ kind: 'browser-pairing-changed', state }),
      onPairRequest: (prompt: BrowserPairRequestPrompt) => {
        showMainWindow();
        if (Notification.isSupported()) {
          new Notification({
            title: 'Pair Chrome with AGI Cloud',
            body: `Pairing code ${prompt.code}. Type it in the extension within two minutes.`,
          }).show();
        }
      },
      appVersion: app.getVersion(),
      // The bridge holds the routes; the gate lives with the renderer's own
      // dispatch. Injected here so neither module has to import the other.
      runBrowserCommand: async (command, args, caller) => {
        try {
          const outcome = await runBrowserCommand(mainWindow, command, args, caller);
          return outcome.ok
            ? { ok: true, value: outcome.value }
            : { ok: false, error: outcome.error.message, code: outcome.error.code };
        } catch (error) {
          // The bridge rejects when the extension never answered, when the
          // page refused, and when the bridge closed under a waiting command.
          // It says which; reporting all three as a timeout told the user to
          // check that Chrome was running when the real answer was that the
          // site was not approved.
          return {
            ok: false,
            error: error instanceof Error ? error.message : 'The browser did not answer.',
            code:
              error instanceof BrowserBridgeError && typeof error.code === 'string'
                ? error.code
                : 'timeout',
          };
        }
      },
      ...(extraDirectories.length > 0 ? { extraManifestDirectories: extraDirectories } : {}),
    });
    recordDesktopEvent({ domain: 'local_daemon', outcome: 'ok' });
  } catch (error) {
    // The bridge is the one part of the shell another app on this machine can
    // take from it, so the refusal names that rather than reading as a fault
    // here. The state event carries it to the Capabilities panel, which would
    // otherwise show a bridge that is simply not listening, with nothing
    // anywhere saying why.
    console.warn('[browser-bridge] could not start the pairing bridge:', error);
    recordDesktopEvent({
      domain: 'local_daemon',
      outcome: 'failed',
      cause: error instanceof BrowserBridgeError ? 'not_configured' : 'unknown',
    });
    sendRuntimeEvent({
      kind: 'browser-pairing-changed',
      state: pairingState(),
      unavailable:
        error instanceof BrowserBridgeError
          ? error.message
          : 'This app could not open the browser bridge on this computer. Reopen it to try again.',
    });
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(DESKTOP_RUNTIME_CHANNEL, async (event, command, args) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted bridge caller.');
    if (typeof command !== 'string') throw new Error('Unknown runtime command.');
    const safeArgs =
      args && typeof args === 'object' && !Array.isArray(args)
        ? (args as Record<string, unknown>)
        : undefined;
    // The window that asked, so an approval sheet opens on the window the user
    // is looking at rather than on whichever one was created first.
    const caller = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
    return dispatchDesktopRuntime(caller, command, safeArgs);
  });

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
    const target =
      typeof req.deepLink === 'string' && req.deepLink.startsWith(`${DEEP_LINK_SCHEME}://`)
        ? req.deepLink
        : null;
    notification.on('click', () => {
      focusMainWindow();
      if (target) mainWindow?.webContents.send(ELECTRON_IPC_CHANNELS.deepLink, target);
    });
    notification.show();
  });

  ipcMain.handle(ELECTRON_IPC_CHANNELS.workspaceDrop, async (event, paths) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted bridge caller.');
    if (!Array.isArray(paths)) return;
    const candidates = paths.filter((path): path is string => typeof path === 'string');
    await handleWorkspaceDrop(BrowserWindow.fromWebContents(event.sender), candidates);
  });

  /**
   * The page's theme decides the appearance of this process's own dialogs.
   *
   * macOS draws a message box from the process appearance, not from the page's
   * stylesheet, so a user on the light theme was getting a dark permission
   * prompt and the Settings theme control could not reach it. "system" hands
   * the decision back to macOS, which is what the user asked for there.
   */
  ipcMain.handle(ELECTRON_IPC_CHANNELS.rendererTheme, async (event, theme) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted bridge caller.');
    if (!isAppearance(theme)) return;
    nativeTheme.themeSource = theme;
    paintWindowsForTheme();
    if (getPreferences().appearance !== theme) saveSettings({ appearance: theme });
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

  ipcMain.handle(ELECTRON_IPC_CHANNELS.hostPreferences, async (event, patch) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted bridge caller.');
    if (patch === null || patch === undefined) return hostPreferencesState();
    if (typeof patch !== 'object' || Array.isArray(patch)) {
      throw new Error('A preferences write takes an object.');
    }
    return writeHostPreferences(patch as Partial<HostPreferences>);
  });
}

// Both modes attach a preload, so both have an IPC receiver for a deep link.
const DEEP_LINK_BRIDGE_ATTACHED = true;

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
    showMainWindow();
    return;
  }

  if (mainWindow && !mainWindow.webContents.isLoading()) {
    focusMainWindow();
    mainWindow.webContents.send(ELECTRON_IPC_CHANNELS.deepLink, url);
  } else {
    pendingDeepLink = url;
    showMainWindow();
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
        .getSources({ types: ['screen', 'window'] })
        .then(async (sources) => {
          const offered = pickableCaptureSources(sources);
          if (offered.length === 0) {
            callback({});
            return;
          }
          const cancelId = offered.length;
          const selection = await dialog.showMessageBox({
            type: 'question',
            title: 'Share a screen or window',
            message: 'Choose what to share with AGI Cloud',
            detail:
              'A window shares only that window, even when something else is in front of it. Sharing stops when you end screen capture in the chat.',
            buttons: [...offered.map((source) => source.name), 'Cancel'],
            defaultId: 0,
            cancelId,
            noLink: true,
          });
          const source = offered[selection.response];
          callback(source ? { video: source } : {});
        })
        .catch(() => callback({}));
    },
    { useSystemPicker: true },
  );
}

/**
 * A renderer that dies or stops answering left a blank window behind and no
 * record of it. It now reloads once, explains itself if it dies again straight
 * away, and is counted either way.
 */
function installRendererRecovery(win: BrowserWindow, entryUrl: string): void {
  let previousFaultAt: number | null = null;

  const handle = (fault: RendererFault): void => {
    const plan = planRendererRecovery(fault, previousFaultAt, Date.now());
    if (plan.action === 'ignore') return;
    previousFaultAt = Date.now();
    recordDesktopEvent({ domain: 'crash', outcome: 'failed', cause: plan.cause });
    if (win.isDestroyed()) return;
    if (plan.action === 'reload') {
      void win.loadURL(resumeUrlAfterFault(win.webContents.getURL() || null, entryUrl));
      return;
    }
    // The page that failed twice may be the cause, so the way out is the entry.
    void win.loadURL(
      shellScreenUrl(crashScreen(plan.reference), entryUrl, nativeTheme.shouldUseDarkColors),
    );
  };

  win.webContents.on('render-process-gone', (_event, details) => {
    handle({ kind: 'gone', reason: details.reason as RendererGoneReason });
  });

  // A busy page reports unresponsive and then answers; only one that stays
  // silent past the grace is reloaded, so a slow moment never costs the page.
  let unresponsiveTimer: NodeJS.Timeout | null = null;
  const clearUnresponsiveTimer = (): void => {
    if (unresponsiveTimer) clearTimeout(unresponsiveTimer);
    unresponsiveTimer = null;
  };
  win.on('unresponsive', () => {
    if (unresponsiveTimer) return;
    unresponsiveTimer = setTimeout(() => {
      unresponsiveTimer = null;
      handle({ kind: 'unresponsive' });
    }, RENDERER_UNRESPONSIVE_GRACE_MS);
  });
  win.on('responsive', clearUnresponsiveTimer);
  win.on('closed', clearUnresponsiveTimer);
}

function paintWindowsForTheme(): void {
  paintWindows(BrowserWindow.getAllWindows(), nativeTheme.shouldUseDarkColors);
}

/**
 * Reads the shell's window state, seeding it once from the single frame the
 * preferences file used to hold so an upgrade does not lose the user's window.
 */
function loadWindowState(): ShellWindowState {
  const state = readShellWindowState();
  if (Object.keys(state.frames).length > 0) return state;
  const legacy: WindowFrame | null = getPreferences().windowFrame;
  if (!legacy) return state;
  const workAreas = screen.getAllDisplays().map((display) => display.workArea);
  if (!frameIsOnScreen(legacy, workAreas)) {
    recordDesktopEvent({
      domain: 'local_store_migration',
      outcome: 'refused',
      cause: 'unsupported',
    });
    return state;
  }
  recordDesktopEvent({ domain: 'local_store_migration', outcome: 'ok' });
  return rememberFrame(
    state,
    screen.getDisplayMatching(legacy),
    { ...legacy, maximized: legacy.maximized === true },
    Date.now(),
  );
}

function windowRestore(): WindowRestore {
  return resolveWindowRestore(loadWindowState(), screen.getAllDisplays());
}

let signedInAccount: string | null = null;

/**
 * The account switch that must not reopen the previous account's chat. The
 * route is dropped the moment a different account names itself.
 *
 * The session, the tokens and this fingerprint are all app-level, so an account
 * change in one window is an account change for the app. Every other window is
 * left showing a page the account behind it no longer owns, so they close and
 * the one that is kept returns to the root rather than to a stale conversation.
 */
function adoptReportedAccount(account: string | null): void {
  const changed = account !== signedInAccount;
  signedInAccount = account;
  patchShellWindowState(adoptAccount(readShellWindowState(), account));
  if (!changed) return;

  const plan = planSignOut(openWindows());
  for (const id of plan.close) {
    const entry = shellWindows.get(id);
    if (entry && !entry.win.isDestroyed()) entry.win.close();
  }
  const kept = plan.keep === null ? null : shellWindows.get(plan.keep);
  if (kept && !kept.win.isDestroyed() && conversationIdFromRoute(kept.route) !== null) {
    kept.route = NEW_CHAT_ROUTE;
    void kept.win.loadURL(windowUrlFor(null));
  }
}

/**
 * Follows the window's frame so a launch can put it back where it was, per
 * display: a frame is filed under the arrangement it was chosen on, so moving
 * between a laptop screen and a monitor stops overwriting one with the other.
 *
 * The restore size is only ever taken from a frame the user chose: a zoomed
 * window reports its own bounds as normal on macOS while it settles, and
 * writing that down is what makes a remembered window creep outwards a little
 * on every launch until it fills the screen.
 */
function followWindowFrame(win: BrowserWindow, restored: WindowRestore): () => void {
  let bounds = { ...restored.bounds };
  let maximized = restored.maximized;
  let pending: ReturnType<typeof setTimeout> | null = null;

  const persist = () => {
    const display = screen.getDisplayMatching(bounds);
    patchShellWindowState(
      rememberFrame(readShellWindowState(), display, { ...bounds, maximized }, Date.now()),
    );
    saveSettings({ windowFrame: { ...bounds, maximized } });
  };

  const readSettled = () => {
    const current = win.isDestroyed() ? bounds : win.getBounds();
    const settled = frameWorthRemembering(
      { bounds, maximized },
      {
        destroyed: win.isDestroyed(),
        minimized: !win.isDestroyed() && win.isMinimized(),
        fullScreen: !win.isDestroyed() && win.isFullScreen(),
        maximized: !win.isDestroyed() && win.isMaximized(),
        bounds: current,
        workArea: screen.getDisplayMatching(current).workArea,
      },
      fillsWorkArea,
    );
    bounds = settled.bounds;
    maximized = settled.maximized;
  };

  const schedule = () => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      readSettled();
      persist();
    }, 400);
    pending.unref?.();
  };

  win.on('resize', schedule);
  win.on('move', schedule);
  win.on('maximize', schedule);
  win.on('unmaximize', schedule);

  // Closing never reads the window. A zoom is still animating when the frame is
  // torn down, and the size it reports mid-animation is the one that would be
  // written down as the size to restore to.
  return () => {
    if (pending) clearTimeout(pending);
    persist();
  };
}

/**
 * The address a route is loaded from. Bundled serves the renderer's own bundle
 * and falls back to `index.html` for any path it has no file for, so the same
 * in-app route reaches the right screen in both modes.
 */
function windowUrlFor(route: string | null): string {
  if (RENDERER_MODE === 'remote') {
    return `${CLOUD_APP_ORIGIN}${route ?? NEW_CHAT_ROUTE}`;
  }
  return route === null || route === NEW_CHAT_ROUTE
    ? `${RENDERER_ORIGIN}/index.html`
    : `${RENDERER_ORIGIN}${route}`;
}

/**
 * Where a second window opens: stepped off the window that asked for it, on
 * that window's own display.
 */
function secondaryWindowBounds(): WindowFrame {
  const windows = openWindows();
  const anchor =
    windows.find((window) => window.id === BrowserWindow.getFocusedWindow()?.id) ??
    windows.find((window) => window.primary) ??
    windows[0];
  const base = anchor?.bounds ?? windowRestore().bounds;
  const display = screen.getDisplayMatching(base);
  const bounds = cascadeBounds(
    base,
    windows.map((window) => window.bounds),
    display.workArea,
  );
  return { ...bounds, maximized: false };
}

function createShellWindow(options: { primary: boolean; route?: string | null }): BrowserWindow {
  const isRemote = RENDERER_MODE === 'remote';
  const restore = windowRestore();
  const startBounds = options.primary ? restore.bounds : secondaryWindowBounds();

  const win = new BrowserWindow({
    width: startBounds.width,
    height: startBounds.height,
    x: startBounds.x,
    y: startBounds.y,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    show: false,
    backgroundColor: pageBackgroundColor(nativeTheme.shouldUseDarkColors),
    ...titleBarChrome(process.platform),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // The preload is attached in BOTH modes now. Remote used to go without
      // one, which is why deep links, the account bridge and the update check
      // were all dead there; the window was a browser tab pointed at the site.
      // `preload.ts` only exposes the bridge on the app's own origin, so the
      // sign-in providers `windowPolicy.ts` allows do not receive it.
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: [
        `--agi-app-version=${app.getVersion()}`,
        `--agi-app-origin=${CLOUD_APP_ORIGIN}`,
      ],
      // Remote keeps a persistent partition so the site's session survives a
      // restart. Bundled has no cross-origin session to keep.
      ...(isRemote ? { partition: REMOTE_SESSION_PARTITION } : {}),
    },
  });

  applyRemoteWindowPolicy(win);

  const entryRoute = options.primary ? (isRemote ? restore.route : null) : (options.route ?? null);
  const entry: ShellWindowEntry = {
    win,
    primary: options.primary,
    route: entryRoute ?? NEW_CHAT_ROUTE,
    returningTo: null,
  };
  shellWindows.set(win.id, entry);

  // `windowState.ts` keeps one frame per display arrangement, so the primary is
  // the only window that writes it. Letting every window write would leave the
  // remembered position belonging to whichever one happened to move last.
  if (options.primary) {
    mainWindow = win;
    if (restore.maximized) win.maximize();
    const flushWindowFrame = followWindowFrame(win, restore);
    win.on('close', flushWindowFrame);
  }

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show();
  });

  if (options.primary) {
    win.webContents.once('did-finish-load', () => {
      if (pendingDeepLink) {
        const url = pendingDeepLink;
        pendingDeepLink = null;
        win.webContents.send(ELECTRON_IPC_CHANNELS.deepLink, url);
      }
    });
  }

  // Chromium's zoom is per origin and per session, so it survives a navigation
  // but not a relaunch. Reapplying it on every load is what makes View > Zoom
  // In outlive quitting the app.
  win.webContents.on('did-finish-load', () => {
    if (!win.isDestroyed()) win.webContents.setZoomLevel(getPreferences().zoomLevel);
  });

  win.on('closed', () => {
    shellWindows.delete(win.id);
    if (!options.primary) return;
    mainWindow = null;
    if (process.platform !== 'darwin') destroyQuickAsk();
  });

  paintWindowsForTheme();

  const rootUrl = windowUrlFor(null);
  const entryUrl = windowUrlFor(entryRoute);

  if (isRemote) {
    const followRoute = (_event: unknown, url: string, httpStatusCode?: number) => {
      // A restored conversation deleted elsewhere must not become the page the
      // app opens on, so a not-found answer sends the window to the root. The
      // root answering the same way is not something a second load can fix.
      if (shouldFallBackToRoot(httpStatusCode) && url !== rootUrl) {
        entry.route = NEW_CHAT_ROUTE;
        if (options.primary) {
          patchShellWindowState(rememberRoute(readShellWindowState(), null, signedInAccount));
        }
        void win.loadURL(rootUrl);
        return;
      }
      const route = routeFromUrl(url, CLOUD_APP_ORIGIN);
      if (!route) return;

      // The window the shell is putting back after a clash has already been
      // decided; re-judging that navigation would send it back again forever.
      if (entry.returningTo === route) {
        entry.returningTo = null;
        entry.route = route;
        return;
      }

      const clash = resolveNavigationConflict(openWindows(), win.id, route);
      if (clash) {
        const previous = entry.route;
        entry.returningTo = previous;
        focusWindow(clash.focus);
        void win.loadURL(windowUrlFor(previous));
        return;
      }

      entry.route = route;
      installMenu();
      if (options.primary) {
        patchShellWindowState(rememberRoute(readShellWindowState(), route, signedInAccount));
      }
    };
    win.webContents.on('did-navigate', followRoute);
    win.webContents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (isMainFrame) followRoute(_event, url);
    });
  }

  win.webContents.on(
    'did-fail-load',
    (_event, errorCode, _description, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      if (errorCode === -3) return;
      if (validatedURL.startsWith('data:')) return;
      recordDesktopEvent({ domain: 'cloud_request', outcome: 'failed', cause: 'network' });
      void win.loadURL(
        shellScreenUrl(offlineScreen(errorCode), entryUrl, nativeTheme.shouldUseDarkColors),
      );
    },
  );

  installRendererRecovery(win, entryUrl);

  void win.loadURL(entryUrl);
  return win;
}

function createMainWindow(): void {
  createShellWindow({ primary: true });
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  focusMainWindow();
}

/**
 * Opens a route in a window of its own, or raises the window already on it.
 *
 * Refusing an unopenable route rather than loading it is what keeps a
 * `javascript:` or cross-origin string from becoming a window: the page asks
 * for this over the runtime channel, and the shell decides.
 */
function openRouteInNewWindow(route: string): boolean {
  const plan = planWindowOpen(openWindows(), route);
  if (plan.action === 'refuse') return false;
  if (plan.action === 'focus') {
    focusWindow(plan.windowId);
    return true;
  }
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  createShellWindow({ primary: false, route: plan.route });
  return true;
}

/** The conversation the front window is on, or null when it is not on one. */
function focusedConversationRoute(): string | null {
  const focused = BrowserWindow.getFocusedWindow();
  const entry =
    (focused ? shellWindows.get(focused.id) : null) ?? shellWindows.get(mainWindow?.id ?? -1);
  if (!entry) return null;
  return conversationIdFromRoute(entry.route) === null ? null : entry.route;
}

function openNewChat(): void {
  showMainWindow();
  void mainWindow?.loadURL(windowUrlFor(null));
}

function openNewWindow(): void {
  createShellWindow({ primary: false, route: null });
}

function openFocusedConversationInNewWindow(): void {
  const route = focusedConversationRoute();
  if (route === null) return;
  const focused = BrowserWindow.getFocusedWindow();
  const entry = focused ? shellWindows.get(focused.id) : null;
  if (entry) {
    entry.route = NEW_CHAT_ROUTE;
    void entry.win.loadURL(windowUrlFor(null));
  }
  createShellWindow({ primary: false, route });
}

function openSettings(): void {
  showMainWindow();
  if (RENDERER_MODE !== 'remote') return;
  void mainWindow?.loadURL(`${CLOUD_APP_ORIGIN}/settings`);
}

function openLogsFolder(): void {
  void shell.openPath(app.getPath('logs'));
}

/**
 * What a support report needs and nothing else: the build, and how each part of
 * the shell has behaved this run. No route, account, workspace or file name.
 */
function copyDiagnostics(): void {
  clipboard.writeText(JSON.stringify(desktopDiagnostics(), null, 2));
  if (!Notification.isSupported()) return;
  new Notification({
    title: 'Diagnostics copied',
    body: 'A summary of this session is on your clipboard. Paste it into your support message.',
  }).show();
}

const garnishHandlers = {
  onOpen: showMainWindow,
  onNewChat: openNewChat,
  onQuickAsk: () => toggleQuickAsk(mainWindow),
  onScreenshot: () => void captureToChat(mainWindow),
  onVoice: () => void toggleGlobalDictation(mainWindow),
  onCheckForUpdates: () => void checkForCloudUpdate(),
};

function applyGarnishShortcuts(): void {
  unregisterGarnishShortcuts();
  registerGarnishShortcuts({
    onQuickAsk: garnishHandlers.onQuickAsk,
    onScreenshot: garnishHandlers.onScreenshot,
    onVoice: garnishHandlers.onVoice,
  });
}

/**
 * What the hosted settings panel sees.
 *
 * The status is read back from the registration rather than assumed from the
 * write: a chord the OS refused is a preference that saved and a shortcut that
 * does not work, and the panel has to be able to say which.
 */
function hostPreferencesState(): HostPreferencesState {
  const preferences = getPreferences();
  const shortcuts = getShortcuts();
  const registrations = shortcutRegistrations();

  return {
    preferences: {
      launchAtLogin: preferences.launchAtLogin,
      showInMenuBar: preferences.showInMenuBar,
      cliPath: preferences.cliPath,
      quickAskShortcut: shortcuts.quickAskShortcut,
      screenshotShortcut: shortcuts.screenshotShortcut,
      voiceShortcut: shortcuts.voiceShortcut,
    },
    shortcutStatus: Object.fromEntries(
      SHORTCUT_KEYS.map((key) => [
        hostShortcutKeyFor(key),
        shortcuts[key] === ''
          ? 'off'
          : (registrations.find((registration) => registration.key === key)?.status ?? 'off'),
      ]),
    ) as HostPreferencesState['shortcutStatus'],
  };
}

function writeHostPreferences(patch: Partial<HostPreferences>): HostPreferencesState {
  const before = getPreferences();

  if ('launchAtLogin' in patch && typeof patch.launchAtLogin === 'boolean') {
    setLaunchAtLogin(patch.launchAtLogin);
  }

  const shortcutPatch = Object.fromEntries(
    SHORTCUT_KEYS.filter((key) => typeof patch[key] === 'string').map((key) => [key, patch[key]]),
  );
  if (Object.keys(shortcutPatch).length > 0) {
    saveSettings(shortcutPatch);
    applyGarnishShortcuts();
  }

  if (typeof patch.cliPath === 'string' && patch.cliPath.trim() !== before.cliPath) {
    saveSettings({ cliPath: patch.cliPath.trim() });
  }

  if (typeof patch.showInMenuBar === 'boolean' && patch.showInMenuBar !== before.showInMenuBar) {
    saveSettings({ showInMenuBar: patch.showInMenuBar });
    if (patch.showInMenuBar) createTray(garnishHandlers);
    else destroyTray();
  }

  return hostPreferencesState();
}

function openSupport(): void {
  openExternally(`${CLOUD_APP_ORIGIN}${SUPPORT_PATH}`);
}

/**
 * The window a menu command acts on: the one in front, and the primary only
 * when nothing is. A menu bar belongs to the front window, so sending Back or
 * Toggle Sidebar to the first window ever created would act on a surface the
 * user is not looking at.
 */
function frontWindow(): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && shellWindows.has(focused.id) && !focused.isDestroyed()) return focused;
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

/**
 * A menu item the page is the only thing that can carry out. The window is
 * raised first: choosing Toggle Sidebar from the menu bar while the window is
 * behind something else would otherwise change a surface the user cannot see.
 */
function sendHostCommand(command: HostCommand): void {
  const target = frontWindow();
  if (!target) {
    showMainWindow();
    mainWindow?.webContents.send(ELECTRON_IPC_CHANNELS.hostCommand, command);
    return;
  }
  focusWindow(target.id);
  target.webContents.send(ELECTRON_IPC_CHANNELS.hostCommand, command);
}

function goBack(): void {
  const history = frontWindow()?.webContents.navigationHistory;
  if (history?.canGoBack()) history.goBack();
}

function goForward(): void {
  const history = frontWindow()?.webContents.navigationHistory;
  if (history?.canGoForward()) history.goForward();
}

/**
 * Zoom is a preference, not a property of one window: the stored level is what
 * every window reapplies on load, so a window opened later is at the size the
 * user chose rather than at the default.
 */
function applyZoomLevel(level: number): void {
  const clamped = clampZoomLevel(level);
  saveSettings({ zoomLevel: clamped });
  for (const entry of liveWindows()) entry.win.webContents.setZoomLevel(clamped);
}

function stepZoomLevel(steps: number): void {
  applyZoomLevel(getPreferences().zoomLevel + steps * ZOOM_LEVEL_STEP);
}

async function checkForCloudUpdate(): Promise<void> {
  let prompt: DesktopUpdatePrompt;
  try {
    const update = await checkDesktopCloudUpdate(app.getVersion(), installedMacArchitecture());
    recordDesktopEvent({ domain: 'updater', outcome: 'ok' });
    prompt = desktopUpdatePrompt(update);
    const chosen = await showUpdatePrompt(prompt);
    if (prompt.downloadButton !== null && chosen === prompt.downloadButton) {
      await shell.openExternal(update.downloadUrl);
    }
    return;
  } catch (error) {
    recordDesktopEvent({ domain: 'updater', outcome: 'failed', cause: 'network' });
    prompt = desktopUpdatePrompt({
      failure: error instanceof Error ? error.message : String(error),
    });
  }
  await showUpdatePrompt(prompt);
}

async function showUpdatePrompt(prompt: DesktopUpdatePrompt): Promise<number> {
  const options = {
    type: prompt.type,
    title: prompt.title,
    message: prompt.message,
    detail: prompt.detail,
    buttons: [...prompt.buttons],
    defaultId: 0,
    ...(prompt.buttons.length > 1 ? { cancelId: prompt.buttons.length - 1, noLink: true } : {}),
  };
  const result = mainWindow
    ? await dialog.showMessageBox(mainWindow, options)
    : await dialog.showMessageBox(options);
  return result.response;
}

function installMenu(): void {
  installAppMenu(
    {
      newChat: garnishHandlers.onNewChat,
      newWindow: openNewWindow,
      openConversationInNewWindow: openFocusedConversationInNewWindow,
      hasFocusedConversation: () => focusedConversationRoute() !== null,
      toggleQuickAsk: garnishHandlers.onQuickAsk,
      captureScreenshot: garnishHandlers.onScreenshot,
      openSettings,
      openLogs: openLogsFolder,
      copyDiagnostics,
      openSupport,
      checkForUpdates: garnishHandlers.onCheckForUpdates,
      sendHostCommand,
      goBack,
      goForward,
      setZoomLevel: applyZoomLevel,
      stepZoomLevel,
      takeOverScreen: () => void takeOverComputerUse(),
      handBackScreen: () => void handBackComputerUse(),
    },
    {
      quickAsk: getShortcuts().quickAskShortcut,
      screenshot: getShortcuts().screenshotShortcut,
    },
  );
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
    showMainWindow();
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    deliverDeepLink(url);
  });

  void app.whenReady().then(() => {
    // The IPC handlers are registered in both modes. They used to be inside
    // the bundled branch, so the remote window had a preload with nothing on
    // the other end of it. `isTrustedSender` is what decides who may call, not
    // which mode we booted in.
    recordDesktopEvent({ domain: 'launch', outcome: 'started' });
    registerIpcHandlers();
    configureWindowOpening(openRouteInNewWindow);
    signedInAccount = readShellWindowState().lastAccount;
    onShellIdentityReported((identity) => adoptReportedAccount(accountFingerprint(identity)));
    nativeTheme.themeSource = getPreferences().appearance;
    nativeTheme.on('updated', paintWindowsForTheme);
    if (RENDERER_MODE === 'bundled') {
      protocol.handle(RENDERER_SCHEME, serveRenderer);
      configureSession(session.defaultSession);
    } else {
      configureSession(session.fromPartition(REMOTE_SESSION_PARTITION));
    }

    createMainWindow();

    if (getPreferences().showInMenuBar) createTray(garnishHandlers);
    installMenu();
    // The Window menu says whether the front window is on a conversation, so it
    // is rebuilt when the front window changes rather than once at launch.
    app.on('browser-window-focus', installMenu);
    app.on('browser-window-blur', installMenu);
    applyLaunchAtLogin();
    applyGarnishShortcuts();

    configureRemoteControl((state) => sendRuntimeEvent({ kind: 'remote-control-changed', state }));
    configureDeveloperSessions({
      emit: (rootId, event) => {
        sendRuntimeEvent({ kind: 'developer-session', rootId, event });
        relayDeveloperSessionEvent(rootId, event);
      },
      resolveBinary: () => getPreferences().cliPath,
      accountBridge: { readShellIdentity, approveDeviceCode },
    });

    setTimeout(warmUpQuickAsk, QUICK_ASK_WARMUP_MS).unref?.();
    void startPairingBridge();
    recordDesktopEvent({ domain: 'launch', outcome: 'ok' });

    app.on('activate', () => {
      showMainWindow();
    });
  });

  app.on('will-quit', () => {
    unregisterGarnishShortcuts();
    cancelAllShellRuns();
    stopRemoteControl();
    stopAllDeveloperRuntimes();
    stopComputerUseHelper();
    void stopBrowserBridge();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

import {
  noteLocalRoutineEvent,
  startLocalRoutines,
  stopLocalRoutines,
} from './runtime/localRoutineService';
import {
  BrowserWindow,
  Notification,
  app,
  clipboard,
  desktopCapturer,
  ipcMain,
  nativeTheme,
  powerSaveBlocker,
  screen,
  session,
  shell,
  systemPreferences,
} from 'electron';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import {
  LOCAL_CODE_SESSION_ACTIVITY_PATH,
  type LocalCodeSessionActivity,
} from '@agiworkforce/cloud-contracts';
import { CLOUD_CODE_PAGE_ROUTE, REMOTE_CODE_LIMITS } from '@agiworkforce/types';
import {
  checkDesktopCloudUpdate,
  desktopCloudInstallerDownloadUrl,
  desktopUpdatePrompt,
  type DesktopCloudMacArchitecture,
  type DesktopCloudUpdateAvailability,
  type DesktopUpdatePrompt,
} from './desktopCloudUpdate';
import {
  autoUpdateSupported,
  checkForAutoUpdate,
  downloadedUpdate,
  installDownloadedUpdate,
  startAutoUpdate,
} from './desktopAutoUpdate';
import {
  ELECTRON_IPC_CHANNELS,
  type ElectronNotifyRequest,
} from '../src/lib/tauri-electron/bridgeContract';
import {
  NO_HOST_SHORTCUT,
  DESKTOP_RUNTIME_CHANNEL,
  DESKTOP_RUNTIME_EVENT_CHANNEL,
  type BrowserPairRequestPrompt,
  effectiveAgentNotifications,
  type HostAgentNotificationPreferences,
  localSessionPath,
  type BrowserPairingState,
  type HostCommand,
  type HostPreferences,
  type HostPreferencesState,
  type HostRestartOutcome,
} from '@agiworkforce/local-runtime-contract';
import {
  BrowserBridgeError,
  pairingState,
  startBrowserBridge,
  stopBrowserBridge,
} from './browser/bridgeServer';
import {
  dispatch as dispatchDesktopRuntime,
  noteDeveloperSessionEvent as noteDispatcherSessionEvent,
  runBrowserCommand,
  windowAnswersUserInput,
} from './runtime/dispatcher';
import { activeShellRunCount, cancelAllShellRuns } from './runtime/shellService';
import {
  answerDeveloperApproval,
  configureDeveloperSessions,
  interruptDeveloperTurn,
  killAllDeveloperRuntimes,
  readDeveloperSession,
  readPendingApproval,
  resolveBinaryPath,
} from './runtime/developerSessionService';
import {
  configureRemoteControl,
  relayDeveloperSessionEvent,
  remoteControlActive,
  remoteControlState,
  stopRemoteControl,
} from './remote/remoteControlService';
import { getRoot, listRoots } from './runtime/workspaceStore';
import { agentAllowedIn, agentConsentAt } from './runtime/agentAccess';
import { NOT_THIS_APP, shownValue } from './runtime/dialogText';
import { createNativeNotification, showNativeMessage } from './runtime/nativeSurface';
import { askNativeQuestion, NOT_ASKED_MESSAGES } from './runtime/nativeQuestions';
import { getPermissionState } from './runtime/permissionManager';
import {
  approveDeviceCode,
  onShellIdentityReported,
  postAsShellAccount,
  readShellIdentity,
} from './shellIdentity';
import { createCodeSessionActivity } from '@agiworkforce/utils/remote-control';
import {
  noteDeveloperSessionEvent as noteBackgroundSessionEvent,
  spawnTrackedDeveloperRuntime,
} from './runtime/backgroundActivity';
import {
  computerUsePhase,
  computerUseStatus,
  configureComputerUse,
  handBackComputerUse,
  shutDownComputerUse,
  stopComputerUse,
  takeOverComputerUse,
} from './runtime/computerUseSession';
import {
  createAgentNotifier,
  type AgentActivity,
  type NotificationLike,
  type NotificationOptionsLike,
} from './agentNotifications';
import {
  enqueueDeepLink,
  freshDeepLinks,
  loadDeepLinkQueue,
  mergeDeepLinkQueues,
  saveDeepLinkQueue,
  type QueuedDeepLink,
} from './deepLinkQueue';
import {
  GUARD_CONFIRM_INDEX,
  quitPrompt,
  revokeComputerUsePrompt,
  stopAgentsPrompt,
  type GuardPrompt,
  type LiveWork,
} from './quitGuard';
import { installAppMenu, installDockMenu } from './appMenu';
import { readBrowserSignInLink } from './browserSignIn';
import { approvedRootFor, readLocalThreadLink, type LocalThreadLink } from './localThreadLink';
import { configureDevicePrompts } from './runtime/devicePrompts';
import { desktopDiagnostics, recordDesktopEvent } from './runtime/desktopTelemetryService';
import {
  planRendererRecovery,
  RENDERER_UNRESPONSIVE_GRACE_MS,
  resumeUrlAfterFault,
  type RendererFault,
  type RendererGoneReason,
} from './runtime/rendererRecovery';
import {
  crashScreen,
  offlineScreen,
  retryUrlAfterFailedLoad,
  shellScreenUrl,
} from './shellScreens';
import { applyLaunchAtLogin, setLaunchAtLogin } from './launchAtLogin';
import { CLOUD_APP_ORIGIN, DEEP_LINK_SCHEME, REMOTE_SESSION_PARTITION } from './config';
import {
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  SHORTCUT_LABELS,
  SHORTCUT_KEYS,
  ZOOM_LEVEL_STEP,
  clampZoomLevel,
  fillsWorkArea,
  frameIsOnScreen,
  hostShortcutKeyFor,
  isAppearance,
  isSessionCompletionAlerts,
  normalizeAgentNotifications,
  pickableCaptureSources,
  pageMayWriteShortcut,
  shortcutMayBeOff,
  type ShortcutKey,
  type WindowFrame,
} from './garnishCore';
import {
  configureQuickAskBridge,
  configureQuickAskHandoff,
  destroyQuickAsk,
  toggleQuickAsk,
  warmUpQuickAsk,
} from './quickAsk';
import { deliverBrowserHandoff } from './browserHandoff';
import { focusComposerWhenReady } from './composerFocus';
import { captureToChat, captureWindowToChat } from './screenshot';
import {
  applicationTakingInput,
  frontWindowIdOutside,
  typeForUser,
} from './runtime/computerUseService';
import { configureDictationBarBridge, openDictationBar } from './dictationBar';
import { createDictationElsewhere } from './dictationElsewhere';
import { getPreferences, getShortcuts, saveSettings } from './settingsStore';
import {
  registerGarnishShortcuts,
  shortcutRegistrations,
  shortcutStatusDetail,
  unregisterGarnishShortcuts,
} from './shortcuts';
import { createTray, destroyTray, hasTray, refreshTrayMenu, type TrayActivity } from './tray';
import { toggleGlobalDictation } from './voiceDictation';
import { applyRemoteWindowPolicy, openExternally } from './windowPolicy';
import { pageBackgroundColor, paintWindows, titleBarChrome } from './windowChrome';
import {
  NEW_CHAT_ROUTE,
  accountFingerprint,
  adoptAccount,
  frameWorthRemembering,
  isRestorableRoute,
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
  resolveNavigationConflict,
  type OpenWindow,
} from './windowRegistry';
import { handleWorkspaceDrop } from './workspaceDrop';
import { createWorkKeeper } from './workKeeper';
import {
  isTrustedCloudRendererOrigin,
  isTrustedPageUrl,
  showsTrustedPage,
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
const coldStartDeepLinks: string[] = [];
let deepLinkQueue: QueuedDeepLink[] = [];
let appReady = false;
let quitConfirmed = false;

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
const UPDATE_RESTART_TIMEOUT_MS = 60_000;

const SUPPORT_PATH = '/support';

/**
 * Which document may call the bridge.
 *
 * Main-frame only, so an embedded iframe never reaches it, and then the origin
 * must be the cloud app the window wraps.
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
  return isTrustedPageUrl(frame.url);
}

/**
 * A window can be showing a sign-in provider's page, where the preload still
 * runs. What main sends is for the app's own page, so a window showing
 * anything else is skipped, by the check `isTrustedSender` makes of a caller.
 */
function sendRuntimeEvent(event: unknown): void {
  broadcastRuntimeEvent(
    liveWindows()
      .map((entry) => entry.win.webContents)
      .filter(showsTrustedPage),
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
        // The code is shown here and nowhere a page can read it: typing it
        // into the extension is what says a person at this computer agreed.
        void showNativeMessage(mainWindow, {
          type: 'info',
          buttons: ['OK'],
          title: 'Pair Chrome with AGI Cloud',
          message: `Pairing code ${shownValue(prompt.code, PAIRING_CODE_SHOWN)}`,
          detail: `Type this code in the AGI extension in Chrome within two minutes. It pairs the extension with the ID below with this app, so the agent can use that browser when you allow it.\n\nExtension ID: ${shownValue(prompt.extensionId, PAIRING_CODE_SHOWN)}`,
          noLink: true,
        }).catch(() => undefined);
      },
      appVersion: app.getVersion(),
      // The bridge holds the routes; the gate lives with the renderer's own
      // dispatch. Injected here so neither module has to import the other.
      runBrowserCommand: async (command, args, caller, signal) => {
        try {
          const outcome = await runBrowserCommand(mainWindow, command, args, caller, signal);
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
      deliverToChat: (handoff) => {
        showMainWindow();
        return deliverBrowserHandoff(mainWindow, handoff);
      },
      ...(extraDirectories.length > 0 ? { extraManifestDirectories: extraDirectories } : {}),
    });
    recordDesktopEvent({ domain: 'local_daemon', outcome: 'ok' });
  } catch (error) {
    // The bridge is the one part of the shell another app on this machine can
    // take from it, so the refusal names that rather than reading as a fault
    // here. The pairing state carries the reason to the Capabilities panel,
    // which would otherwise show a bridge that is simply not listening, with
    // nothing anywhere saying why.
    console.warn('[browser-bridge] could not start the pairing bridge:', error);
    recordDesktopEvent({
      domain: 'local_daemon',
      outcome: 'failed',
      cause: error instanceof BrowserBridgeError ? 'not_configured' : 'unknown',
    });
    sendRuntimeEvent({ kind: 'browser-pairing-changed', state: pairingState() });
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
    try {
      return await dispatchDesktopRuntime(caller, command, safeArgs);
    } finally {
      if (command.startsWith(COMPUTER_COMMAND_PREFIX)) refreshTrayForComputerUse();
    }
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

  // The page cannot tell whether its window is in front: Chromium keeps a
  // hidden or minimized shell window "visible" to it, so the page asks and the
  // shell, which knows the window's real state, stays quiet while the user is
  // looking at the window that asked.
  ipcMain.handle(ELECTRON_IPC_CHANNELS.notify, async (event, request) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted bridge caller.');
    const req = (request ?? {}) as ElectronNotifyRequest;
    if (typeof req.title !== 'string' || req.title === '') return;
    if (!Notification.isSupported()) return;
    const asking = BrowserWindow.fromWebContents(event.sender);
    if (asking && !asking.isDestroyed() && asking.isVisible() && asking.isFocused()) return;
    const notification = createNativeNotification({
      title: req.title,
      ...(typeof req.body === 'string' ? { body: req.body } : {}),
    });
    const target =
      typeof req.deepLink === 'string' && req.deepLink.startsWith(`${DEEP_LINK_SCHEME}://`)
        ? req.deepLink
        : null;
    notification.on('click', () => {
      focusMainWindow();
      if (target) deliverDeepLink(target);
    });
    notification.show();
  });

  ipcMain.handle(ELECTRON_IPC_CHANNELS.dictationFinish, async (event, text) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted bridge caller.');
    return dictationElsewhere.finish(event.sender.id, text);
  });

  ipcMain.handle(ELECTRON_IPC_CHANNELS.dictationCancel, async (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted bridge caller.');
    dictationElsewhere.cancel(event.sender.id);
  });

  ipcMain.handle(ELECTRON_IPC_CHANNELS.workspaceDrop, async (event, paths) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted bridge caller.');
    if (!Array.isArray(paths)) return;
    const candidates = paths.filter((path): path is string => typeof path === 'string');
    await handleWorkspaceDrop(BrowserWindow.fromWebContents(event.sender), candidates, (rootId) =>
      sendRuntimeEvent({ kind: 'workspace-changed', rootId }),
    );
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

  ipcMain.handle(ELECTRON_IPC_CHANNELS.checkUpdate, async (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted bridge caller.');
    return cloudUpdateAvailability();
  });

  ipcMain.handle(ELECTRON_IPC_CHANNELS.openUpdateInstaller, async (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted bridge caller.');
    if (downloadedUpdate() !== null) {
      await restartToUpdate();
      return;
    }
    await shell.openExternal(desktopCloudInstallerDownloadUrl(installedMacArchitecture()));
  });

  ipcMain.handle(ELECTRON_IPC_CHANNELS.restartToUpdate, async (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted bridge caller.');
    return restartToUpdate();
  });

  ipcMain.handle(ELECTRON_IPC_CHANNELS.hostPreferences, async (event, patch) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted bridge caller.');
    if (patch === null || patch === undefined) return hostPreferencesState();
    if (typeof patch !== 'object' || Array.isArray(patch)) {
      throw new Error('A preferences write takes an object.');
    }
    const caller = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
    return writeHostPreferences(caller, patch as Partial<HostPreferences>);
  });
}

function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function deliverDeepLink(url: string): void {
  if (!url.startsWith(`${DEEP_LINK_SCHEME}://`)) return;
  if (!app.isReady()) {
    coldStartDeepLinks.push(url);
    return;
  }

  const signIn = readBrowserSignInLink(url);
  if (signIn.kind !== 'not-sign-in') {
    if (signIn.kind === 'ignored') return;
    showMainWindow();
    if (signIn.kind === 'complete') void mainWindow?.loadURL(signIn.url);
    if (signIn.kind === 'expired') sendRuntimeEvent({ kind: 'browser-sign-in-expired' });
    return;
  }

  const localThread = readLocalThreadLink(url);
  if (localThread.kind !== 'not-local') {
    if (localThread.kind === 'open') openLocalThreadFromLink(localThread);
    return;
  }

  deepLinkQueue = enqueueDeepLink(deepLinkQueue, url, Date.now());
  if (rendererReady()) {
    focusMainWindow();
    flushDeepLinks();
    return;
  }
  saveDeepLinkQueue(deepLinkQueuePath(), deepLinkQueue);
  if (appReady) showMainWindow();
}

const FOLDER_SHOWN = { head: 200, tail: 120 };

function openLocalThreadFromLink(link: Extract<LocalThreadLink, { kind: 'open' }>): void {
  const rootId = approvedRootFor(link.folder, listRoots());
  if (rootId !== null) {
    openLocalSession(rootId, link.threadId);
    return;
  }
  openRoute(CLOUD_CODE_PAGE_ROUTE);
  void showNativeMessage(mainWindow, {
    type: 'info',
    buttons: ['OK'],
    title: 'Folder not added',
    message: 'Add this folder in AGI Code first, then open the session again.',
    detail: `The session runs in ${shownValue(link.folder, FOLDER_SHOWN)}, which this app has not been allowed to open. Choose Add a folder in AGI Code.`,
    noLink: true,
  }).catch(() => undefined);
}

function deepLinkQueuePath(): string {
  return path.join(app.getPath('userData'), 'deep-link-queue.json');
}

/**
 * The offline and crash screens are `data:` pages with no deep-link receiver,
 * and a sign-in provider's page is not the app's, so a link waits for ours.
 */
function rendererReady(): boolean {
  return Boolean(
    mainWindow &&
    !mainWindow.isDestroyed() &&
    !mainWindow.webContents.isLoading() &&
    showsTrustedPage(mainWindow.webContents),
  );
}

/**
 * Hands the page every link that arrived while it could not take one, oldest
 * first. A link held across a relaunch is only replayed while it is still
 * recent: an approval link from yesterday is not something to act on now.
 */
function flushDeepLinks(): void {
  if (!mainWindow || !rendererReady()) return;
  const due = freshDeepLinks(deepLinkQueue, Date.now());
  deepLinkQueue = [];
  saveDeepLinkQueue(deepLinkQueuePath(), deepLinkQueue);
  for (const entry of due) mainWindow.webContents.send(ELECTRON_IPC_CHANNELS.deepLink, entry.url);
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
          const selection = await showNativeMessage(null, {
            type: 'question',
            title: 'Share a screen or window',
            message: 'Choose what to share with AGI Cloud',
            detail:
              'A window shares only that window, even when something else is in front of it. Sharing stops when you end screen capture in the chat.',
            buttons: [
              ...offered.map((source) => shownValue(source.name, CAPTURE_SOURCE_SHOWN)),
              'Cancel',
            ],
            defaultId: cancelId,
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
  if (remoteControlActive()) stopRemoteControl();

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

function windowUrlFor(route: string | null): string {
  return `${CLOUD_APP_ORIGIN}${route ?? NEW_CHAT_ROUTE}`;
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
      // `preload.ts` exposes the bridge on every document, including the
      // sign-in providers `windowPolicy.ts` allows; `isTrustedSender` is what
      // refuses their calls.
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: [
        `--agi-app-version=${app.getVersion()}`,
        `--agi-app-origin=${CLOUD_APP_ORIGIN}`,
      ],
      // A persistent partition so the site's session survives a restart.
      partition: REMOTE_SESSION_PARTITION,
    },
  });

  applyRemoteWindowPolicy(win);

  const entryRoute = options.primary ? restore.route : (options.route ?? null);
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

  // Not `did-finish-load`: the app's page still reports loading then, while its
  // sign-in frames finish, so a link held for the first load waited for a load
  // that never came and the app opened on its home page instead.
  if (options.primary) {
    win.webContents.on('did-stop-loading', flushDeepLinks);
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

  win.webContents.on(
    'did-fail-load',
    (_event, errorCode, _description, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      if (errorCode === -3) return;
      if (validatedURL.startsWith('data:')) return;
      recordDesktopEvent({ domain: 'cloud_request', outcome: 'failed', cause: 'network' });
      void win.loadURL(
        shellScreenUrl(
          offlineScreen(errorCode),
          retryUrlAfterFailedLoad(validatedURL, entryUrl),
          nativeTheme.shouldUseDarkColors,
        ),
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

async function reportCodeSessionActivity(activity: LocalCodeSessionActivity): Promise<void> {
  try {
    const response = await postAsShellAccount(LOCAL_CODE_SESSION_ACTIVITY_PATH, activity);
    recordDesktopEvent(
      response?.ok
        ? { domain: 'cloud_request', outcome: 'ok' }
        : { domain: 'cloud_request', outcome: 'failed', cause: 'unknown' },
    );
  } catch {
    recordDesktopEvent({ domain: 'cloud_request', outcome: 'failed', cause: 'network' });
  }
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  focusMainWindow();
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

const NEW_CHAT_COMPOSER_WAIT_MS = 5000;

/**
 * The global New Chat Window shortcut: the main window, in front, on a new
 * chat with the cursor in the composer. A window already on an untouched new
 * chat is only raised, so a draft typed there survives a second press.
 */
async function newChatFromShortcut(): Promise<void> {
  showMainWindow();
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  const entry = shellWindows.get(win.id);
  const onNewChat =
    entry?.route === NEW_CHAT_ROUTE &&
    showsTrustedPage(win.webContents) &&
    !win.webContents.isLoading();
  if (!onNewChat) {
    if (entry) entry.route = NEW_CHAT_ROUTE;
    await win.loadURL(windowUrlFor(null)).catch(() => undefined);
  }
  if (win.isDestroyed()) return;
  win.webContents.focus();
  await focusComposerWhenReady(win, NEW_CHAT_COMPOSER_WAIT_MS);
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

function frontShellWindow(): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow();
  return focused && shellWindows.has(focused.id) ? focused : null;
}

function setFrontWindowOnTop(onTop: boolean): void {
  frontShellWindow()?.setAlwaysOnTop(onTop, 'floating');
  installMenu();
}

function openSettings(): void {
  showMainWindow();
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
  createNativeNotification({
    title: 'Diagnostics copied',
    body: 'A summary of this session is on your clipboard. Paste it into your support message.',
  }).show();
}

/**
 * Raises the window already showing this session, or opens it in the main
 * window. A window already on it is not reloaded, so a draft in its composer
 * survives the click.
 */
function openLocalSession(rootId: string, threadId: string): void {
  openRoute(localSessionPath(rootId, threadId));
}

/**
 * A sign-in or other one-shot flow the panel was sent to is not replayed in the
 * main window, which already shows its own sign-in when the account is gone.
 */
function openRouteFromQuickAsk(route: string): void {
  if (isRestorableRoute(route)) openRoute(route);
  else showMainWindow();
}

function openRoute(route: string): void {
  const showing = liveWindows().find((entry) => entry.route === route);
  if (showing) {
    focusWindow(showing.win.id);
    return;
  }
  showMainWindow();
  const entry = mainWindow ? shellWindows.get(mainWindow.id) : undefined;
  if (!entry) return;
  entry.route = route;
  void entry.win.loadURL(windowUrlFor(route));
}

function sessionFolderName(rootId: string): string {
  return getRoot(rootId)?.name ?? 'a coding session';
}

function nativeNotification(options: NotificationOptionsLike): NotificationLike {
  const notification = createNativeNotification(options);
  return {
    onClick: (listener) => notification.on('click', listener),
    onAction: (listener) => notification.on('action', (details) => listener(details.actionIndex)),
    onClose: (listener) => notification.on('close', listener),
    show: () => notification.show(),
    close: () => notification.close(),
  };
}

function agentNotificationPreferences(): HostAgentNotificationPreferences {
  return effectiveAgentNotifications(getPreferences());
}

const workKeeper = createWorkKeeper({
  hold: () => {
    const id = powerSaveBlocker.start('prevent-app-suspension');
    return () => {
      if (powerSaveBlocker.isStarted(id)) powerSaveBlocker.stop(id);
    };
  },
});

function syncWorkKeeper(): void {
  workKeeper.update(
    agentNotifier.activity().runningTurns.length > 0 || remoteControlState().status === 'connected',
  );
}

const agentNotifier = createAgentNotifier({
  preferences: agentNotificationPreferences,
  appFocused: () => BrowserWindow.getFocusedWindow() !== null,
  supported: () => Notification.isSupported(),
  supportsActions: process.platform === 'darwin' || process.platform === 'win32',
  create: nativeNotification,
  answerApproval: answerDeveloperApproval,
  reviewApproval: readPendingApproval,
  openSession: openLocalSession,
  sessionLabel: sessionFolderName,
  onActivityChanged: (activity: AgentActivity) => {
    app.setBadgeCount(activity.pendingApprovals.length);
    syncTray();
    syncWorkKeeper();
  },
  onAnswerFailed: (error) => {
    console.warn('[agent-notifications] the approval answer did not reach the agent:', error);
  },
});

function trayActivity(): TrayActivity {
  const activity = agentNotifier.activity();
  return {
    pendingApprovals: activity.pendingApprovals.map((approval) => ({
      rootId: approval.rootId,
      threadId: approval.threadId,
      label: `${approval.summary} (${sessionFolderName(approval.rootId)})`,
    })),
    runningTurns: activity.runningTurns.map((turn) => ({
      rootId: turn.rootId,
      threadId: turn.threadId,
      label: `Coding in ${sessionFolderName(turn.rootId)}`,
    })),
    screenTakenOver: computerUsePhase() === 'paused',
    computerUseGranted: computerUseGranted(),
  };
}

function liveWork(): LiveWork {
  const remote = remoteControlState();
  return {
    shellRuns: activeShellRunCount(),
    agentTurns: agentNotifier.activity().runningTurns.length,
    remoteControl: { status: remote.status, phoneName: remote.phoneName },
  };
}

async function askGuardPrompt(prompt: GuardPrompt): Promise<boolean> {
  const parent = frontWindow();
  const result = await showNativeMessage(parent, prompt);
  return result.response === GUARD_CONFIRM_INDEX;
}

/**
 * Takes the screen back from computer use and interrupts every running agent
 * turn. Interrupting keeps what a turn already did, and the session can be
 * asked again, which is why the shortcut acts without asking first: it exists
 * for the moment an agent is doing something the user wants stopped now.
 */
function stopAgents(): number {
  const turns = agentNotifier.activity().runningTurns;
  takeOverComputerUse();
  for (const turn of turns) {
    void interruptDeveloperTurn(turn.rootId, turn.threadId, turn.turnId).catch((error: unknown) => {
      console.warn('[stop-agents] a turn did not stop:', error);
    });
  }
  refreshTrayMenu(garnishHandlers);
  return turns.length;
}

function stopAgentsFromShortcut(): void {
  const stopped = stopAgents();
  if (!Notification.isSupported()) return;
  const screenHeld = computerUsePhase() === 'paused';
  createNativeNotification({
    title:
      stopped > 0 ? 'Agents stopped' : screenHeld ? 'Screen control is yours' : 'Nothing to stop',
    body: [
      stopped === 0
        ? 'No agent turn was running.'
        : `Stopped ${stopped} running ${stopped === 1 ? 'turn' : 'turns'}.`,
      ...(screenHeld
        ? ['Agents cannot control the screen until you choose Hand Back Screen Control.']
        : []),
    ].join(' '),
  }).show();
}

async function confirmStopAll(): Promise<void> {
  const prompt = stopAgentsPrompt(liveWork());
  if (!prompt) return;
  if (await askGuardPrompt(prompt)) stopAgents();
}

const COMPUTER_COMMAND_PREFIX = 'computer_';
let trayComputerUseState = '';

function computerUseGranted(): boolean {
  return getPermissionState('computer.use', { kind: 'global' }) === 'granted';
}

function computerUseTrayState(): string {
  return `${computerUseGranted()}:${computerUsePhase()}`;
}

/**
 * A grant is given or withdrawn, and the screen taken over, by a computer-use
 * command, so the tray is rebuilt after one of those when the answer changed
 * rather than after every runtime call.
 */
function refreshTrayForComputerUse(): void {
  const state = computerUseTrayState();
  if (state === trayComputerUseState) return;
  trayComputerUseState = state;
  syncTray();
}

/**
 * The menu bar item is one of the two ways to stop an agent from outside its
 * own window, the Stop Agents shortcut being the other. The preference that
 * hides it is set from the settings page, which is a website, so it is
 * honoured only while there is nothing to stop: with an agent turn running,
 * or the agent allowed to use the screen, the item stays.
 */
function trayNeeded(): boolean {
  return (
    getPreferences().showInMenuBar ||
    computerUseGranted() ||
    agentNotifier.activity().runningTurns.length > 0
  );
}

function syncTray(): void {
  if (!trayNeeded()) {
    destroyTray();
    return;
  }
  if (hasTray()) refreshTrayMenu(garnishHandlers);
  else createTray(garnishHandlers);
}

/**
 * The same `computer_stop` the page sends: the helper is killed and the grant
 * withdrawn, so the agent has to be allowed again before it touches the screen.
 */
async function confirmRevokeComputerUse(): Promise<void> {
  const prompt = revokeComputerUsePrompt();
  if (!(await askGuardPrompt(prompt))) return;
  await dispatchDesktopRuntime(frontWindow(), 'computer_stop', undefined);
  refreshTrayForComputerUse();
}

function handBackScreen(): void {
  handBackComputerUse();
  refreshTrayMenu(garnishHandlers);
}

function takeOverScreen(): void {
  takeOverComputerUse();
  refreshTrayMenu(garnishHandlers);
}

const dictationElsewhere = createDictationElsewhere({
  frontApp: async () => {
    const front = await applicationTakingInput();
    return front && front.pid !== null
      ? { name: front.name, pid: front.pid, secureInput: front.secureInput }
      : null;
  },
  openBar: () => openDictationBar((contentsId) => dictationElsewhere.cancel(contentsId)),
  typeText: typeForUser,
  copyText: (text) => clipboard.writeText(text),
  notify: (title, body) => createNativeNotification({ title, body }).show(),
  ownPid: process.pid,
  now: Date.now,
});

/**
 * With dictation into other apps on, a press over another app opens the bar
 * there; over AGI Cloud, or when the app in front cannot be read, it dictates
 * into this app as it always has.
 */
async function dictateFromShortcut(): Promise<void> {
  if (dictationElsewhere.isListening() || getPreferences().dictateIntoFocusedApp) {
    const taken = await dictationElsewhere.handlePress().catch((error: unknown) => {
      console.warn('[dictation] the app in front could not be read:', error);
      return false;
    });
    if (taken) return;
  }
  await toggleGlobalDictation(mainWindow, showMainWindow);
}

const garnishHandlers = {
  onOpen: showMainWindow,
  onNewChat: openNewChat,
  onNewChatWindow: () => void newChatFromShortcut(),
  onQuickAsk: () => toggleQuickAsk(),
  onScreenshot: () => void captureToChat(mainWindow),
  onWindowShot: () => void captureWindowToChat(mainWindow, () => frontWindowIdOutside(process.pid)),
  onVoice: () => void dictateFromShortcut(),
  onStopAgents: stopAgentsFromShortcut,
  onStopAll: () => void confirmStopAll(),
  onHandBackScreen: handBackScreen,
  onRevokeComputerUse: () => void confirmRevokeComputerUse(),
  onOpenSession: openLocalSession,
  onCheckForUpdates: () => void checkForCloudUpdate(),
  activity: trayActivity,
};

function applyGarnishShortcuts(): void {
  unregisterGarnishShortcuts();
  registerGarnishShortcuts({
    onQuickAsk: garnishHandlers.onQuickAsk,
    onNewChat: garnishHandlers.onNewChatWindow,
    onScreenshot: garnishHandlers.onScreenshot,
    onWindowShot: garnishHandlers.onWindowShot,
    onVoice: garnishHandlers.onVoice,
    onStop: garnishHandlers.onStopAgents,
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
      sessionCompletionAlerts: preferences.sessionCompletionAlerts,
      sessionApprovalAlerts: preferences.sessionApprovalAlerts,
      quickAskShortcut: shortcuts.quickAskShortcut,
      newChatShortcut: shortcuts.newChatShortcut,
      screenshotShortcut: shortcuts.screenshotShortcut,
      windowShotShortcut: shortcuts.windowShotShortcut,
      voiceShortcut: shortcuts.voiceShortcut,
      stopShortcut: shortcuts.stopShortcut,
      agentNotifications: preferences.agentNotifications,
      ...(process.platform === 'darwin'
        ? { dictateIntoFocusedApp: preferences.dictateIntoFocusedApp }
        : {}),
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

/**
 * The program named here is started with the user's account on every coding
 * session and every status check, and the page asking to change it is a
 * website. So a new path is resolved and shown to the user in main, and only
 * the path they confirmed is saved.
 */
const PROGRAM_PATH_SHOWN = { head: 400, tail: 200 };
const PAIRING_CODE_SHOWN = { head: 40, tail: 0 };
const CAPTURE_SOURCE_SHOWN = { head: 60, tail: 0 };

/**
 * A yes or no this window asks because a page changed a preference. The
 * subject keeps a page from raising the same question again the moment it is
 * cancelled, or several at once (`nativeQuestions.ts`).
 */
async function confirmPreference(
  window: BrowserWindow | null,
  key: string,
  options: Electron.MessageBoxOptions,
): Promise<boolean> {
  const subject = { group: 'host-preference', key, quietAfterCancel: true };
  const result = await askNativeQuestion(window, subject, options);
  if (result.notAsked !== undefined) throw new Error(NOT_ASKED_MESSAGES[result.notAsked]);
  return result.response === 1;
}

/**
 * Clearing the path changes which program runs every coding session just as
 * naming one does: from the one the user confirmed to the one that comes with
 * this app, or to whatever is called `agi` on this app's PATH when none does.
 * So it is asked too, saying which program is being given up.
 */
async function confirmBuiltInCli(window: BrowserWindow | null, current: string): Promise<boolean> {
  return confirmPreference(window, 'cli-path built-in', {
    type: 'question',
    buttons: ['Cancel', 'Use the built-in CLI'],
    defaultId: 0,
    cancelId: 0,
    title: 'Go back to the built-in AGI CLI?',
    message: 'Stop using the program you chose for coding sessions?',
    detail: [
      "AGI Cloud will run the AGI CLI that comes with this app for every coding session, or the program named agi on this app's PATH when this build carries none.",
      `Program in use now: ${shownValue(current, PROGRAM_PATH_SHOWN)}`,
    ].join('\n\n'),
    noLink: true,
  });
}

/**
 * Opening at login keeps this app, and the page it loads, running from every
 * login on. Turning it on is asked here; turning it off is not.
 */
async function confirmLaunchAtLogin(window: BrowserWindow | null): Promise<boolean> {
  return confirmPreference(window, 'launch-at-login', {
    type: 'question',
    buttons: ['Cancel', 'Open at login'],
    defaultId: 0,
    cancelId: 0,
    title: 'Open AGI Cloud at login?',
    message: 'Open AGI Cloud each time you log in to this computer?',
    detail:
      "It starts when you log in and keeps running until you quit it. You can turn this off in Settings, or in your system's login items.",
    noLink: true,
  });
}

/**
 * Turning this on lets a press of the dictation shortcut type into whatever
 * app is in front, so it is asked here, where a page cannot answer.
 */
async function confirmDictateIntoApps(window: BrowserWindow | null): Promise<boolean> {
  return confirmPreference(window, 'dictate-into-apps', {
    type: 'question',
    buttons: ['Cancel', 'Type into other apps'],
    defaultId: 0,
    cancelId: 0,
    title: 'Dictate into other apps?',
    message: 'Type what you dictate into the app you are using?',
    detail:
      'When another app is in front, the dictation shortcut opens a small bar there and types what you said into that app when you press it again. Line breaks become spaces and nothing is typed into a password field. macOS asks you to allow Accessibility for AGI Cloud.',
    noLink: true,
  });
}

async function confirmCliPath(
  window: BrowserWindow | null,
  requested: string,
  current: string,
): Promise<string | null> {
  if (requested === '') return (await confirmBuiltInCli(window, current)) ? '' : null;
  if (requested.includes(path.sep) && !path.isAbsolute(requested)) {
    throw new Error('Enter the full path to the AGI CLI, or just its name.');
  }
  const resolved = resolveBinaryPath(requested);
  if (!resolved) throw new Error(`No program this computer can run was found at ${requested}.`);
  let target = resolved;
  try {
    target = realpathSync(resolved);
  } catch {
    target = resolved;
  }
  const options = {
    type: 'warning' as const,
    buttons: ['Cancel', 'Use this program'],
    defaultId: 0,
    cancelId: 0,
    title: 'Use this program as the AGI CLI?',
    message: 'Run this program for coding sessions?',
    detail: [
      'AGI Cloud starts this program to check its version and to run every coding session. It runs with your account: it can read and change files in the folders you approve and start other programs. Use it only if you set this path yourself.',
      `The path a page asked for. ${NOT_THIS_APP}`,
      [
        `Program: ${shownValue(resolved, PROGRAM_PATH_SHOWN)}`,
        ...(target === resolved ? [] : [`It links to: ${shownValue(target, PROGRAM_PATH_SHOWN)}`]),
      ].join('\n'),
    ].join('\n\n'),
    noLink: true,
  };
  return (await confirmPreference(window, `cli-path ${resolved}`, options)) ? resolved : null;
}

const STOP_SHORTCUT_REQUIRED =
  'Stop Agents keeps a shortcut: it is how you stop an agent that is controlling the screen, from whatever app is in front. Choose one of the listed shortcuts instead.';

function shortcutWriteRefusal(key: ShortcutKey, requested: string): string {
  return requested === NO_HOST_SHORTCUT
    ? STOP_SHORTCUT_REQUIRED
    : `${SHORTCUT_LABELS[key]} takes only one of the listed shortcuts. A shortcut is registered for every app on this computer, so this app does not take one a page names.`;
}

/**
 * A shortcut that is never off has to end a write still registered. A chord
 * another app holds is saved like any other and reports `taken`, which for
 * Stop Agents would leave no shortcut at all. Answers with what to tell the
 * page when the shortcut did not take; the caller puts the old chords back.
 */
function lostAlwaysOnShortcut(): string | null {
  const lost = shortcutRegistrations().find(
    (registration) => !shortcutMayBeOff(registration.key) && registration.status !== 'registered',
  );
  if (!lost) return null;
  return `${SHORTCUT_LABELS[lost.key]} could not take that shortcut: it ${
    shortcutStatusDetail(lost.status) ?? 'was not registered'
  }. The shortcut it had is kept. Choose another one.`;
}

async function writeHostPreferences(
  window: BrowserWindow | null,
  patch: Partial<HostPreferences>,
): Promise<HostPreferencesState> {
  const before = getPreferences();

  for (const key of SHORTCUT_KEYS) {
    const requested = patch[key];
    if (
      typeof requested === 'string' &&
      !pageMayWriteShortcut(key, requested, getShortcuts()[key])
    ) {
      throw new Error(shortcutWriteRefusal(key, requested));
    }
  }

  const shortcutPatch = Object.fromEntries(
    SHORTCUT_KEYS.filter((key) => typeof patch[key] === 'string').map((key) => [key, patch[key]]),
  );
  if (Object.keys(shortcutPatch).length > 0) {
    const previous = getShortcuts();
    saveSettings(shortcutPatch);
    applyGarnishShortcuts();
    const lost = lostAlwaysOnShortcut();
    if (lost) {
      saveSettings(previous);
      applyGarnishShortcuts();
      refreshTrayMenu(garnishHandlers);
      throw new Error(lost);
    }
    refreshTrayMenu(garnishHandlers);
  }

  if (
    typeof patch.launchAtLogin === 'boolean' &&
    patch.launchAtLogin !== before.launchAtLogin &&
    (!patch.launchAtLogin || (await confirmLaunchAtLogin(window)))
  ) {
    setLaunchAtLogin(patch.launchAtLogin);
  }

  if (patch.agentNotifications && typeof patch.agentNotifications === 'object') {
    saveSettings({ agentNotifications: normalizeAgentNotifications(patch.agentNotifications) });
  }

  if (typeof patch.cliPath === 'string' && patch.cliPath.trim() !== before.cliPath) {
    const confirmed = await confirmCliPath(window, patch.cliPath.trim(), before.cliPath);
    if (confirmed !== null) saveSettings({ cliPath: confirmed });
  }

  if (typeof patch.showInMenuBar === 'boolean' && patch.showInMenuBar !== before.showInMenuBar) {
    saveSettings({ showInMenuBar: patch.showInMenuBar });
    syncTray();
  }

  if (isSessionCompletionAlerts(patch.sessionCompletionAlerts)) {
    saveSettings({ sessionCompletionAlerts: patch.sessionCompletionAlerts });
  }

  if (typeof patch.sessionApprovalAlerts === 'boolean') {
    saveSettings({ sessionApprovalAlerts: patch.sessionApprovalAlerts });
  }

  if (
    typeof patch.dictateIntoFocusedApp === 'boolean' &&
    patch.dictateIntoFocusedApp !== before.dictateIntoFocusedApp &&
    (!patch.dictateIntoFocusedApp || (await confirmDictateIntoApps(window)))
  ) {
    saveSettings({ dictateIntoFocusedApp: patch.dictateIntoFocusedApp });
    if (patch.dictateIntoFocusedApp) systemPreferences.isTrustedAccessibilityClient(true);
    else dictationElsewhere.closeAll();
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
    if (mainWindow && showsTrustedPage(mainWindow.webContents)) {
      mainWindow.webContents.send(ELECTRON_IPC_CHANNELS.hostCommand, command);
    }
    return;
  }
  focusWindow(target.id);
  if (showsTrustedPage(target.webContents)) {
    target.webContents.send(ELECTRON_IPC_CHANNELS.hostCommand, command);
  }
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

async function cloudUpdateAvailability(): Promise<DesktopCloudUpdateAvailability> {
  const update = await checkDesktopCloudUpdate(app.getVersion(), installedMacArchitecture());
  if (update.available) checkForAutoUpdate();
  return {
    ...update,
    installsAutomatically: autoUpdateSupported(),
    readyToInstall: update.available && downloadedUpdate() === update.version,
  };
}

/**
 * Installing quits the app, so a restart asks first about work a quit would
 * stop, in the quit guard's own words. Declined, the update waits and installs
 * on the next quit, which asks the same question.
 */
async function restartToUpdate(): Promise<HostRestartOutcome> {
  if (downloadedUpdate() === null) return 'not-ready';
  const prompt = quitPrompt(liveWork());
  if (prompt && !(await askGuardPrompt(prompt))) return 'deferred';
  quitConfirmed = true;
  setTimeout(() => {
    quitConfirmed = false;
  }, UPDATE_RESTART_TIMEOUT_MS).unref?.();
  installDownloadedUpdate();
  return 'restarting';
}

function announceUpdateReady(version: string): void {
  sendRuntimeEvent({ kind: 'update-ready', version });
  if (!Notification.isSupported()) return;
  const notification = createNativeNotification({
    title: 'AGI Cloud update ready',
    body: `Version ${version} is downloaded. Restart AGI Cloud to finish updating.`,
    actions: [{ type: 'button', text: 'Restart to Update' }],
  });
  notification.on('action', () => void restartToUpdate());
  notification.on('click', () => void checkForCloudUpdate());
  notification.show();
}

async function checkForCloudUpdate(): Promise<void> {
  let prompt: DesktopUpdatePrompt;
  try {
    const update = await cloudUpdateAvailability();
    recordDesktopEvent({ domain: 'updater', outcome: 'ok' });
    prompt = desktopUpdatePrompt(update);
    const chosen = await showUpdatePrompt(prompt);
    if (prompt.restartButton !== null && chosen === prompt.restartButton) {
      await restartToUpdate();
    } else if (prompt.downloadButton !== null && chosen === prompt.downloadButton) {
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
  const result = await showNativeMessage(mainWindow, options);
  return result.response;
}

function installMenu(): void {
  installAppMenu(
    {
      newChat: garnishHandlers.onNewChat,
      newWindow: openNewWindow,
      openConversationInNewWindow: openFocusedConversationInNewWindow,
      hasFocusedConversation: () => focusedConversationRoute() !== null,
      isFrontWindowOnTop: () => frontShellWindow()?.isAlwaysOnTop() ?? null,
      setFrontWindowOnTop,
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
      takeOverScreen,
      handBackScreen,
      stopScreenControl: () => void stopComputerUse(),
    },
    {
      quickAsk: getShortcuts().quickAskShortcut,
      screenshot: getShortcuts().screenshotShortcut,
    },
    computerUsePhase(),
  );
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.setName('AGI Cloud');
  app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);

  const launchLink = process.argv.find((arg) => arg.startsWith(`${DEEP_LINK_SCHEME}://`));
  if (launchLink) coldStartDeepLinks.push(launchLink);

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
    // `isTrustedSender` decides who may call these handlers.
    recordDesktopEvent({ domain: 'launch', outcome: 'started' });
    registerIpcHandlers();
    signedInAccount = readShellWindowState().lastAccount;
    onShellIdentityReported((identity) => adoptReportedAccount(accountFingerprint(identity)));
    nativeTheme.themeSource = getPreferences().appearance;
    nativeTheme.on('updated', paintWindowsForTheme);
    configureSession(session.fromPartition(REMOTE_SESSION_PARTITION));

    deepLinkQueue = mergeDeepLinkQueues(
      loadDeepLinkQueue(deepLinkQueuePath(), Date.now()),
      deepLinkQueue,
    );
    appReady = true;
    createMainWindow();
    for (const link of coldStartDeepLinks.splice(0)) deliverDeepLink(link);

    trayComputerUseState = computerUseTrayState();
    syncTray();
    installMenu();
    installDockMenu({
      newChat: garnishHandlers.onNewChat,
      newWindow: openNewWindow,
      toggleQuickAsk: garnishHandlers.onQuickAsk,
    });
    // The Window menu says whether the front window is on a conversation, so it
    // is rebuilt when the front window changes rather than once at launch.
    app.on('browser-window-focus', installMenu);
    app.on('browser-window-blur', installMenu);
    applyLaunchAtLogin();
    applyGarnishShortcuts();

    configureRemoteControl(
      (state) => {
        sendRuntimeEvent({ kind: 'remote-control-changed', state });
        syncWorkKeeper();
      },
      () => {
        showMainWindow();
        return mainWindow;
      },
    );
    configureComputerUse({
      onChange: () => {
        sendRuntimeEvent({ kind: 'computer-use-changed', status: computerUseStatus() });
        installMenu();
        refreshTrayForComputerUse();
      },
      onNotificationClick: showMainWindow,
      onResumeOwed: (driver) => {
        if (driver && !driver.isDestroyed() && showsTrustedPage(driver.webContents)) {
          driver.webContents.send(DESKTOP_RUNTIME_EVENT_CHANNEL, {
            kind: 'computer-use-handed-back',
          });
        }
      },
    });
    configureDevicePrompts((open) => sendRuntimeEvent({ kind: 'device-prompt-changed', open }));
    const codeSessionActivity = createCodeSessionActivity({
      sessionTitle: async (rootId, threadId) =>
        (await readDeveloperSession(rootId, threadId)).session.title.slice(
          0,
          REMOTE_CODE_LIMITS.messageLength,
        ) || null,
      remoteControlActive,
      mayReportRoot: (rootId) => agentAllowedIn(rootId),
      report: reportCodeSessionActivity,
    });
    configureDeveloperSessions({
      emit: (rootId, event) => {
        noteBackgroundSessionEvent(rootId, event);
        sendRuntimeEvent({ kind: 'developer-session', rootId, event });
        relayDeveloperSessionEvent(rootId, event);
        agentNotifier.handle(rootId, event, noteLocalRoutineEvent(rootId, event).notify);
        noteDispatcherSessionEvent(rootId, event);
        codeSessionActivity(rootId, event).catch((error: unknown) =>
          console.warn('[code-session-activity] could not deliver activity:', error),
        );
      },
      resolveBinary: () => getPreferences().cliPath,
      mayRunIn: (root) => agentAllowedIn(root.id),
      workspaceConsentAtMs: (root) => agentConsentAt(root.id),
      accountBridge: { readShellIdentity, approveDeviceCode },
      spawn: spawnTrackedDeveloperRuntime,
      answersUserInput: windowAnswersUserInput,
    });

    void startLocalRoutines().catch((error: unknown) =>
      console.warn('[local-routines] unavailable:', error),
    );

    configureQuickAskBridge({
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: [
        `--agi-app-version=${app.getVersion()}`,
        `--agi-app-origin=${CLOUD_APP_ORIGIN}`,
      ],
    });
    configureQuickAskHandoff(openRouteFromQuickAsk);
    configureDictationBarBridge({
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: [
        `--agi-app-version=${app.getVersion()}`,
        `--agi-app-origin=${CLOUD_APP_ORIGIN}`,
      ],
    });
    setTimeout(warmUpQuickAsk, QUICK_ASK_WARMUP_MS).unref?.();
    if (autoUpdateSupported()) startAutoUpdate(installedMacArchitecture(), announceUpdateReady);
    void startPairingBridge();
    recordDesktopEvent({ domain: 'launch', outcome: 'ok' });

    app.on('activate', () => {
      showMainWindow();
    });
  });

  let quitPromptOpen = false;

  app.on('before-quit', (event) => {
    if (quitConfirmed) return;
    const prompt = quitPrompt(liveWork());
    if (!prompt) return;
    event.preventDefault();
    if (quitPromptOpen) return;
    quitPromptOpen = true;
    void askGuardPrompt(prompt)
      .then((confirmed) => {
        if (confirmed) {
          quitConfirmed = true;
          app.quit();
          return;
        }
        if (liveWindows().length === 0 && process.platform !== 'darwin') showMainWindow();
      })
      .finally(() => {
        quitPromptOpen = false;
      });
  });

  app.on('will-quit', () => {
    dictationElsewhere.closeAll();
    workKeeper.release();
    stopLocalRoutines();
    unregisterGarnishShortcuts();
    cancelAllShellRuns();
    stopRemoteControl();
    killAllDeveloperRuntimes();
    shutDownComputerUse();
    void stopBrowserBridge();
  });

  app.on('window-all-closed', () => {
    if (process.platform === 'darwin') return;
    if (hasTray()) return;
    app.quit();
  });
}

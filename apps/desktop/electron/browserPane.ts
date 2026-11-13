import { randomUUID } from 'node:crypto';
import { WebContentsView, session, type BrowserWindow, type Session } from 'electron';
import {
  BROWSER_PANE_TAB_LIMIT,
  BROWSER_PANE_TITLE_LIMIT,
  DESKTOP_RUNTIME_EVENT_CHANNEL,
  localPreviewOrigin,
  localPreviewUrl,
  type BrowserPaneBounds,
  type BrowserPaneCapture,
  type BrowserPaneHistoryAction,
  type BrowserPaneState,
  type BrowserPaneTab,
  type PreviewConsoleReport,
} from '@agiworkforce/local-runtime-contract';
import { showsTrustedPage } from './permissionPolicy';
import { PreviewConsoleBuffer } from './previewConsole';
import { browserAddress } from './windowPolicy';

const PANE_PARTITION = 'agi-browser-pane';
const PANES_PER_WINDOW = 3;
const PANE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const BLANK_PAGE = 'about:blank';
const ABORTED_LOAD = -3;
const FRAME_SCHEMES: ReadonlySet<string> = new Set(['http:', 'https:', 'about:', 'blob:', 'data:']);

const ADDRESS_REFUSED = 'Only http and https addresses open here.';
const LINK_REFUSED =
  'The page tried to open something that is not a web address. It was not opened.';
const DOWNLOAD_REFUSED =
  'Downloads are off in this pane. Open the page in your own browser to download from it.';
const TAB_LIMIT_REACHED = `This pane holds ${BROWSER_PANE_TAB_LIMIT} tabs. Close one to open another.`;
const NO_PAGE = 'There is no page open to capture.';
const CAPTURE_FAILED =
  'The page could not be captured. Wait for it to finish loading, then try again.';
const PAGE_STOPPED = 'This page stopped working. Reload it to try again.';
const NO_WINDOW = 'The browser pane needs an open window.';

export type BrowserPaneRefusal = 'invalid' | 'not-found' | 'limit' | 'unavailable';

export class BrowserPaneRefused extends Error {
  constructor(
    readonly reason: BrowserPaneRefusal,
    message: string,
  ) {
    super(message);
  }
}

interface Tab {
  id: string;
  view: WebContentsView;
  title: string;
  loading: boolean;
  failure: string | null;
  console: PreviewConsoleBuffer;
  shownAt: number;
}

interface Pane {
  id: string;
  window: BrowserWindow;
  tabs: Tab[];
  activeTabId: string | null;
  bounds: BrowserPaneBounds;
  visible: boolean;
  notice: string | null;
  touchedAt: number;
}

const panesByWindow = new Map<number, Map<string, Pane>>();
const watchedWindows = new WeakSet<BrowserWindow>();
let isolated: Session | null = null;
let clock = 0;

function tick(): number {
  clock += 1;
  return clock;
}

function allPanes(): Pane[] {
  return [...panesByWindow.values()].flatMap((panes) => [...panes.values()]);
}

function paneOfContents(contents: Electron.WebContents | null | undefined): Pane | null {
  if (!contents) return null;
  return (
    allPanes().find((pane) => pane.tabs.some((tab) => tab.view.webContents === contents)) ?? null
  );
}

/**
 * Pages in the pane are strangers. They get a session of their own that is
 * never written to disk, no permission to anything, and no way to save a file
 * onto this computer.
 */
function isolatedSession(): Session {
  if (isolated) return isolated;
  const created = session.fromPartition(PANE_PARTITION);
  created.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  created.setPermissionCheckHandler(() => false);
  created.setDevicePermissionHandler(() => false);
  created.setSpellCheckerEnabled(false);
  created.on('will-download', (event, _item, contents) => {
    event.preventDefault();
    const pane = paneOfContents(contents);
    if (pane) note(pane, DOWNLOAD_REFUSED);
  });
  isolated = created;
  return created;
}

function shownUrl(tab: Tab): string {
  const url = tab.view.webContents.getURL();
  return url === BLANK_PAGE ? '' : url;
}

function tabState(tab: Tab): BrowserPaneTab {
  const url = shownUrl(tab);
  const history = tab.view.webContents.navigationHistory;
  return {
    id: tab.id,
    title: (tab.title || url).slice(0, BROWSER_PANE_TITLE_LIMIT),
    url,
    loading: tab.loading,
    canGoBack: history.canGoBack(),
    canGoForward: history.canGoForward(),
    local: localPreviewUrl(url) !== null,
    failure: tab.failure,
  };
}

function snapshot(pane: Pane): BrowserPaneState {
  return {
    tabs: pane.tabs.map(tabState),
    activeTabId: pane.activeTabId,
    notice: pane.notice,
  };
}

function publish(pane: Pane): void {
  const { window } = pane;
  if (window.isDestroyed() || !showsTrustedPage(window.webContents)) return;
  window.webContents.send(DESKTOP_RUNTIME_EVENT_CHANNEL, {
    kind: 'browser-pane-changed',
    paneId: pane.id,
    state: snapshot(pane),
  });
}

function note(pane: Pane, notice: string): void {
  pane.notice = notice;
  publish(pane);
}

function applyLayout(pane: Pane): void {
  if (pane.window.isDestroyed()) return;
  const factor = pane.window.webContents.getZoomFactor();
  const { x, y, width, height } = pane.bounds;
  const drawable = pane.visible && width > 0 && height > 0;
  for (const tab of pane.tabs) {
    const shown = drawable && tab.id === pane.activeTabId;
    tab.view.setVisible(shown);
    if (!shown) continue;
    tab.view.setBounds({
      x: Math.round(x * factor),
      y: Math.round(y * factor),
      width: Math.round(width * factor),
      height: Math.round(height * factor),
    });
  }
}

function activate(pane: Pane, tab: Tab): void {
  pane.activeTabId = tab.id;
  tab.shownAt = tick();
  applyLayout(pane);
}

function load(pane: Pane, tab: Tab, address: string): void {
  tab.failure = null;
  tab.loading = true;
  tab.shownAt = tick();
  pane.notice = null;
  tab.view.webContents.loadURL(localPreviewUrl(address) ?? address).catch(() => undefined);
}

function frameMayOpen(url: string): boolean {
  try {
    return FRAME_SCHEMES.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

function watch(pane: Pane, tab: Tab): void {
  const contents = tab.view.webContents;

  contents.setWindowOpenHandler(({ url }) => {
    const address = browserAddress(url);
    if (address === null) note(pane, LINK_REFUSED);
    else if (pane.tabs.length >= BROWSER_PANE_TAB_LIMIT) note(pane, TAB_LIMIT_REACHED);
    else {
      const opened = createTab(pane);
      activate(pane, opened);
      load(pane, opened, address);
      publish(pane);
    }
    return { action: 'deny' };
  });

  const refuseOtherSchemes = (event: { preventDefault(): void }, url: string): void => {
    if (browserAddress(url) !== null) return;
    event.preventDefault();
    note(pane, LINK_REFUSED);
  };
  contents.on('will-navigate', (event, url) => refuseOtherSchemes(event, url));
  contents.on('will-redirect', (event, url) => refuseOtherSchemes(event, url));
  contents.on('will-frame-navigate', (event) => {
    if (!event.isMainFrame && !frameMayOpen(event.url)) event.preventDefault();
  });

  // Electron answers a site's request for a client certificate with the first
  // one in the user's keychain unless told otherwise. A page here gets none.
  contents.on('select-client-certificate', (event, _url, _certificates, callback) => {
    event.preventDefault();
    (callback as (certificate?: Electron.Certificate) => void)();
  });

  contents.on('page-title-updated', (_event, title) => {
    tab.title = title;
    publish(pane);
  });
  contents.on('did-start-loading', () => {
    tab.loading = true;
    publish(pane);
  });
  contents.on('did-stop-loading', () => {
    tab.loading = false;
    publish(pane);
  });
  contents.on('did-navigate', () => {
    tab.failure = null;
    tab.title = '';
    publish(pane);
  });
  contents.on('did-navigate-in-page', () => publish(pane));
  contents.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
    if (!isMainFrame || code === ABORTED_LOAD) return;
    tab.loading = false;
    tab.failure =
      localPreviewUrl(url) !== null
        ? `Nothing answered at ${url}. Check that the server is still running.`
        : `${url} did not load. Check the address and your connection.`;
    publish(pane);
  });
  contents.on('render-process-gone', (_event, details) => {
    tab.loading = false;
    tab.failure = PAGE_STOPPED;
    tab.console.record({ message: `The preview page stopped (${details.reason}).` });
    publish(pane);
  });
  contents.on('console-message', (details) => {
    if (details.level !== 'error' || localPreviewUrl(contents.getURL()) === null) return;
    tab.console.record({
      message: details.message,
      source: details.sourceId,
      line: details.lineNumber,
    });
  });
  contents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) tab.console.reset();
  });
}

function createTab(pane: Pane): Tab {
  const view = new WebContentsView({
    webPreferences: {
      session: isolatedSession(),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      devTools: false,
      safeDialogs: true,
      autoplayPolicy: 'user-gesture-required',
    },
  });
  view.setVisible(false);
  pane.window.contentView.addChildView(view);
  const tab: Tab = {
    id: randomUUID(),
    view,
    title: '',
    loading: false,
    failure: null,
    console: new PreviewConsoleBuffer(),
    shownAt: tick(),
  };
  pane.tabs.push(tab);
  watch(pane, tab);
  return tab;
}

function destroyTab(pane: Pane, tab: Tab): void {
  pane.tabs = pane.tabs.filter((entry) => entry !== tab);
  if (!pane.window.isDestroyed()) pane.window.contentView.removeChildView(tab.view);
  const contents = tab.view.webContents;
  if (!contents.isDestroyed()) contents.close({ waitForBeforeUnload: false });
}

function destroyPane(pane: Pane): void {
  for (const tab of [...pane.tabs]) destroyTab(pane, tab);
  pane.activeTabId = null;
  const panes = panesByWindow.get(pane.window.id);
  panes?.delete(pane.id);
  if (panes?.size === 0) panesByWindow.delete(pane.window.id);
}

function destroyWindowPanes(windowId: number): void {
  for (const pane of [...(panesByWindow.get(windowId)?.values() ?? [])]) destroyPane(pane);
}

/**
 * A page view floats over the window, so one whose pane left with the page
 * would cover the app with nothing to close it. Leaving the page closes them.
 */
function watchWindow(window: BrowserWindow): void {
  if (watchedWindows.has(window)) return;
  watchedWindows.add(window);
  const { id } = window;
  window.once('closed', () => destroyWindowPanes(id));
  window.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) destroyWindowPanes(id);
  });
  window.webContents.on('render-process-gone', () => destroyWindowPanes(id));
}

function requireWindow(window: BrowserWindow | null): BrowserWindow {
  if (!window || window.isDestroyed()) throw new BrowserPaneRefused('unavailable', NO_WINDOW);
  return window;
}

function requirePaneId(paneId: string): string {
  if (!PANE_ID.test(paneId)) {
    throw new BrowserPaneRefused('invalid', '"paneId" must be a short identifier.');
  }
  return paneId;
}

function existingPane(window: BrowserWindow | null, paneId: string): Pane | null {
  if (!window || window.isDestroyed()) return null;
  return panesByWindow.get(window.id)?.get(requirePaneId(paneId)) ?? null;
}

function paneFor(rawWindow: BrowserWindow | null, paneId: string): Pane {
  const window = requireWindow(rawWindow);
  const id = requirePaneId(paneId);
  const panes = panesByWindow.get(window.id) ?? new Map<string, Pane>();
  panesByWindow.set(window.id, panes);
  const found = panes.get(id);
  if (found) {
    found.touchedAt = tick();
    return found;
  }
  if (panes.size >= PANES_PER_WINDOW) {
    const [stalest] = [...panes.values()].sort(
      (left, right) =>
        Number(left.visible) - Number(right.visible) || left.touchedAt - right.touchedAt,
    );
    if (stalest) destroyPane(stalest);
    panesByWindow.set(window.id, panes);
  }
  watchWindow(window);
  const pane: Pane = {
    id,
    window,
    tabs: [],
    activeTabId: null,
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    visible: false,
    notice: null,
    touchedAt: tick(),
  };
  panes.set(id, pane);
  return pane;
}

function activeTab(pane: Pane): Tab | null {
  return pane.tabs.find((tab) => tab.id === pane.activeTabId) ?? null;
}

function requireTab(pane: Pane, tabId: string): Tab {
  const tab = pane.tabs.find((entry) => entry.id === tabId);
  if (!tab) throw new BrowserPaneRefused('not-found', 'That tab is no longer open.');
  return tab;
}

export function browserPaneState(window: BrowserWindow | null, paneId: string): BrowserPaneState {
  const pane = existingPane(window, paneId);
  return pane ? snapshot(pane) : { tabs: [], activeTabId: null, notice: null };
}

export function layoutBrowserPane(
  window: BrowserWindow | null,
  paneId: string,
  bounds: BrowserPaneBounds,
  visible: boolean,
): boolean {
  const pane = visible ? paneFor(window, paneId) : existingPane(window, paneId);
  if (!pane) return false;
  pane.bounds = bounds;
  pane.visible = visible;
  applyLayout(pane);
  return true;
}

export function openBrowserPaneTab(
  window: BrowserWindow | null,
  paneId: string,
  url?: string,
): BrowserPaneState {
  const address = url === undefined ? null : browserAddress(url);
  if (url !== undefined && address === null) {
    throw new BrowserPaneRefused('invalid', ADDRESS_REFUSED);
  }
  const pane = paneFor(window, paneId);
  if (pane.tabs.length >= BROWSER_PANE_TAB_LIMIT) {
    throw new BrowserPaneRefused('limit', TAB_LIMIT_REACHED);
  }
  const tab = createTab(pane);
  activate(pane, tab);
  if (address !== null) load(pane, tab, address);
  else pane.notice = null;
  return snapshot(pane);
}

export function closeBrowserPaneTab(
  window: BrowserWindow | null,
  paneId: string,
  tabId: string,
): BrowserPaneState {
  const pane = existingPane(window, paneId);
  if (!pane) return browserPaneState(window, paneId);
  const tab = requireTab(pane, tabId);
  const index = pane.tabs.indexOf(tab);
  destroyTab(pane, tab);
  if (pane.activeTabId === tabId) {
    const next = pane.tabs[index] ?? pane.tabs[index - 1] ?? null;
    pane.activeTabId = next?.id ?? null;
    if (next) next.shownAt = tick();
  }
  applyLayout(pane);
  return snapshot(pane);
}

export function selectBrowserPaneTab(
  window: BrowserWindow | null,
  paneId: string,
  tabId: string,
): BrowserPaneState {
  const pane = paneFor(window, paneId);
  activate(pane, requireTab(pane, tabId));
  return snapshot(pane);
}

export function navigateBrowserPane(
  window: BrowserWindow | null,
  paneId: string,
  url: string,
): BrowserPaneState {
  const address = browserAddress(url);
  if (address === null) throw new BrowserPaneRefused('invalid', ADDRESS_REFUSED);
  const pane = paneFor(window, paneId);
  const tab = activeTab(pane) ?? createTab(pane);
  activate(pane, tab);
  load(pane, tab, address);
  return snapshot(pane);
}

export function moveBrowserPaneHistory(
  window: BrowserWindow | null,
  paneId: string,
  action: BrowserPaneHistoryAction,
): BrowserPaneState {
  const pane = existingPane(window, paneId);
  const tab = pane ? activeTab(pane) : null;
  if (!pane || !tab) return browserPaneState(window, paneId);
  const contents = tab.view.webContents;
  const history = contents.navigationHistory;
  if (action === 'back' && history.canGoBack()) history.goBack();
  else if (action === 'forward' && history.canGoForward()) history.goForward();
  else if (action === 'reload' && shownUrl(tab) !== '') {
    tab.failure = null;
    contents.reload();
  } else if (action === 'stop') contents.stop();
  return snapshot(pane);
}

export async function captureBrowserPane(
  window: BrowserWindow | null,
  paneId: string,
): Promise<BrowserPaneCapture> {
  const pane = existingPane(window, paneId);
  const tab = pane ? activeTab(pane) : null;
  const url = tab ? shownUrl(tab) : '';
  if (!tab || url === '') throw new BrowserPaneRefused('not-found', NO_PAGE);
  const image = await tab.view.webContents.capturePage().catch(() => null);
  if (!image || image.isEmpty()) throw new BrowserPaneRefused('unavailable', CAPTURE_FAILED);
  const { width, height } = image.getSize();
  return { dataUrl: image.toDataURL(), width, height, url };
}

export function closeBrowserPane(window: BrowserWindow | null, paneId: string): boolean {
  const pane = existingPane(window, paneId);
  if (!pane) return false;
  destroyPane(pane);
  return true;
}

export function closeAllBrowserPanes(): void {
  for (const pane of allPanes()) destroyPane(pane);
}

/**
 * The errors a local page in the pane logged since they were last cleared, so
 * the agent can be shown what a page it built does when it runs. Of several
 * local pages, the one looked at last answers.
 */
export function readBrowserPaneConsoleErrors(
  clear: boolean,
  origin?: string,
): PreviewConsoleReport {
  const local = allPanes()
    .flatMap((pane) => pane.tabs)
    .filter((tab) => localPreviewUrl(shownUrl(tab)) !== null)
    .sort((left, right) => right.shownAt - left.shownAt);
  const latest = local[0];
  if (!latest) return { url: null, errors: [], dropped: 0 };
  const match =
    origin === undefined
      ? latest
      : local.find((tab) => localPreviewOrigin(shownUrl(tab)) === origin);
  if (!match) return { url: localPreviewUrl(shownUrl(latest)), errors: [], dropped: 0 };
  const { errors, dropped } = match.console.read(clear);
  return { url: localPreviewUrl(shownUrl(match)), errors, dropped };
}

import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { WebContentsView, app, session, type BrowserWindow, type Session } from 'electron';
import {
  CLOSED_BROWSER_PANE,
  MAX_BROWSER_SITES,
  browserPaneAddress,
  browserPaneDecision,
  browserSiteHost,
  type BrowserPaneBounds,
  type BrowserPaneState,
  type BrowserSites,
  type PreviewConsoleReport,
} from '@agiworkforce/local-runtime-contract';
import { PreviewConsoleBuffer } from './previewConsole';
import { showNativeMessage } from './runtime/nativeSurface';

const PARTITION = 'persist:agi-browser-pane';
const SITES_FILE = 'desktop-browser-sites.json';
const MAX_BOUND = 100_000;

interface Pane {
  view: WebContentsView;
  window: BrowserWindow;
  refusedHost: string | null;
  asking: boolean;
  consoleErrors: PreviewConsoleBuffer;
}

type BrowserPaneEmitter = (state: BrowserPaneState) => void;

let emit: BrowserPaneEmitter = () => undefined;
let paneSession: Session | null = null;
let sitesCache: BrowserSites | null = null;
const panes = new Map<number, Pane>();

export class BrowserPaneRefused extends Error {}

export function configureBrowserPane(options: { emit: BrowserPaneEmitter }): void {
  emit = options.emit;
}

function sitesPath(): string {
  return path.join(app.getPath('userData'), SITES_FILE);
}

function normalizeSites(raw: unknown): BrowserSites {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const list = (value: unknown): string[] =>
    [
      ...new Set(
        (Array.isArray(value) ? value : [])
          .filter((entry): entry is string => typeof entry === 'string')
          .map(browserSiteHost)
          .filter((entry): entry is string => entry !== null),
      ),
    ].slice(0, MAX_BROWSER_SITES);
  const blocked = list(source['blocked']);
  return { allowed: list(source['allowed']).filter((site) => !blocked.includes(site)), blocked };
}

export function readBrowserSites(): BrowserSites {
  if (sitesCache) return sitesCache;
  try {
    sitesCache = normalizeSites(JSON.parse(readFileSync(sitesPath(), 'utf8')));
  } catch {
    sitesCache = { allowed: [], blocked: [] };
  }
  return sitesCache;
}

function saveBrowserSites(next: BrowserSites): BrowserSites {
  const normalized = normalizeSites(next);
  sitesCache = normalized;
  const target = sitesPath();
  const temporary = `${target}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, target);
  } catch (error) {
    console.warn('[browser-pane] could not save the site lists:', error);
  }
  return normalized;
}

export function removeBrowserSite(host: string): BrowserSites {
  const site = browserSiteHost(host);
  if (!site) throw new BrowserPaneRefused('That is not a site name.');
  const current = readBrowserSites();
  return saveBrowserSites({
    allowed: current.allowed.filter((entry) => entry !== site),
    blocked: current.blocked.filter((entry) => entry !== site),
  });
}

export function blockBrowserSite(host: string): BrowserSites {
  const site = browserSiteHost(host);
  if (!site) throw new BrowserPaneRefused('Enter a site name such as example.com.');
  const current = readBrowserSites();
  if (current.blocked.length >= MAX_BROWSER_SITES && !current.blocked.includes(site)) {
    throw new BrowserPaneRefused(`Up to ${MAX_BROWSER_SITES} sites can be blocked.`);
  }
  const saved = saveBrowserSites({
    allowed: current.allowed.filter((entry) => entry !== site),
    blocked: [...current.blocked.filter((entry) => entry !== site), site],
  });
  for (const pane of panes.values()) {
    const url = stateOf(pane).url;
    if (url !== null && browserPaneDecision(url, saved) === 'blocked') refuse(pane, hostOf(url));
  }
  return saved;
}

function allowBrowserSite(site: string): void {
  const current = readBrowserSites();
  if (current.allowed.includes(site) || current.allowed.length >= MAX_BROWSER_SITES) return;
  saveBrowserSites({ ...current, allowed: [...current.allowed, site] });
}

function ensureSession(): Session {
  if (paneSession) return paneSession;
  const created = session.fromPartition(PARTITION);
  created.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  created.setPermissionCheckHandler(() => false);
  created.setDevicePermissionHandler(() => false);
  created.setDisplayMediaRequestHandler((_request, callback) => callback({}));
  created.webRequest.onBeforeRequest((details, callback) => {
    if (details.resourceType !== 'mainFrame' || mayLoadNow(details.url)) {
      callback({});
      return;
    }
    callback({ cancel: true });
    const pane = [...panes.values()].find(
      (entry) => entry.view.webContents === details.webContents,
    );
    if (pane) refuse(pane, hostOf(details.url));
  });
  paneSession = created;
  return created;
}

function stateOf(pane: Pane | undefined): BrowserPaneState {
  if (!pane || pane.view.webContents.isDestroyed()) return CLOSED_BROWSER_PANE;
  const contents = pane.view.webContents;
  const url = contents.getURL();
  return {
    open: true,
    url: url === '' || url === 'about:blank' ? null : url,
    title: contents.getTitle(),
    loading: contents.isLoading(),
    canGoBack: contents.navigationHistory.canGoBack(),
    canGoForward: contents.navigationHistory.canGoForward(),
    refusedHost: pane.refusedHost,
  };
}

function report(pane: Pane): void {
  emit(stateOf(pane));
}

function refuse(pane: Pane, host: string): void {
  pane.refusedHost = host;
  if (!pane.view.webContents.isDestroyed()) pane.view.setVisible(false);
  report(pane);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return url;
  }
}

async function askToAllow(pane: Pane, host: string): Promise<boolean> {
  if (pane.asking) return false;
  pane.asking = true;
  try {
    const { response } = await showNativeMessage(pane.window, {
      type: 'question',
      buttons: ['Cancel', `Allow ${host}`],
      defaultId: 0,
      cancelId: 0,
      title: 'Open this site in the browser?',
      message: `Open ${host} in the browser pane?`,
      detail:
        'The browser pane keeps its own cookies and has no access to your account, your files, your camera or your microphone. A site you allow stays allowed until you remove it in Settings.',
      noLink: true,
    });
    return response === 1;
  } finally {
    pane.asking = false;
  }
}

async function navigate(pane: Pane, url: string): Promise<void> {
  const decision = browserPaneDecision(url, readBrowserSites());
  const host = hostOf(url);
  if (decision === 'blocked') {
    refuse(pane, host);
    return;
  }
  if (decision === 'ask') {
    if (!(await askToAllow(pane, host))) {
      refuse(pane, host);
      return;
    }
    allowBrowserSite(host);
  }
  pane.refusedHost = null;
  if (pane.view.webContents.isDestroyed()) return;
  pane.view.setVisible(true);
  await pane.view.webContents.loadURL(url).catch(() => undefined);
  report(pane);
}

function mayLoadNow(url: string): boolean {
  const decision = browserPaneDecision(url, readBrowserSites());
  return decision === 'loopback' || decision === 'allowed';
}

function watch(pane: Pane): void {
  const contents = pane.view.webContents;
  contents.setWindowOpenHandler(({ url }) => {
    const address = browserPaneAddress(url);
    if (address) void navigate(pane, address);
    return { action: 'deny' };
  });
  const gate = (event: Electron.Event, url: string, isMainFrame: boolean) => {
    if (!isMainFrame || mayLoadNow(url)) return;
    event.preventDefault();
    const address = browserPaneAddress(url);
    if (address) void navigate(pane, address);
  };
  contents.on('will-navigate', (event) => gate(event, event.url, event.isMainFrame));
  contents.on('will-redirect', (event) => gate(event, event.url, event.isMainFrame));
  for (const name of [
    'did-navigate',
    'did-navigate-in-page',
    'page-title-updated',
    'did-start-loading',
    'did-stop-loading',
  ] as const) {
    contents.on(name as 'did-stop-loading', () => report(pane));
  }
  contents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) pane.consoleErrors.reset();
  });
  contents.on('console-message', (details) => {
    if (details.level !== 'error') return;
    pane.consoleErrors.record({
      message: details.message,
      source: details.sourceId,
      line: details.lineNumber,
    });
  });
  contents.on('render-process-gone', (_event, details) => {
    pane.consoleErrors.record({ message: `The page stopped (${details.reason}).` });
    report(pane);
  });
}

function clampBounds(window: BrowserWindow, bounds: BrowserPaneBounds): Electron.Rectangle {
  const zoom = window.webContents.getZoomFactor() || 1;
  const content = window.getContentBounds();
  const value = (n: number) => (Number.isFinite(n) ? Math.min(Math.max(n, 0), MAX_BOUND) : 0);
  const x = Math.round(value(bounds.x) * zoom);
  const y = Math.round(value(bounds.y) * zoom);
  return {
    x: Math.min(x, content.width),
    y: Math.min(y, content.height),
    width: Math.max(0, Math.min(Math.round(value(bounds.width) * zoom), content.width - x)),
    height: Math.max(0, Math.min(Math.round(value(bounds.height) * zoom), content.height - y)),
  };
}

function paneFor(window: BrowserWindow): Pane | undefined {
  const pane = panes.get(window.id);
  if (pane && pane.view.webContents.isDestroyed()) {
    panes.delete(window.id);
    return undefined;
  }
  return pane;
}

function requirePane(window: BrowserWindow): Pane {
  const pane = paneFor(window);
  if (!pane) throw new BrowserPaneRefused('Open the browser pane first.');
  return pane;
}

export async function openBrowserPane(
  window: BrowserWindow,
  bounds: BrowserPaneBounds,
  address: string | null,
): Promise<BrowserPaneState> {
  let pane = paneFor(window);
  if (!pane) {
    const view = new WebContentsView({
      webPreferences: {
        session: ensureSession(),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        spellcheck: false,
      },
    });
    view.setVisible(false);
    window.contentView.addChildView(view);
    pane = {
      view,
      window,
      refusedHost: null,
      asking: false,
      consoleErrors: new PreviewConsoleBuffer(),
    };
    panes.set(window.id, pane);
    watch(pane);
    const created = pane;
    window.once('closed', () => {
      panes.delete(window.id);
      if (!created.view.webContents.isDestroyed()) created.view.webContents.close();
    });
  }
  pane.view.setBounds(clampBounds(window, bounds));
  if (address !== null) {
    const url = browserPaneAddress(address);
    if (!url) throw new BrowserPaneRefused('Enter a web address such as example.com.');
    await navigate(pane, url);
  } else {
    const shown = stateOf(pane).url;
    if (shown !== null && pane.refusedHost === null && mayLoadNow(shown))
      pane.view.setVisible(true);
  }
  return stateOf(pane);
}

export async function navigateBrowserPane(
  window: BrowserWindow,
  address: string,
): Promise<BrowserPaneState> {
  const pane = requirePane(window);
  const url = browserPaneAddress(address);
  if (!url) throw new BrowserPaneRefused('Enter a web address such as example.com.');
  await navigate(pane, url);
  return stateOf(pane);
}

export function stepBrowserPane(
  window: BrowserWindow,
  step: 'back' | 'forward' | 'reload',
): BrowserPaneState {
  const pane = requirePane(window);
  const contents = pane.view.webContents;
  const history = contents.navigationHistory;
  const offset = step === 'back' ? -1 : step === 'forward' ? 1 : 0;
  if ((step === 'back' && !history.canGoBack()) || (step === 'forward' && !history.canGoForward()))
    return stateOf(pane);
  const target =
    offset === 0
      ? contents.getURL()
      : history.getEntryAtIndex(history.getActiveIndex() + offset)?.url;
  if (!target) return stateOf(pane);
  if (!mayLoadNow(target)) {
    refuse(pane, hostOf(target));
    return stateOf(pane);
  }
  pane.refusedHost = null;
  pane.view.setVisible(true);
  if (step === 'back') history.goBack();
  if (step === 'forward') history.goForward();
  if (step === 'reload') contents.reload();
  return stateOf(pane);
}

export function setBrowserPaneBounds(
  window: BrowserWindow,
  bounds: BrowserPaneBounds,
): BrowserPaneState {
  const pane = requirePane(window);
  pane.view.setBounds(clampBounds(window, bounds));
  return stateOf(pane);
}

export function hideBrowserPane(window: BrowserWindow): BrowserPaneState {
  const pane = paneFor(window);
  pane?.view.setVisible(false);
  return stateOf(pane);
}

export function closeBrowserPane(window: BrowserWindow): BrowserPaneState {
  const pane = paneFor(window);
  if (pane) {
    window.contentView.removeChildView(pane.view);
    pane.view.webContents.close();
    panes.delete(window.id);
  }
  return CLOSED_BROWSER_PANE;
}

export function browserPaneState(window: BrowserWindow): BrowserPaneState {
  return stateOf(paneFor(window));
}

export function readBrowserPaneConsole(
  window: BrowserWindow,
  clear: boolean,
): PreviewConsoleReport | null {
  const pane = paneFor(window);
  const url = stateOf(pane).url;
  if (!pane || url === null) return null;
  return { url, ...pane.consoleErrors.read(clear) };
}

export async function clearBrowserPaneData(): Promise<void> {
  const target = ensureSession();
  await target.clearStorageData();
  await target.clearCache();
}

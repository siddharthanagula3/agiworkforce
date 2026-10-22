import { BrowserWindow, session, shell } from 'electron';
import { localPreviewUrl, type PreviewConsoleReport } from '@agiworkforce/local-runtime-contract';
import { PreviewConsoleBuffer } from './previewConsole';

const PREVIEW_PARTITION = 'agi-local-preview';
const PREVIEW_WIDTH = 1_200;
const PREVIEW_HEIGHT = 820;

let preview: BrowserWindow | null = null;
const consoleErrors = new PreviewConsoleBuffer();

function isWebAddress(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * A page that leaves this computer goes to the user's own browser: the preview
 * is for what a session is building here, and it has no account of its own.
 */
function keepLocal(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    const local = localPreviewUrl(url);
    if (local) void win.loadURL(local);
    else if (isWebAddress(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (localPreviewUrl(url)) return;
    event.preventDefault();
    if (isWebAddress(url)) void shell.openExternal(url);
  });
}

function watchConsole(win: BrowserWindow): void {
  consoleErrors.reset();
  win.webContents.on('console-message', (details) => {
    if (details.level !== 'error') return;
    consoleErrors.record({
      message: details.message,
      source: details.sourceId,
      line: details.lineNumber,
    });
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    consoleErrors.record({ message: `The preview page stopped (${details.reason}).` });
  });
  win.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) consoleErrors.reset();
  });
}

function createPreview(): BrowserWindow {
  const previewSession = session.fromPartition(PREVIEW_PARTITION);
  previewSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  previewSession.setPermissionCheckHandler(() => false);
  const win = new BrowserWindow({
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    title: 'Preview',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      session: previewSession,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
    },
  });
  keepLocal(win);
  watchConsole(win);
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show();
  });
  win.on('closed', () => {
    preview = null;
    consoleErrors.reset();
  });
  return win;
}

/**
 * Opens what a session is serving on this computer in one window of its own,
 * with no bridge into the app and no permission to anything, reusing the
 * window when it is already open.
 */
export async function openLocalPreview(raw: unknown): Promise<{ url: string }> {
  const url = localPreviewUrl(raw);
  if (!url) throw new Error('Only a page served on this computer can be previewed.');
  const win = preview && !preview.isDestroyed() ? preview : createPreview();
  preview = win;
  if (win.isVisible()) win.focus();
  else win.show();
  try {
    await win.loadURL(url);
  } catch (error) {
    if (!String(error).includes('ERR_ABORTED')) {
      throw new Error(`Nothing answered at ${url}. Check that the server is still running.`);
    }
  }
  return { url };
}

export function closeLocalPreview(): void {
  if (preview && !preview.isDestroyed()) preview.destroy();
  preview = null;
}

/**
 * The errors the open preview page logged since they were last cleared, so
 * the agent can see what a page it built does when it runs.
 */
export function readPreviewConsoleErrors(clear: boolean): PreviewConsoleReport {
  const open = preview && !preview.isDestroyed() ? preview : null;
  const { errors, dropped } = consoleErrors.read(clear);
  return { url: open ? localPreviewUrl(open.webContents.getURL()) : null, errors, dropped };
}

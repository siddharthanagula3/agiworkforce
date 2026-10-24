import { BrowserWindow, clipboard, nativeTheme } from 'electron';
import QRCode from 'qrcode';
import { REMOTE_SESSION_PARTITION } from '../config';
import type { RemotePairingDisplay } from '@agiworkforce/utils/remote-control';
import { PRODUCT_NAMES } from '@agiworkforce/types';
import { escapeHtml, shellDataUrl, shellPaletteCss } from '../shellPage';
import { pageBackgroundColor } from '../windowChrome';

const WINDOW_WIDTH = 380;
const WINDOW_HEIGHT = 520;
const QR_SIZE = 240;

const TITLE = 'Pair a phone';
const HOW_TO_PAIR = `Open ${PRODUCT_NAMES.mobile} on your phone, choose Pair with Desktop, and scan this code. It works once and expires in a few minutes.`;
const COPY_CODE = 'Copy code';
const CODE_COPIED = 'Code copied';
const REFRESH_CODE = 'Refresh code';
const OPEN_APP_TO_REFRESH = `Open ${PRODUCT_NAMES.desktop} to refresh the code.`;
const COPY_ACTION_URL = 'agi-pairing:copy-code';
const REFRESH_ACTION_URL = 'agi-pairing:refresh-code';
const CLOSE_TO_CANCEL = 'Closing this window cancels pairing.';

let current: BrowserWindow | null = null;
let generation = 0;

interface PageState {
  copied: boolean;
  appClosed: boolean;
}

function pairingPage(qrSvg: string, code: string, { copied, appClosed }: PageState): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${TITLE}</title>
<style>
  ${shellPaletteCss()}
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 24px; font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: var(--ground); color: var(--ink); text-align: center; -webkit-font-smoothing: antialiased; }
  h1 { margin: 0 0 8px; font-size: 18px; font-weight: 600; }
  p { margin: 0 0 16px; }
  .qr { display: inline-block; padding: 12px; border-radius: 12px; background: white; line-height: 0; }
  .qr svg { width: ${QR_SIZE}px; height: ${QR_SIZE}px; }
  .actions { margin: 0 0 16px; }
  .action { display: inline-block; margin: 0 4px; padding: 6px 14px; border: 1px solid var(--ink-2); border-radius: 999px; font-size: 14px; color: var(--ink); text-decoration: none; }
  .code { margin: 16px 0 8px; font: 18px/1.2 ui-monospace, Menlo, monospace; letter-spacing: 0.2em; }
</style>
</head>
<body>
<h1>${TITLE}</h1>
<p>${HOW_TO_PAIR}</p>
<div class="qr">${qrSvg}</div>
<div class="code">${escapeHtml(code)}</div>
<div class="actions">
<a class="action" href="${COPY_ACTION_URL}" role="button">${copied ? CODE_COPIED : COPY_CODE}</a>
<a class="action" href="${REFRESH_ACTION_URL}" role="button">${REFRESH_CODE}</a>
</div>
${appClosed ? `<p>${OPEN_APP_TO_REFRESH}</p>` : ''}
<p>${CLOSE_TO_CANCEL}</p>
</body>
</html>`;
}

export function closePairingWindow(): void {
  generation += 1;
  const win = current;
  current = null;
  if (win && !win.isDestroyed()) win.close();
}

/**
 * The QR code carries the pairing secret, and anything the website's page can
 * see, a script it loaded can see too. So it is never sent to the page: main
 * draws it here, as a `data:` page in a window that runs no script, has no
 * preload, and can neither navigate nor open another window.
 */
export async function showPairingWindow(
  parent: BrowserWindow | null,
  pairing: RemotePairingDisplay,
  onDismissed: () => void,
  onRefreshRequested: () => boolean,
): Promise<void> {
  closePairingWindow();
  const shown = generation;
  const qrSvg = await QRCode.toString(pairing.qrPayload, { type: 'svg', margin: 1 });
  if (shown !== generation) return;

  const win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    title: TITLE,
    show: false,
    backgroundColor: pageBackgroundColor(nativeTheme.shouldUseDarkColors),
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    ...(parent && !parent.isDestroyed() ? { parent } : {}),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      javascript: false,
      partition: REMOTE_SESSION_PARTITION,
    },
  });
  current = win;

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const loadPage = (state: PageState) =>
    win.loadURL(shellDataUrl(pairingPage(qrSvg, pairing.code, state)));
  win.webContents.on('will-navigate', (event) => {
    event.preventDefault();
    if (current !== win) return;
    if (event.url === COPY_ACTION_URL) {
      clipboard.writeText(pairing.code);
      void loadPage({ copied: true, appClosed: false });
    } else if (event.url === REFRESH_ACTION_URL && !onRefreshRequested()) {
      void loadPage({ copied: false, appClosed: true });
    }
  });
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show();
  });
  win.on('closed', () => {
    if (current !== win) return;
    current = null;
    onDismissed();
  });

  void loadPage({ copied: false, appClosed: false });
}

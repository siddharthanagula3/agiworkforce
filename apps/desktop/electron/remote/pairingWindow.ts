import { BrowserWindow } from 'electron';
import QRCode from 'qrcode';
import { REMOTE_SESSION_PARTITION } from '../config';
import type { RemotePairingDisplay } from '@agiworkforce/utils/remote-control';
import { PRODUCT_NAMES } from '@agiworkforce/types';

const WINDOW_WIDTH = 380;
const WINDOW_HEIGHT = 520;
const QR_SIZE = 240;

const TITLE = 'Pair a phone';
const HOW_TO_PAIR = `Open ${PRODUCT_NAMES.mobile} on your phone, choose Pair with Desktop, and scan this code. It works once and expires in a few minutes.`;
const CLOSE_TO_CANCEL = 'Closing this window cancels pairing.';

let current: BrowserWindow | null = null;
let generation = 0;

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');
}

function pairingPage(qrSvg: string, code: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${TITLE}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 24px; font: 15px/1.45 system-ui, sans-serif; background: Canvas; color: CanvasText; text-align: center; }
  h1 { margin: 0 0 8px; font-size: 18px; font-weight: 600; }
  p { margin: 0 0 16px; }
  .qr { display: inline-block; padding: 12px; border-radius: 12px; background: white; line-height: 0; }
  .qr svg { width: ${QR_SIZE}px; height: ${QR_SIZE}px; }
  .code { margin: 16px 0 8px; font: 18px/1.2 ui-monospace, Menlo, monospace; letter-spacing: 0.2em; }
</style>
</head>
<body>
<h1>${TITLE}</h1>
<p>${HOW_TO_PAIR}</p>
<div class="qr">${qrSvg}</div>
<div class="code">${escapeHtml(code)}</div>
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
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show();
  });
  win.on('closed', () => {
    if (current !== win) return;
    current = null;
    onDismissed();
  });

  void win.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(pairingPage(qrSvg, pairing.code))}`,
  );
}

import { BrowserWindow, nativeTheme, type Display } from 'electron';
import { shellDataUrl, shellPaletteCss } from './shellPage';
import { pageBackgroundColor } from './windowChrome';

export const RECORDER_OVERLAY_STOP_URL = 'agi-recorder:stop';
export const RECORDER_OVERLAY_LABEL = 'Recording';
export const RECORDER_OVERLAY_STOP_LABEL = 'Stop';
export const RECORDER_OVERLAY_SHOW_TIMEOUT_MS = 3_000;

const OVERLAY_WIDTH = 240;
const OVERLAY_HEIGHT = 52;
const OVERLAY_TOP_GAP = 12;

export interface RecorderOverlay {
  shown: Promise<boolean>;
  close(): void;
}

export function recorderOverlayBounds(workArea: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.round(workArea.x + (workArea.width - OVERLAY_WIDTH) / 2),
    y: Math.round(workArea.y + OVERLAY_TOP_GAP),
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
  };
}

export function recorderOverlayUrl(startedAt: number): string {
  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="color-scheme" content="light dark"><title>${RECORDER_OVERLAY_LABEL}</title><style>
  ${shellPaletteCss()}
  html,body{height:100%;margin:0;overflow:hidden}
  body{background:var(--ground);color:var(--ink);display:flex;align-items:center;
    gap:10px;padding:0 10px 0 16px;box-sizing:border-box;-webkit-user-select:none;
    font:14px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
  .dot{width:10px;height:10px;border-radius:50%;background:var(--ink);animation:pulse 1.6s ease-in-out infinite}
  @keyframes pulse{50%{opacity:.35}}
  @media (prefers-reduced-motion:reduce){.dot{animation:none}}
  .label{font-weight:600}
  time{color:var(--ink-2);font-variant-numeric:tabular-nums;flex:1}
  button{background:var(--ink);color:var(--ground);border:0;border-radius:999px;
    padding:8px 16px;font:inherit;font-weight:600;cursor:pointer}
  button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
</style></head><body role="status" aria-live="polite">
  <span class="dot" aria-hidden="true"></span>
  <span class="label">${RECORDER_OVERLAY_LABEL}</span>
  <time id="elapsed">0:00</time>
  <button id="stop" type="button">${RECORDER_OVERLAY_STOP_LABEL}</button>
<script>
  var startedAt=${String(Math.trunc(startedAt))};
  var elapsed=document.getElementById('elapsed');
  function tick(){var s=Math.max(0,Math.floor((Date.now()-startedAt)/1000));
    elapsed.textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
  tick();setInterval(tick,1000);
  document.getElementById('stop').addEventListener('click',function(){
    location.href=${JSON.stringify(RECORDER_OVERLAY_STOP_URL)};
  });
</script></body></html>`;
  return shellDataUrl(html);
}

/**
 * The indicator is the recording's lifeline: whatever closes it, the Stop
 * button, a failed load, or the window going away for any other reason, stops
 * the recording, so a capture never runs without it on screen. `shown` settles
 * true only once it is visible on `display`, and false when it fails to load or
 * is not visible within the show timeout; the caller captures nothing before
 * it is true. Content protection keeps it out of the frames it is announcing.
 */
export function openRecorderOverlay(options: {
  startedAt: number;
  display: Pick<Display, 'workArea'>;
  onStop: () => void;
}): RecorderOverlay {
  const win = new BrowserWindow({
    ...recorderOverlayBounds(options.display.workArea),
    show: false,
    backgroundColor: pageBackgroundColor(nativeTheme.shouldUseDarkColors),
    frame: false,
    focusable: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    closable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    ...(process.platform === 'darwin' ? { type: 'panel' as const, roundedCorners: true } : {}),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      javascript: true,
      spellcheck: false,
    },
  });
  let closedByOwner = false;
  let settleShown: (visible: boolean) => void = () => undefined;
  const shown = new Promise<boolean>((resolve) => {
    settleShown = (visible) => {
      clearTimeout(showTimer);
      settleShown = () => undefined;
      resolve(visible);
    };
  });
  const destroy = (): void => {
    if (!win.isDestroyed()) win.destroy();
  };
  const showTimer = setTimeout(() => {
    settleShown(false);
    destroy();
  }, RECORDER_OVERLAY_SHOW_TIMEOUT_MS);
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setContentProtection(true);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    if (url === RECORDER_OVERLAY_STOP_URL) options.onStop();
  });
  win.webContents.on('did-fail-load', () => {
    settleShown(false);
    destroy();
  });
  win.webContents.on('render-process-gone', () => {
    settleShown(false);
    destroy();
  });
  win.once('ready-to-show', () => {
    if (win.isDestroyed()) return;
    win.showInactive();
    settleShown(win.isVisible());
  });
  win.on('closed', () => {
    settleShown(false);
    if (!closedByOwner) options.onStop();
  });
  win.loadURL(recorderOverlayUrl(options.startedAt)).catch(() => {
    settleShown(false);
    destroy();
  });

  return {
    shown,
    close() {
      closedByOwner = true;
      settleShown(false);
      destroy();
    },
  };
}

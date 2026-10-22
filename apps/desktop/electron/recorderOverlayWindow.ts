import { BrowserWindow, nativeTheme, screen } from 'electron';
import { pageBackgroundColor } from './windowChrome';

export const RECORDER_OVERLAY_STOP_URL = 'agi-recorder:stop';
export const RECORDER_OVERLAY_LABEL = 'Recording';
export const RECORDER_OVERLAY_STOP_LABEL = 'Stop';

const OVERLAY_WIDTH = 240;
const OVERLAY_HEIGHT = 52;
const OVERLAY_TOP_GAP = 12;

export interface RecorderOverlay {
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

export function recorderOverlayUrl(startedAt: number, prefersDark: boolean): string {
  const text = prefersDark ? '#ececec' : '#0d0d0d';
  const muted = prefersDark ? '#b4b4b4' : '#5d5d5d';
  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="color-scheme" content="${prefersDark ? 'dark' : 'light'}"><title>${RECORDER_OVERLAY_LABEL}</title><style>
  html,body{height:100%;margin:0;overflow:hidden}
  body{background:${pageBackgroundColor(prefersDark)};color:${text};display:flex;align-items:center;
    gap:10px;padding:0 10px 0 16px;box-sizing:border-box;-webkit-user-select:none;
    font:14px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
  .dot{width:10px;height:10px;border-radius:50%;background:${text};animation:pulse 1.6s ease-in-out infinite}
  @keyframes pulse{50%{opacity:.35}}
  @media (prefers-reduced-motion:reduce){.dot{animation:none}}
  .label{font-weight:600}
  time{color:${muted};font-variant-numeric:tabular-nums;flex:1}
  button{background:${text};color:${pageBackgroundColor(prefersDark)};border:0;border-radius:999px;
    padding:8px 16px;font:inherit;font-weight:600;cursor:pointer}
  button:focus-visible{outline:2px solid ${text};outline-offset:2px}
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
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

/**
 * The indicator is the recording's lifeline: whatever closes it, the Stop
 * button or the window going away for any other reason, stops the recording,
 * so a capture never runs without it on screen. Content protection keeps it
 * out of the frames it is announcing.
 */
export function openRecorderOverlay(options: {
  startedAt: number;
  onStop: () => void;
}): RecorderOverlay {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const win = new BrowserWindow({
    ...recorderOverlayBounds(display.workArea),
    show: false,
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
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setContentProtection(true);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    if (url === RECORDER_OVERLAY_STOP_URL) options.onStop();
  });
  win.webContents.on('render-process-gone', () => {
    if (!win.isDestroyed()) win.destroy();
  });
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.showInactive();
  });
  win.on('closed', () => {
    if (!closedByOwner) options.onStop();
  });
  void win.loadURL(recorderOverlayUrl(options.startedAt, nativeTheme.shouldUseDarkColors));

  return {
    close() {
      closedByOwner = true;
      if (!win.isDestroyed()) win.destroy();
    },
  };
}

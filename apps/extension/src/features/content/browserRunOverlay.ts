import { t } from '../../i18n';
import { getExtensionTokensCssAuto } from '../../tokens';

export type PageRunControl = 'stop' | 'takeover';

export function createBrowserRunOverlay(runId: string, control: (command: PageRunControl) => void) {
  const host = document.createElement('div');
  host.dataset['agiRunOverlay'] = '';
  host.style.cssText =
    'all:initial!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483647!important;';
  const root = host.attachShadow({ mode: 'closed' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    ${getExtensionTokensCssAuto(':host')}
    .corners { position:absolute; inset:0; pointer-events:none;
      background:radial-gradient(ellipse 100px 86px at top left,var(--agi-ext-accent),transparent),
        radial-gradient(ellipse 100px 86px at top right,var(--agi-ext-accent),transparent),
        radial-gradient(ellipse 100px 86px at bottom left,var(--agi-ext-accent),transparent),
        radial-gradient(ellipse 100px 86px at bottom right,var(--agi-ext-accent),transparent); opacity:.60; }
    .pointer { position:absolute; top:0; left:0; pointer-events:none; width:20px; height:26px;
      filter:drop-shadow(0 0 1px white) drop-shadow(0 1px 2px black); transition:transform 65ms linear; }
    .pointer::before { content:''; position:absolute; inset:0; background:var(--agi-ext-accent);
      clip-path:polygon(0 0,94% 63%,56% 65%,74% 94%,53% 100%,35% 71%,9% 93%); }
    .dock { position:absolute; bottom:max(14px,env(safe-area-inset-bottom)); left:50%; transform:translateX(-50%);
      display:flex; align-items:center; gap:4px; pointer-events:auto; white-space:nowrap; border:1px solid var(--agi-ext-border-control);
      background:var(--agi-ext-surface); border-radius:999px; padding:4px; box-shadow:var(--agi-ext-shadow-panel); }
    button { font:600 14px/1.3 system-ui,sans-serif; min-height:36px; padding:0 14px; border:0; color:var(--agi-ext-text);
      background:transparent; border-radius:999px; cursor:pointer; }
    button:hover { background:var(--agi-ext-hover); } button:focus-visible { outline:2px solid var(--agi-ext-focus); }
    button:disabled { color:var(--agi-ext-text-muted); cursor:default; }
    @media (pointer:coarse) { button { min-height:44px; } }
    @media (prefers-reduced-motion:reduce) { .pointer { transition:none; } }
    @media (forced-colors:active) { .corners { border:2px solid Highlight; } .pointer::before { forced-color-adjust:none; background:Highlight; } }
  `);
  root.adoptedStyleSheets = [sheet];
  const corners = document.createElement('div');
  corners.className = 'corners';
  const pointer = document.createElement('div');
  pointer.className = 'pointer';
  const dock = document.createElement('div');
  dock.className = 'dock';
  dock.setAttribute('role', 'group');
  dock.setAttribute('aria-label', t('spBrowserRunControls'));
  const button = (label: string, command: PageRunControl) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.onclick = (event) => {
      if (event.isTrusted) control(command);
    };
    dock.appendChild(b);
    return b;
  };
  button(t('spTasksStop'), 'stop');
  const takeover = button(t('spBrowserTakeOver'), 'takeover');
  root.append(corners, pointer, dock);
  document.documentElement.appendChild(host);
  const move = (x: number, y: number) => {
    if (Number.isFinite(x) && Number.isFinite(y))
      pointer.style.transform = `translate(${x}px,${y}px)`;
  };
  move(innerWidth / 2, innerHeight / 2);
  const follow = (event: MouseEvent) => {
    if (event.isTrusted && !pointer.hidden && event.target !== host)
      move(event.clientX, event.clientY);
  };
  const events = ['pointermove', 'pointerdown', 'wheel'] as const;
  for (const type of events)
    window.addEventListener(type, follow, { capture: true, passive: true });
  return {
    runId,
    host,
    move,
    setPaused(paused: boolean) {
      pointer.hidden = corners.hidden = paused;
      takeover.disabled = paused;
      const label = paused ? t('cuTakeoverByUserReason') : t('spBrowserTakeOver');
      takeover.textContent = label;
    },
    remove() {
      for (const type of events) window.removeEventListener(type, follow, true);
      host.remove();
    },
  };
}

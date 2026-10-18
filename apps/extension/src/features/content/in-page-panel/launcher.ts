/**
 * Floating launcher button for the in-page chat overlay.
 *
 * Renders a 48px circular FAB anchored bottom-right. Hides on scroll-down,
 * reappears on scroll-up (Headroom-style). Persists its bottom/right offset
 * in chrome.storage.local under "agi_panel_launcher_pos" so custom positions
 * survive page reloads. The position is currently locked to bottom-right
 * (future: drag support).
 *
 * Uses Shadow DOM (`mode:'open'`) so page CSS cannot leak into the launcher.
 *
 * @module inPagePanel/launcher
 */

import { getExtensionTokensCssAuto } from '../../../tokens';

export interface LauncherPosition {
  bottom: number;
  right: number;
}

const STORAGE_KEY = 'agi_panel_launcher_pos';
const DEFAULT_POS: LauncherPosition = { bottom: 24, right: 24 };

export function buildLauncherStyles(): string {
  return `
    ${getExtensionTokensCssAuto(':host')}
    :host { display:block; }
    .agi-launcher-btn {
      width:48px; height:48px;
      background:var(--agi-ext-primary);
      border-radius:50%;
      border:1px solid var(--agi-ext-border-control);
      cursor:pointer;
      display:flex; align-items:center; justify-content:center;
      box-shadow:0 8px 24px var(--agi-ext-modal-shadow);
      pointer-events:all;
      transition:background 0.18s,transform 0.18s,box-shadow 0.18s;
      color:var(--agi-ext-on-primary);
      font-size:20px;
      line-height:1;
      user-select:none;
      -webkit-user-select:none;
    }
    .agi-launcher-btn:hover {
      background:var(--agi-ext-primary-hover);
      transform:scale(1.08);
      box-shadow:0 10px 30px var(--agi-ext-modal-shadow);
    }
    .agi-launcher-btn:active { transform:scale(0.95); }
    .agi-launcher-btn:focus-visible {
      outline:2px solid var(--agi-ext-focus);
      outline-offset:3px;
    }
    .agi-tooltip {
      position:absolute;
      right:56px; bottom:10px;
      background:var(--agi-ext-surface); color:var(--agi-ext-text);
      border:1px solid var(--agi-ext-border);
      box-shadow:0 8px 24px var(--agi-ext-modal-shadow);
      font-size:12px;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      padding:6px 10px; border-radius:10px;
      white-space:nowrap; pointer-events:none;
      opacity:0; transition:opacity 0.18s;
    }
    .agi-launcher-btn:hover ~ .agi-tooltip,
    .agi-launcher-btn:focus-visible ~ .agi-tooltip { opacity:1; }
    @media (prefers-reduced-motion: reduce) {
      .agi-launcher-btn, .agi-tooltip { transition:none; }
    }
  `;
}

export async function savePosition(pos: LauncherPosition): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: pos });
  } catch {
    // Non-fatal: extension context may be invalidated during hot-reload.
  }
}

export async function loadPosition(): Promise<LauncherPosition> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY] as Partial<LauncherPosition> | undefined;
    if (
      stored &&
      typeof stored.bottom === 'number' &&
      typeof stored.right === 'number' &&
      stored.bottom >= 0 &&
      stored.right >= 0
    ) {
      return { bottom: stored.bottom, right: stored.right };
    }
  } catch {
    // Fall through to default.
  }
  return { ...DEFAULT_POS };
}

export function setImportantStyles(host: HTMLElement, styles: Record<string, string>): void {
  for (const [property, value] of Object.entries(styles)) {
    host.style.setProperty(property, value, 'important');
  }
}

export function applyPosition(host: HTMLElement, pos: LauncherPosition): void {
  setImportantStyles(host, { bottom: `${pos.bottom}px`, right: `${pos.right}px` });
}

/**
 * Create and inject the floating launcher button into the page.
 *
 * Returns the host element so the caller can show/hide it.
 * ShadowRoot is held internally (mode:'closed') to prevent page scripts from
 * reaching inside the shadow tree.
 *
 * @param onOpen Called when the user clicks the launcher button.
 * @param onEscape Called when Escape is pressed while focus is inside the launcher.
 */
export function createLauncher(
  onOpen: () => void,
  onEscape: () => void,
): {
  host: HTMLElement;
  button: HTMLButtonElement;
} {
  const host = document.createElement('div');
  host.setAttribute('data-agi-launcher', 'true');
  setImportantStyles(host, {
    all: 'initial',
    display: 'block',
    position: 'fixed',
    bottom: `${DEFAULT_POS.bottom}px`,
    right: `${DEFAULT_POS.right}px`,
    'z-index': '2147483646',
    'pointer-events': 'none',
    transition: 'opacity 0.25s,transform 0.25s',
    'will-change': 'opacity,transform',
  });

  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = buildLauncherStyles();

  const button = document.createElement('button');
  button.className = 'agi-launcher-btn';
  button.setAttribute('aria-label', 'Open AGI');
  button.setAttribute('type', 'button');
  button.textContent = 'A';

  const tooltip = document.createElement('div');
  tooltip.className = 'agi-tooltip';
  tooltip.textContent = 'Ask AGI';

  button.addEventListener('click', onOpen);
  host.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') onEscape();
  });

  shadow.appendChild(style);
  shadow.appendChild(button);
  shadow.appendChild(tooltip);

  return { host, button };
}

export function attachScrollBehaviour(host: HTMLElement): () => void {
  const THRESHOLD = 80;
  let lastY = window.scrollY;
  let hidden = false;

  function onScroll(): void {
    const currentY = window.scrollY;
    const delta = currentY - lastY;

    if (!hidden && delta > THRESHOLD) {
      hidden = true;
      setImportantStyles(host, {
        opacity: '0',
        transform: 'translateY(16px)',
        'pointer-events': 'none',
        visibility: 'hidden',
      });
    } else if (hidden && delta < -20) {
      hidden = false;
      setImportantStyles(host, {
        opacity: '1',
        transform: 'translateY(0)',
        'pointer-events': 'none',
        visibility: 'visible',
      });
    }

    lastY = currentY;
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  return () => window.removeEventListener('scroll', onScroll);
}

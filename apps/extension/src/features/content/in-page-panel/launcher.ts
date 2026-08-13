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

/** Bottom and right offsets in px. */
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
      background:var(--agi-ext-accent);
      border-radius:50%;
      border:1px solid color-mix(in srgb, var(--agi-ext-on-accent) 18%, transparent);
      cursor:pointer;
      display:flex; align-items:center; justify-content:center;
      box-shadow:0 8px 24px color-mix(in srgb, var(--agi-ext-accent) 34%, transparent);
      pointer-events:all;
      transition:transform 0.18s,box-shadow 0.18s;
      color:var(--agi-ext-on-accent);
      font-size:20px;
      line-height:1;
      user-select:none;
      -webkit-user-select:none;
    }
    .agi-launcher-btn:hover {
      transform:scale(1.08);
      box-shadow:0 10px 30px color-mix(in srgb, var(--agi-ext-accent) 44%, transparent);
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
      box-shadow:0 8px 24px color-mix(in srgb, black 20%, transparent);
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

/**
 * Persist position to chrome.storage.local.
 * Silently swallows errors (unavailable in tests / non-extension contexts).
 */
export async function savePosition(pos: LauncherPosition): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: pos });
  } catch {
    // Non-fatal: extension context may be invalidated during hot-reload.
  }
}

/**
 * Load persisted position from storage, falling back to DEFAULT_POS.
 */
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

/**
 * Apply a LauncherPosition object to the host element's inline style.
 */
export function applyPosition(host: HTMLElement, pos: LauncherPosition): void {
  host.style.bottom = `${pos.bottom}px`;
  host.style.right = `${pos.right}px`;
}

/**
 * Create and inject the floating launcher button into the page.
 *
 * Returns the host element so the caller can show/hide it.
 * ShadowRoot is held internally (mode:'closed') to prevent page scripts from
 * reaching inside the shadow tree.
 *
 * @param onOpen Called when the user clicks the launcher button.
 */
export function createLauncher(onOpen: () => void): {
  host: HTMLElement;
  button: HTMLButtonElement;
} {
  // ── Host element (fixed-position wrapper) ──────────────────────────────────
  const host = document.createElement('div');
  host.setAttribute('data-agi-launcher', 'true');
  host.style.cssText = [
    'position:fixed',
    `bottom:${DEFAULT_POS.bottom}px`,
    `right:${DEFAULT_POS.right}px`,
    'z-index:2147483646',
    'pointer-events:none',
    'transition:opacity 0.25s,transform 0.25s',
    'will-change:opacity,transform',
  ].join(';');

  const shadow = host.attachShadow({ mode: 'closed' });

  // ── Styles ─────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = buildLauncherStyles();

  // ── Button ─────────────────────────────────────────────────────────────────
  const button = document.createElement('button');
  button.className = 'agi-launcher-btn';
  button.setAttribute('aria-label', 'Open AGI');
  button.setAttribute('type', 'button');
  button.textContent = 'A';

  // ── Tooltip ────────────────────────────────────────────────────────────────
  const tooltip = document.createElement('div');
  tooltip.className = 'agi-tooltip';
  tooltip.textContent = 'Ask AGI';

  button.addEventListener('click', onOpen);

  shadow.appendChild(style);
  shadow.appendChild(button);
  shadow.appendChild(tooltip);

  return { host, button };
}

/**
 * Attach scroll-hide / scroll-show behaviour to the launcher host element.
 * Hides when the user scrolls down more than 80px, re-shows on scroll-up.
 *
 * Returns a cleanup function that removes the scroll listener.
 */
export function attachScrollBehaviour(host: HTMLElement): () => void {
  const THRESHOLD = 80;
  let lastY = window.scrollY;
  let hidden = false;

  function onScroll(): void {
    const currentY = window.scrollY;
    const delta = currentY - lastY;

    if (!hidden && delta > THRESHOLD) {
      hidden = true;
      host.style.opacity = '0';
      host.style.transform = 'translateY(16px)';
      // `pointer-events:none` on the host does NOT block the button: it lives in
      // a closed shadow root and sets `pointer-events:all`, which re-enables hit
      // testing on itself regardless of the host. `visibility:hidden` removes the
      // whole subtree (button included) from hit testing, so the invisible FAB is
      // not a clickable target while hidden.
      host.style.pointerEvents = 'none';
      host.style.visibility = 'hidden';
    } else if (hidden && delta < -20) {
      hidden = false;
      host.style.opacity = '1';
      host.style.transform = 'translateY(0)';
      host.style.pointerEvents = 'none'; // pointer-events on host stays none; button has 'all'
      host.style.visibility = 'visible';
    }

    lastY = currentY;
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  return () => window.removeEventListener('scroll', onScroll);
}

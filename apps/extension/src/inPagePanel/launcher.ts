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

/** Bottom and right offsets in px. */
export interface LauncherPosition {
  bottom: number;
  right: number;
}

const STORAGE_KEY = 'agi_panel_launcher_pos';
const DEFAULT_POS: LauncherPosition = { bottom: 24, right: 24 };

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
 * Returns the host element so the caller can show/hide it and the
 * ShadowRoot so the caller can access the button reference.
 *
 * @param onOpen Called when the user clicks the launcher button.
 */
export function createLauncher(onOpen: () => void): {
  host: HTMLElement;
  shadow: ShadowRoot;
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

  const shadow = host.attachShadow({ mode: 'open' });

  // ── Styles ─────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    :host { display:block; }
    .agi-launcher-btn {
      width:48px; height:48px;
      background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);
      border-radius:50%;
      border:none;
      cursor:pointer;
      display:flex; align-items:center; justify-content:center;
      box-shadow:0 4px 16px rgba(99,102,241,0.55);
      pointer-events:all;
      transition:transform 0.18s,box-shadow 0.18s;
      color:#fff;
      font-size:20px;
      line-height:1;
      user-select:none;
      -webkit-user-select:none;
    }
    .agi-launcher-btn:hover {
      transform:scale(1.1);
      box-shadow:0 6px 24px rgba(99,102,241,0.75);
    }
    .agi-launcher-btn:active {
      transform:scale(0.95);
    }
    .agi-tooltip {
      position:absolute;
      right:56px; bottom:10px;
      background:#1f2937; color:#f9fafb;
      font-size:12px;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      padding:5px 10px; border-radius:6px;
      white-space:nowrap; pointer-events:none;
      opacity:0; transition:opacity 0.18s;
    }
    .agi-launcher-btn:hover ~ .agi-tooltip { opacity:1; }
  `;

  // ── Button ─────────────────────────────────────────────────────────────────
  const button = document.createElement('button');
  button.className = 'agi-launcher-btn';
  button.setAttribute('aria-label', 'Open AGI Workforce chat');
  button.setAttribute('type', 'button');
  // Use text-based icon (no external asset fetch — CSP-safe)
  button.textContent = '⚡';

  // ── Tooltip ────────────────────────────────────────────────────────────────
  const tooltip = document.createElement('div');
  tooltip.className = 'agi-tooltip';
  tooltip.textContent = 'Ask AGI Workforce';

  button.addEventListener('click', onOpen);

  shadow.appendChild(style);
  shadow.appendChild(button);
  shadow.appendChild(tooltip);

  return { host, shadow, button };
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
      host.style.pointerEvents = 'none';
    } else if (hidden && delta < -20) {
      hidden = false;
      host.style.opacity = '1';
      host.style.transform = 'translateY(0)';
      host.style.pointerEvents = 'none'; // pointer-events on host stays none; button has 'all'
    }

    lastY = currentY;
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  return () => window.removeEventListener('scroll', onScroll);
}

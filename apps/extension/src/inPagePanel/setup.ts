import {
  createLauncher,
  loadPosition,
  applyPosition,
  attachScrollBehaviour,
} from '../features/content/in-page-panel/launcher';
import { createPanel } from '../features/content/in-page-panel/panel';

export const IN_PAGE_PANEL_ENABLED_KEY = 'in_page_panel_enabled';

export async function isPanelEnabled(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(IN_PAGE_PANEL_ENABLED_KEY);
    const val = result[IN_PAGE_PANEL_ENABLED_KEY];
    return val !== false;
  } catch {
    return true;
  }
}

/**
 * Inject the floating launcher + slide-in panel into the current page.
 *
 * Safe to call on any http/https page. Skips non-http(s) protocols and
 * idempotently does nothing if the launcher has already been injected.
 *
 * @param logger Optional logger with debug/warn methods (injected by content.ts
 *   to avoid circular imports).
 */
export async function setupInPagePanel(logger?: {
  debug: (msg: string, ...args: unknown[]) => void;
  warn: (msg: string, ...args: unknown[]) => void;
}): Promise<void> {
  if (!/^https?:/.test(location.protocol)) return;

  if (document.querySelector('[data-agi-launcher]') || document.querySelector('[data-agi-panel]')) {
    return;
  }

  let allowlist: Set<string>;
  try {
    const res = await chrome.storage.local.get('agi_site_allowlist');
    const list = (res as Record<string, unknown>)['agi_site_allowlist'];
    allowlist = new Set(Array.isArray(list) ? (list as string[]) : []);
  } catch (err) {
    logger?.debug('Could not read agi_site_allowlist for in-page panel gating', err);
    return;
  }
  if (!allowlist.has(window.location.origin)) {
    logger?.debug('in-page panel skipped, origin not on user allowlist', {
      origin: window.location.origin,
    });
    return;
  }

  const enabled = await isPanelEnabled();
  if (!enabled) {
    logger?.debug('in-page panel disabled via storage flag');
    return;
  }

  try {
    const panel = createPanel();
    const { host: panelHost } = panel;
    document.body.appendChild(panelHost);

    const launcher = createLauncher(() => {
      panel.setReturnFocus(launcher.button);
      panel.toggle();
    });
    const { host: launcherHost } = launcher;

    const pos = await loadPosition();
    applyPosition(launcherHost, pos);

    document.body.appendChild(launcherHost);

    attachScrollBehaviour(launcherHost);
  } catch (err) {
    logger?.warn('setupInPagePanel failed (non-fatal)', err);
  }
}

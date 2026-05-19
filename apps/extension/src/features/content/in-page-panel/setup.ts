/**
 * In-page panel setup entry point.
 *
 * `setupInPagePanel()` is called by content.ts inside `initialize()`.
 * It is gated on the `in_page_panel_enabled` chrome.storage.local flag
 * (default: true). The user can toggle this off from the popup.
 *
 * Replaces the previous `injectFloatingOverlay()` call so the launcher and
 * panel coexist in a single shadow-DOM host tree.
 *
 * @module inPagePanel/setup
 */

import { createLauncher, loadPosition, applyPosition, attachScrollBehaviour } from './launcher';
import { createPanel } from './panel';

/** Storage key that enables / disables the in-page panel. */
export const IN_PAGE_PANEL_ENABLED_KEY = 'in_page_panel_enabled';

/**
 * Check whether the in-page panel is enabled.
 * Defaults to true if the key has never been set.
 */
export async function isPanelEnabled(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(IN_PAGE_PANEL_ENABLED_KEY);
    const val = result[IN_PAGE_PANEL_ENABLED_KEY];
    // Treat undefined (first-run) as enabled
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
  // Protocol guard — don't inject on extension / devtools / pdf pages
  if (!/^https?:/.test(location.protocol)) return;

  // Idempotency guard — content scripts run once per navigation but guard anyway
  if (document.querySelector('[data-agi-launcher]') || document.querySelector('[data-agi-panel]')) {
    return;
  }

  // Feature flag check
  const enabled = await isPanelEnabled();
  if (!enabled) {
    logger?.debug('in-page panel disabled via storage flag');
    return;
  }

  try {
    // ── Panel ────────────────────────────────────────────────────────────────
    const { host: panelHost, toggle } = createPanel();
    document.body.appendChild(panelHost);

    // ── Launcher ─────────────────────────────────────────────────────────────
    const { host: launcherHost } = createLauncher(toggle);

    // Load persisted position and apply it
    const pos = await loadPosition();
    applyPosition(launcherHost, pos);

    document.body.appendChild(launcherHost);

    // Attach scroll-hide behaviour and hold the cleanup ref (not currently used
    // since content scripts don't unload on SPA navigation, but keeping it for
    // future teardown support).
    attachScrollBehaviour(launcherHost);
  } catch (err) {
    logger?.warn('setupInPagePanel failed (non-fatal)', err);
  }
}

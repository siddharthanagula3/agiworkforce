/**
 * Live entry point for the in-page panel, imported directly by content.ts.
 * `./launcher` and `./panel` in this directory are re-export shims onto
 * `features/content/in-page-panel/{launcher,panel}.ts`, which hold the real
 * implementations.
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

  // SECURITY (M-14 audit 2026-05-19): only inject the FAB launcher on
  // allowlisted origins. The launcher was previously injected on every
  // http(s) page regardless of allowlist; clicking it on a non-allowlisted
  // page got the user a confusing "site not on your allowlist" error from
  // background.handleMessage. The launcher also acts as a fingerprint
  // (the `data-agi-launcher` attribute) on every page the user visits.
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
    logger?.debug('in-page panel skipped — origin not on user allowlist', {
      origin: window.location.origin,
    });
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

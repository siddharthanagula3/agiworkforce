import {
  createLauncher,
  loadPosition,
  applyPosition,
  attachScrollBehaviour,
} from '../features/content/in-page-panel/launcher';
import { createPanel } from '../features/content/in-page-panel/panel';
import { isSidePanelPresenceMessage } from '../features/side-panel/panelPresence';

let realSidePanelOpen = false;

function applySidePanelPresence(): void {
  for (const host of document.querySelectorAll<HTMLElement>(
    '[data-agi-launcher], [data-agi-panel]',
  )) {
    if (realSidePanelOpen) host.style.setProperty('display', 'none', 'important');
    else host.style.setProperty('display', 'block', 'important');
  }
}

function watchSidePanelPresence(): void {
  chrome.runtime.onMessage.addListener((message: unknown, sender) => {
    if (sender.id !== chrome.runtime.id || sender.tab || !isSidePanelPresenceMessage(message))
      return;
    realSidePanelOpen = message.open;
    applySidePanelPresence();
  });
  void chrome.runtime
    .sendMessage({ type: 'GET_SIDE_PANEL_OPEN' })
    .then((response: { open?: boolean } | undefined) => {
      realSidePanelOpen = response?.open === true;
      applySidePanelPresence();
    })
    .catch(() => {});
}

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
 * @param originApproved Whether this origin carries the user's approval. The
 *   content script reads it once per document and shares that one read with
 *   every gate, so this takes the shared promise as well as a plain boolean.
 * @param logger Optional logger with debug/warn methods (injected by content.ts
 *   to avoid circular imports).
 */
export async function setupInPagePanel(
  originApproved: boolean | Promise<boolean>,
  logger?: {
    debug: (msg: string, ...args: unknown[]) => void;
    warn: (msg: string, ...args: unknown[]) => void;
  },
): Promise<void> {
  if (!/^https?:/.test(location.protocol)) return;

  if (document.querySelector('[data-agi-launcher]') || document.querySelector('[data-agi-panel]')) {
    return;
  }

  if (!(await originApproved)) {
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

    const launcher = createLauncher(
      () => {
        panel.setReturnFocus(launcher.button);
        panel.toggle();
      },
      () => panel.close(),
    );
    const { host: launcherHost } = launcher;

    const pos = await loadPosition();
    applyPosition(launcherHost, pos);

    document.body.appendChild(launcherHost);

    attachScrollBehaviour(launcherHost);
    watchSidePanelPresence();
  } catch (err) {
    logger?.warn('setupInPagePanel failed (non-fatal)', err);
  }
}

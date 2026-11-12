import { createLauncher, attachScrollBehaviour } from '../features/content/in-page-panel/launcher';
import { createPanel } from '../features/content/in-page-panel/panel';
import { isSidePanelPresenceMessage } from '../features/side-panel/panelPresence';
import type { PageAccess } from '../features/content/workerAccess';

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

/**
 * Inject the floating launcher + slide-in panel into the current page.
 *
 * Safe to call on any http/https page. Skips non-http(s) protocols and
 * idempotently does nothing if the launcher has already been injected.
 *
 * @param access What the service worker allows on this page: whether the
 *   origin is approved and whether the user left the in-page panel on. The
 *   content script asks once per document and shares that answer.
 * @param logger Optional logger with debug/warn methods (injected by content.ts
 *   to avoid circular imports).
 */
export async function setupInPagePanel(
  access: PageAccess | Promise<PageAccess>,
  logger?: {
    debug: (msg: string, ...args: unknown[]) => void;
    warn: (msg: string, ...args: unknown[]) => void;
  },
): Promise<void> {
  if (!/^https?:/.test(location.protocol)) return;

  if (document.querySelector('[data-agi-launcher]') || document.querySelector('[data-agi-panel]')) {
    return;
  }

  const { approved, inPagePanel } = await access;
  if (!approved) {
    logger?.debug('in-page panel skipped, origin not on user allowlist', {
      origin: window.location.origin,
    });
    return;
  }
  if (!inPagePanel) {
    logger?.debug('in-page panel turned off in settings');
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

    document.body.appendChild(launcherHost);

    attachScrollBehaviour(launcherHost);
    watchSidePanelPresence();
  } catch (err) {
    logger?.warn('setupInPagePanel failed (non-fatal)', err);
  }
}

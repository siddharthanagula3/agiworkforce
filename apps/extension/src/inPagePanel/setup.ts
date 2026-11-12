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

let presenceListenerRegistered = false;

function watchSidePanelPresence(): void {
  if (!presenceListenerRegistered) {
    presenceListenerRegistered = true;
    chrome.runtime.onMessage.addListener((message: unknown, sender) => {
      if (sender.id !== chrome.runtime.id || sender.tab || !isSidePanelPresenceMessage(message))
        return;
      realSidePanelOpen = message.open;
      applySidePanelPresence();
    });
  }
  void chrome.runtime
    .sendMessage({ type: 'GET_SIDE_PANEL_OPEN' })
    .then((response: { open?: boolean } | undefined) => {
      realSidePanelOpen = response?.open === true;
      applySidePanelPresence();
    })
    .catch(() => {});
}

interface MountedInPagePanel {
  readonly unmount: () => void;
}

let mounted: MountedInPagePanel | null = null;

function mountInPagePanel(): void {
  const panel = createPanel();
  document.body.appendChild(panel.host);

  const launcher = createLauncher(
    () => {
      panel.setReturnFocus(launcher.button);
      panel.toggle();
    },
    () => panel.close(),
  );
  document.body.appendChild(launcher.host);

  const detachScroll = attachScrollBehaviour(launcher.host);
  watchSidePanelPresence();
  mounted = {
    unmount: () => {
      detachScroll();
      panel.destroy();
      launcher.host.remove();
    },
  };
}

function unmountInPagePanel(): void {
  mounted?.unmount();
  mounted = null;
}

/**
 * Bring the floating launcher + slide-in panel in line with what the service
 * worker allows on this page: mounted when the origin is approved and the user
 * left the in-page panel on, removed otherwise. Safe to call again whenever the
 * answer changes. Skips non-http(s) protocols.
 *
 * @param access What the service worker allows on this page: whether the
 *   origin is approved and whether the user left the in-page panel on.
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

  const { approved, inPagePanel } = await access;
  if (!approved || !inPagePanel) {
    unmountInPagePanel();
    logger?.debug(
      approved
        ? 'in-page panel turned off in settings'
        : 'in-page panel skipped, origin not approved',
      { origin: window.location.origin },
    );
    return;
  }

  if (
    mounted ||
    document.querySelector('[data-agi-launcher]') ||
    document.querySelector('[data-agi-panel]')
  )
    return;

  try {
    mountInPagePanel();
  } catch (err) {
    logger?.warn('setupInPagePanel failed (non-fatal)', err);
  }
}

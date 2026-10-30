export const BROWSER_ACTIVITY_IDLE_MS = 60_000;

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'input', 'wheel', 'touchstart'] as const;

export interface BrowserActivityTracker {
  isActive(): boolean;
  subscribe(listener: () => void): () => void;
}

export function createBrowserActivityTracker(options: {
  document: Document;
  window: Window;
  idleMs?: number;
}): BrowserActivityTracker {
  const { document: page, window: view, idleMs = BROWSER_ACTIVITY_IDLE_MS } = options;
  const listeners = new Set<() => void>();
  let active = page.visibilityState === 'visible';
  let idleAt = Date.now() + idleMs;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function isActive(): boolean {
    return active && page.visibilityState === 'visible' && Date.now() < idleAt;
  }

  function publish(next: boolean): void {
    if (active === next) return;
    active = next;
    for (const listener of listeners) listener();
  }

  function pause(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    publish(false);
  }

  function engage(): void {
    if (page.visibilityState !== 'visible') return pause();
    if (!isActive()) active = false;
    idleAt = Date.now() + idleMs;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(pause, idleMs);
    publish(true);
  }

  function start(): void {
    for (const event of ACTIVITY_EVENTS) page.addEventListener(event, engage, { passive: true });
    page.addEventListener('visibilitychange', engage);
    view.addEventListener('focus', engage);
    view.addEventListener('blur', pause);
    engage();
  }

  function stop(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    for (const event of ACTIVITY_EVENTS) page.removeEventListener(event, engage);
    page.removeEventListener('visibilitychange', engage);
    view.removeEventListener('focus', engage);
    view.removeEventListener('blur', pause);
  }

  return {
    isActive,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
  };
}

let shared: { page: Document; tracker: BrowserActivityTracker } | null = null;

function browserActivity(): BrowserActivityTracker | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  if (shared?.page !== document) {
    shared = { page: document, tracker: createBrowserActivityTracker({ document, window }) };
  }
  return shared.tracker;
}

export function isBrowserUserActive(): boolean {
  return browserActivity()?.isActive() ?? false;
}

export function subscribeBrowserActivity(listener: () => void): () => void {
  return browserActivity()?.subscribe(listener) ?? (() => undefined);
}

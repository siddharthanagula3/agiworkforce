
export type OwnedCloudWindowKind = 'sign-in' | 'account' | 'billing' | 'connector-install';

export const PRESENTATION_MODE_STORAGE_KEY = 'agi.desktop.presentation-mode';

const CARD_ENTRY_HOSTS: ReadonlySet<string> = new Set([
  'checkout.stripe.com',
  'billing.stripe.com',
  'invoice.stripe.com',
]);

const presentationModeListeners = new Set<(enabled: boolean) => void>();

function readStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function isPresentationModeEnabled(): boolean {
  try {
    return readStorage()?.getItem(PRESENTATION_MODE_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function setPresentationModeEnabled(enabled: boolean): void {
  try {
    const storage = readStorage();
    if (storage) {
      if (enabled) storage.setItem(PRESENTATION_MODE_STORAGE_KEY, 'on');
      else storage.removeItem(PRESENTATION_MODE_STORAGE_KEY);
    }
  } catch {
    // A failed write must not break the toggle's listeners below; the next read
    // simply reports the unchanged value.
  }
  for (const listener of presentationModeListeners) listener(enabled);
}

export function subscribeToPresentationMode(listener: (enabled: boolean) => void): () => void {
  presentationModeListeners.add(listener);
  return () => {
    presentationModeListeners.delete(listener);
  };
}

function isCardEntryUrl(url: string): boolean {
  try {
    return CARD_ENTRY_HOSTS.has(new URL(url).hostname);
  } catch {
    return true;
  }
}

export function resolveContentProtection(kind: OwnedCloudWindowKind, url?: string): boolean {
  if (isPresentationModeEnabled()) return false;
  switch (kind) {
    case 'billing':
      return url === undefined ? true : isCardEntryUrl(url);
    case 'sign-in':
    case 'account':
    case 'connector-install':
      return false;
  }
}

export interface OwnedWindowPresentationRecord {
  label: string;
  kind: OwnedCloudWindowKind;
  contentProtected: boolean;
  openedAt: number;
}

declare global {
  interface Window {
    __agiOwnedCloudWindows?: Record<string, OwnedWindowPresentationRecord>;
  }
}

export function recordOwnedWindowPresentation(
  label: string,
  kind: OwnedCloudWindowKind,
  contentProtected: boolean,
): void {
  if (typeof window === 'undefined') return;
  const registry = window.__agiOwnedCloudWindows ?? {};
  registry[label] = { label, kind, contentProtected, openedAt: Date.now() };
  window.__agiOwnedCloudWindows = registry;
}

/**
 * Presentation policy for the Desktop-owned Cloud child windows.
 *
 * Tauri's `contentProtected` maps to `NSWindow.sharingType = .none` on macOS and
 * `WDA_EXCLUDEFROMCAPTURE` on Windows: the window renders BLACK (or is missing
 * entirely) in screen recorders and conferencing apps. Every owned Cloud window
 * used to set it unconditionally, so a screen-shared walkthrough showed the main
 * shell but not sign-in, billing, connector install, or any bridged settings
 * page.
 *
 * The rule this module encodes:
 *
 *   - Read/manage surfaces (`account`, `connector-install`) are NEVER protected.
 *     Nothing is typed into them that capture protection would defend; hiding
 *     them only breaks demos and screen-shared support sessions.
 *   - `sign-in` is NOT protected either. It is the first step of the founder
 *     demo, and the toggle below cannot rescue it: presentation mode lives in
 *     Cloud settings, which is unreachable until sign-in has already happened.
 *     The protection was also inconsistent — the main window renders every
 *     conversation, file, and API key with no capture protection at all, so
 *     excluding only the device-approval window bought little and cost the
 *     demo. Primary credentials remain owned by the remote page, exactly as
 *     they are in any browser tab the user would otherwise sign in from.
 *   - Stripe-hosted `billing` pages stay protected: a card number is the one
 *     value worth excluding from a recording, and it is never part of a demo.
 *   - "Presentation mode" is an explicit, user-visible opt-out that clears the
 *     remaining protection for as long as it is on, so even a billing
 *     walkthrough can be recorded. It is off by default and never toggles
 *     itself.
 *
 * The decision is a pure function so it can be unit-tested, and every window
 * that is actually opened records its resolved decision in a small diagnostic
 * registry (see `recordOwnedWindowPresentation`). That registry is what the
 * native wdio harness reads to prove a regression has not re-protected the demo
 * path — content protection has no getter in either the Tauri JS API or the
 * `NSWindow` bridge, so the decision has to be observable where it is made.
 */

export type OwnedCloudWindowKind = 'sign-in' | 'account' | 'billing' | 'connector-install';

/** Persisted with the other renderer-owned device preferences. */
export const PRESENTATION_MODE_STORAGE_KEY = 'agi.desktop.presentation-mode';

/**
 * Hosts that render a payment form. Stripe Checkout and the Stripe billing
 * portal both take card details; `agiworkforce.com` billing pages do not.
 */
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
    // Storage can throw in a locked-down webview; treat it as unavailable.
    return null;
  }
}

/**
 * True when the user has asked for a capturable session. Default false: the
 * secure posture is the one that ships, and the demo opt-in is explicit.
 */
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
    // An unparseable URL never reaches window creation (each opener validates
    // first), but fail closed here rather than assuming it is safe to capture.
    return true;
  }
}

/**
 * Resolves whether an owned Cloud window should be excluded from screen capture.
 *
 * `url` is only consulted for `billing`, which is the one kind that serves both
 * a card-entry surface (Stripe) and an ordinary account page.
 */
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
    /**
     * Diagnostic registry of the owned Cloud windows this session has opened and
     * the capture-protection decision each was created with. Read by support
     * ("why is the billing window black on my recording?") and asserted by
     * `apps/desktop/wdio/specs/cloud-settings-tour.spec.ts`. It holds no URLs
     * with credentials and no account data.
     */
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

/**
 * The three browser sessions a task can run in, named so that no surface has to
 * infer one from the other's absence.
 *
 *   `user-chrome`  the person's own Chrome, driven through the extension. Their
 *                  profile, their cookies, their windows: everything a run does
 *                  is visible to them and dies with the browser they closed.
 *   `built-in`     the webview the desktop app hosts itself. Separate from the
 *                  person's Chrome, but still their machine and still gone when
 *                  the app quits.
 *   `cloud`        a remote isolated browser with its own cookie jar that keeps
 *                  running after the client disconnects.
 *
 * The cloud backend is NOT deployed. It is declared here with
 * `available: false` and a reason on purpose: a caller that asks for a cloud
 * session must be refused in words, never quietly handed the person's own
 * Chrome, which would run the task in their logged-in profile and leave its
 * traces there. {@link resolveBrowserSession} is the only sanctioned way to turn
 * a request into a session, and it refuses rather than substitutes.
 */

export const BROWSER_SESSION_KINDS = ['user-chrome', 'built-in', 'cloud'] as const;

export type BrowserSessionKind = (typeof BROWSER_SESSION_KINDS)[number];

export interface BrowserSessionCapability {
  readonly kind: BrowserSessionKind;
  readonly available: boolean;
  readonly isolatedProfile: boolean;
  readonly survivesClientDisconnect: boolean;
  readonly unavailableReason?: string;
}

export const CLOUD_BROWSER_UNAVAILABLE_REASON =
  'The cloud browser is not available yet. Run this in the built-in browser, or in your own ' +
  'Chrome through the AGI extension.';

export const BROWSER_SESSION_CAPABILITIES: Readonly<
  Record<BrowserSessionKind, BrowserSessionCapability>
> = {
  'user-chrome': {
    kind: 'user-chrome',
    available: true,
    isolatedProfile: false,
    survivesClientDisconnect: false,
  },
  'built-in': {
    kind: 'built-in',
    available: true,
    isolatedProfile: true,
    survivesClientDisconnect: false,
  },
  cloud: {
    kind: 'cloud',
    available: false,
    isolatedProfile: true,
    survivesClientDisconnect: true,
    unavailableReason: CLOUD_BROWSER_UNAVAILABLE_REASON,
  },
};

export function isBrowserSessionKind(value: unknown): value is BrowserSessionKind {
  return typeof value === 'string' && (BROWSER_SESSION_KINDS as readonly string[]).includes(value);
}

export function browserSessionCapability(kind: BrowserSessionKind): BrowserSessionCapability {
  return BROWSER_SESSION_CAPABILITIES[kind];
}

export interface BrowserSessionResolved {
  readonly ok: true;
  readonly capability: BrowserSessionCapability;
}

export interface BrowserSessionRefused {
  readonly ok: false;
  readonly reason: string;
}

export type BrowserSessionResolution = BrowserSessionResolved | BrowserSessionRefused;

export function resolveBrowserSession(kind: unknown): BrowserSessionResolution {
  if (!isBrowserSessionKind(kind)) {
    return { ok: false, reason: `"${String(kind)}" is not a browser session kind.` };
  }
  const capability = browserSessionCapability(kind);
  if (!capability.available) {
    return { ok: false, reason: capability.unavailableReason ?? `${kind} is not available.` };
  }
  return { ok: true, capability };
}

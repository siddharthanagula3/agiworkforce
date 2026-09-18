/**
 * One chooser for the three browser sessions in `browser-session.ts`, shared by
 * the Chrome extension, the desktop shell and the cloud caller so that the same
 * request resolves the same way whichever surface asks.
 *
 * The rule that makes it safe: an explicit choice sets a ceiling on how much of
 * the person's data the run may touch, and no fallback may rise above it. A task
 * that asked for an isolated session is refused in words rather than dropped
 * into the signed-in Chrome profile it was deliberately kept out of.
 */

import {
  BROWSER_SESSION_KINDS,
  browserSessionCapability,
  resolveBrowserSession,
  type BrowserSessionCapability,
  type BrowserSessionKind,
} from './browser-session';

/**
 * How much of the person's own world a session can reach. `user-profile` sees
 * their cookies and signed-in sites; `isolated-local` has its own profile but
 * still runs on their machine, so localhost and the intranet are in reach;
 * `isolated-remote` has neither.
 */
export const BROWSER_SITE_ACCESS = ['isolated-remote', 'isolated-local', 'user-profile'] as const;

export type BrowserSiteAccess = (typeof BROWSER_SITE_ACCESS)[number];

const SITE_ACCESS: Readonly<Record<BrowserSessionKind, BrowserSiteAccess>> = {
  'user-chrome': 'user-profile',
  'built-in': 'isolated-local',
  cloud: 'isolated-remote',
};

/** Least privilege first, so an unconstrained request lands on the narrowest session that works. */
export const BROWSER_SELECTION_ORDER: readonly BrowserSessionKind[] = [
  'cloud',
  'built-in',
  'user-chrome',
];

export function browserSiteAccess(kind: BrowserSessionKind): BrowserSiteAccess {
  return SITE_ACCESS[kind];
}

export function browserSiteAccessRank(kind: BrowserSessionKind): number {
  return BROWSER_SITE_ACCESS.indexOf(SITE_ACCESS[kind]);
}

/** True when running in `candidate` would reach more of the person's data than `chosen`. */
export function broadensSiteAccess(
  chosen: BrowserSessionKind,
  candidate: BrowserSessionKind,
): boolean {
  return browserSiteAccessRank(candidate) > browserSiteAccessRank(chosen);
}

export type BrowserDeclineReason =
  'not-allowed-by-policy' | 'not-present-on-this-surface' | 'unavailable' | 'would-broaden-access';

export interface BrowserDeclined {
  readonly kind: BrowserSessionKind;
  readonly reason: BrowserDeclineReason;
  readonly message: string;
}

export interface BrowserSelectionRequest {
  /** The session the user or the task asked for. Absent means "pick for me". */
  readonly requested?: BrowserSessionKind | null;
  /** Kinds this account or workspace policy permits. Absent means all three. */
  readonly allowed?: readonly BrowserSessionKind[];
  /** Kinds this surface can actually drive right now. */
  readonly present: readonly BrowserSessionKind[];
}

export interface BrowserSelected {
  readonly ok: true;
  readonly kind: BrowserSessionKind;
  readonly capability: BrowserSessionCapability;
  readonly siteAccess: BrowserSiteAccess;
  /** True when the request named a different kind and this one stands in for it. */
  readonly viaFallback: boolean;
  readonly reason: string;
  readonly declined: readonly BrowserDeclined[];
}

export interface BrowserSelectionRefused {
  readonly ok: false;
  readonly reason: string;
  readonly declined: readonly BrowserDeclined[];
}

export type BrowserSelection = BrowserSelected | BrowserSelectionRefused;

const LABELS: Readonly<Record<BrowserSessionKind, string>> = {
  'user-chrome': 'your own Chrome',
  'built-in': 'the built-in browser',
  cloud: 'the cloud browser',
};

export function browserSessionLabel(kind: BrowserSessionKind): string {
  return LABELS[kind];
}

function candidateOrder(requested: BrowserSessionKind | null): readonly BrowserSessionKind[] {
  if (!requested) return BROWSER_SELECTION_ORDER;
  return [requested, ...BROWSER_SELECTION_ORDER.filter((kind) => kind !== requested)];
}

function declineMessage(kind: BrowserSessionKind, reason: BrowserDeclineReason): string {
  switch (reason) {
    case 'not-allowed-by-policy':
      return `${LABELS[kind]} is not permitted by your workspace policy.`;
    case 'not-present-on-this-surface':
      return `${LABELS[kind]} is not connected here.`;
    case 'would-broaden-access':
      return `${LABELS[kind]} would reach more of your data than the session you asked for.`;
    default:
      return `${LABELS[kind]} is not available.`;
  }
}

/**
 * Picks the session to run in, or refuses and says why for every kind it passed
 * over. A refusal is a result, not an error: the caller shows the reasons.
 */
export function selectBrowser(request: BrowserSelectionRequest): BrowserSelection {
  const requested = request.requested ?? null;
  const allowed = request.allowed ?? BROWSER_SESSION_KINDS;
  const declined: BrowserDeclined[] = [];

  for (const kind of candidateOrder(requested)) {
    const isFallback = requested !== null && kind !== requested;

    if (!allowed.includes(kind)) {
      declined.push({
        kind,
        reason: 'not-allowed-by-policy',
        message: declineMessage(kind, 'not-allowed-by-policy'),
      });
      continue;
    }
    if (isFallback && requested && broadensSiteAccess(requested, kind)) {
      declined.push({
        kind,
        reason: 'would-broaden-access',
        message: declineMessage(kind, 'would-broaden-access'),
      });
      continue;
    }
    const resolution = resolveBrowserSession(kind);
    if (!resolution.ok) {
      declined.push({ kind, reason: 'unavailable', message: resolution.reason });
      continue;
    }
    if (!request.present.includes(kind)) {
      declined.push({
        kind,
        reason: 'not-present-on-this-surface',
        message: declineMessage(kind, 'not-present-on-this-surface'),
      });
      continue;
    }

    return {
      ok: true,
      kind,
      capability: browserSessionCapability(kind),
      siteAccess: SITE_ACCESS[kind],
      viaFallback: isFallback,
      reason: isFallback
        ? `${LABELS[requested]} could not run this, so it runs in ${LABELS[kind]}, which reaches no more of your data.`
        : `Running in ${LABELS[kind]}.`,
      declined,
    };
  }

  return {
    ok: false,
    reason: requested
      ? `${LABELS[requested]} could not run this, and no narrower session is available.`
      : 'No browser session is available to run this.',
    declined,
  };
}

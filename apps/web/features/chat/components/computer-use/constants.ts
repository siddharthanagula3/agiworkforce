import type { DiscoverableSurfaceCapability, SourceSurface } from '@agiworkforce/types';

export const COMPUTER_USE_CAPABILITY: DiscoverableSurfaceCapability = 'computer-use';
export const BROWSER_CONTROL_SURFACE: SourceSurface = 'web';

export const EXECUTOR_LINKS: Partial<Record<SourceSurface, string>> = {
  desktop: '/download',
  chrome: '/chrome-extension',
};

export const BROWSER_CONTROL_MENU = {
  badge: 'Not on web',
} as const;

export const BROWSER_CONTROL_COPY = {
  title: 'Computer use does not run on this page',
  lead: 'A computer-use session drives a real machine — screenshots, clicks, keystrokes. A web page cannot take that control, so this surface can describe such a task but never execute one.',
  handoffUnavailable:
    'This page also cannot start one somewhere else. Nothing on agiworkforce.com can reach the desktop app or the extension, so there is no button here that would finish the job in another window.',
  runsInLabel: 'Runs in',
  hereLabel: 'On this page',
  sendsLabel: 'What it sends when it runs',
  sends:
    'Each step sends the conversation and a fresh screenshot of the controlled screen to whichever model that client is pointed at. Screenshots are not redacted, so anything visible on screen travels with the picture of it.',
  planLabel: 'Your plan',
  billedLabel: 'Billed for this',
  billed: 'Nothing. This page sent no request and reserved no session.',
  planBlocked: 'Computer use is not part of your plan.',
  planUnknown: 'Your plan has not loaded yet, so its computer-use entitlement is unknown here.',
  planIncluded: 'Computer use is part of your plan, on the clients that can run it.',
  dismiss: 'Close',
} as const;

export function executorCtaLabel(surfaceLabel: string): string {
  return `Get the ${surfaceLabel}`;
}

export const BROWSER_CONTROL_TEST_IDS = {
  menuRow: 'browser-control-menu-row',
  dialog: 'browser-control-dialog',
  executorRow: 'browser-control-executor',
  hereLine: 'browser-control-here-line',
  planLine: 'browser-control-plan-line',
  billedLine: 'browser-control-billed-line',
  primaryCta: 'browser-control-primary-cta',
} as const;

export function executorTestId(surface: SourceSurface): string {
  return `${BROWSER_CONTROL_TEST_IDS.executorRow}-${surface}`;
}
